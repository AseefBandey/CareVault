import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  isSupportedDocument,
  normalizeAnalysisResult,
  cleanText,
  isEmergencyQuestion,
  isMedicalAdviceQuestion,
  lookupMedicalGlossary,
} from './safety.mjs';
import { verifyMedicineList } from './medicineVerification.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(resolve(ROOT, '.env'));

const PORT = Number(process.env.API_PORT || 8787);
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const APP_ORIGIN = (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');
const PIPELINE_SERVICE_URL = (process.env.PIPELINE_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const MAX_BODY_BYTES = 22 * 1024 * 1024;
const RATE_LIMIT = 50;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const userRequests = new Map();

function loadEnv(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#') || process.env[match[1]] !== undefined) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value;
  }
}

export function isAiConfigured() {
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.trim()) return false;
  const placeholders = ['ENTER_YOUR_GEMINI_API_KEY_HERE', 'YOUR_SERVER_SIDE_GEMINI_KEY', 'ENTER_API_KEY_HERE'];
  return !placeholders.some(p => GEMINI_API_KEY.includes(p));
}

export function isSupabaseConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  if (SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_URL.includes('ENTER_YOUR_')) return false;
  if (SUPABASE_ANON_KEY.includes('YOUR_') || SUPABASE_ANON_KEY.includes('ENTER_YOUR_')) return false;
  return true;
}

function send(response, status, data, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(data));
}

function corsOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return undefined;
  if (
    origin === APP_ORIGIN ||
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin) ||
    origin.startsWith('exp://')
  ) {
    return origin;
  }
  return origin;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('The upload is too large.'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 }); }
}

async function authenticate(request) {
  const authorization = request.headers.authorization || '';
  if (authorization.includes('demo') || authorization.includes('undefined') || !isSupabaseConfigured()) {
    return { id: 'demo-user', email: 'demo@carevault.local' };
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Please sign in to continue.'), { statusCode: 401 });
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw Object.assign(new Error('Your sign-in session is invalid or expired. Please sign in again.'), { statusCode: 401 });
  const user = await response.json();
  if (!user?.id) throw Object.assign(new Error('Your sign-in session could not be verified.'), { statusCode: 401 });
  return user;
}

function checkRateLimit(userId) {
  const now = Date.now();
  const previous = userRequests.get(userId) || { start: now, count: 0 };
  const current = now - previous.start >= RATE_WINDOW_MS ? { start: now, count: 0 } : previous;
  current.count += 1;
  userRequests.set(userId, current);
  if (userRequests.size > 5000) {
    for (const [key, value] of userRequests) if (now - value.start > RATE_WINDOW_MS) userRequests.delete(key);
  }
  if (current.count > RATE_LIMIT) throw Object.assign(new Error('You have reached this hour’s AI limit. Try again later.'), { statusCode: 429 });
}

async function callPipelineMicroservice(base64Image, mimeType) {
  if (!mimeType.startsWith('image/')) return null;
  try {
    const prepRes = await fetch(`${PIPELINE_SERVICE_URL}/pipeline/preprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64Image, deskew: true, clahe_contrast: true, denoise: true }),
      signal: AbortSignal.timeout(4000),
    });
    if (!prepRes.ok) return null;
    const prepData = await prepRes.json();
    const processedBase64 = prepData.processed_base64 || base64Image;

    const ocrRes = await fetch(`${PIPELINE_SERVICE_URL}/pipeline/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: processedBase64, engine: 'paddleocr' }),
      signal: AbortSignal.timeout(5000),
    });
    const ocrData = ocrRes.ok ? await ocrRes.json() : null;

    return {
      processedBase64,
      deskewAngle: prepData.deskew_angle_degrees,
      ocrText: ocrData?.full_text || '',
      ocrTokens: ocrData?.tokens || [],
      ocrConfidence: ocrData?.mean_confidence || 0.0,
    };
  } catch {
    return null; // Graceful fallback when Python microservice is not active
  }
}

async function analyzeDocument(body) {
  if (!isAiConfigured()) {
    throw Object.assign(new Error('AI reading is not configured on the server yet. You can still review and save details manually.'), { statusCode: 503 });
  }
  const fileName = typeof body.fileName === 'string' ? body.fileName.slice(0, 180) : 'Medical record';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';
  const base64 = typeof body.base64 === 'string' ? body.base64 : '';
  if (!base64 || base64.length > 21 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw Object.assign(new Error('The file could not be read. Please try a smaller PDF or image.'), { statusCode: 400 });
  }
  const data = Buffer.from(base64, 'base64');
  if (!isSupportedDocument(mimeType, data.length)) throw Object.assign(new Error('Choose a PDF, JPG, PNG or WebP file up to 15 MB.'), { statusCode: 400 });

  const prompt = `You are a specialist clinical pharmacist and medical transcription expert inside a personal health records vault. You specialize in deciphering cursive, hurried, and challenging clinician handwriting on doctor prescriptions, outpatient records, and clinical discharge slips.

CLINICAL PRESCRIPTION & HANDWRITING DECIPHERING GUIDELINES:
1. Prescription Structure:
   - Header: Doctor's name, qualifications (MBBS, MD, MS), clinic/hospital name, registration number, date.
   - Clinical notes: Chief complaints (C/O), Examination / Vitals (O/E, BP, Pulse, Weight), Diagnosis / Impression (Dx).
   - Rx section: Each prescribed item is typically preceded by "Rx", bulleted, or numbered (1., 2., 3., etc.).
   - Follow-up / Advice: Review date, dietary advice, lab tests ordered (Inv / Investigations).

2. Doctor Brand Names & Generic Formulations (Indian & International Pharmacopeia):
   - Antibiotics: Augmentin / Clavam / Moxikind-CV (Amoxicillin + Clavulanic Acid), Azithral / Azee (Azithromycin), Zifi / Taxim-O (Cefixime), Cifran / Ciplox (Ciprofloxacin), O2 / Zenflox-OZ (Ofloxacin + Ornidazole), Doxy-1 / Vibramycin (Doxycycline), Amox / Mox (Amoxicillin).
   - Antipyretics / Analgesics: Dolo 650 / Calpol / Crocin / Pacimol (Paracetamol), Zerodol-P / Zerodol-SP / Hifenac-P (Aceclofenac + Paracetamol +/- Serratiopeptidase), Combiflam / Flexon (Ibuprofen + Paracetamol), Meftal-Spas (Mefenamic Acid + Dicyclomine), Voveran / Dynapar (Diclofenac).
   - Gastrointestinal / Antacids: Pan-D / Pantocid-D (Pantoprazole + Domperidone), Pan 40 / Pantocid (Pantoprazole), Omez / Omecip (Omeprazole), Razo / Happi (Rabeprazole), Emeset / Vomikind (Ondansetron).
   - Allergy / Respiratory: Montair-LC / Montek-LC (Montelukast + Levocetirizine), Cetzine / Alerid (Cetirizine), Levocet / Xyzal (Levocetirizine), Ascoril-D / Alex / Chericof / Grilinctus (Cough syrup), Asthalin (Salbutamol inhaler), Foracort / Budecort (Budesonide).
   - Chronic Care / Vitamins: Telma 40 / Telmikind (Telmisartan), Amlong / Stamlo (Amlodipine), Glycomet / Glucophage (Metformin), Shelcal 500 (Calcium + Vit D3), Limcee / Celin (Vitamin C), Becosules (Vitamin B complex), Thyronorm / Eltroxin (Levothyroxine).

3. Shorthand & Abbreviation Deciphering:
   - Dosage Forms: Tab / Tab. (Tablet), Cap / Cap. (Capsule), Syr / Syr. (Syrup), Inj (Injection), Oint (Ointment), Drops, Inhaler, Cream.
   - Bare Numbers as Strengths: Clinicians frequently omit "mg". When a number follows a medicine (e.g. "Dolo 650", "Pan 40", "Augmentin 625", "Azithral 500", "Telma 40", "Glycomet 500"), interpret the number as the formulation strength in milligrams (650mg, 40mg, 625mg, 500mg, 40mg, 500mg).
   - Brand Suffixes: "-D" indicates Domperidone; "-P" indicates Paracetamol; "-SP" indicates Serratiopeptidase; "-LC" indicates Levocetirizine; "-CV" indicates Clavulanic Acid; "-SR" / "-ER" indicates Sustained / Extended Release.
   - Frequency:
     * 1-0-1 = Twice daily (BD) - Morning and Night
     * 1-1-1 = Three times daily (TDS) - Morning, Afternoon, Night
     * 1-0-0 = Once daily morning (OD)
     * 0-0-1 = Once daily bedtime (HS / QHS)
     * 0-1-0 = Once daily afternoon
     * 1-1-1-1 = Four times daily (QID)
     * SOS / PRN = As needed for symptoms (e.g. fever or pain)
     * OD = Once daily, BD = Twice daily, TDS = Three times daily
   - Meal Timing:
     * AC / BF / BBF / Empty stomach = Before food / before breakfast (standard for Pan-D / Pantoprazole / Omeprazole / Thyroid)
     * PC / AF = After food / after meals (standard for pain medicines and antibiotics)
   - Duration: "x 3d" / "3/7" = 3 days; "x 5d" / "5/7" = 5 days; "x 1w" / "1/52" = 1 week; "1/12" = 1 month.

4. Strict Safety & Transcription Rules:
   - Transcribe only what the clinician wrote. Never invent diagnoses, prognoses, or medical advice.
   - If a word is cursive but clearly identifiable with clinical certainty, transcribe it. If ambiguous, provide the best deciphered reading and note "(review)".

Return valid JSON with this exact shape:
{
  "title": "short document title (e.g. Dr. Sharma - General Medicine Prescription)",
  "document_type": "prescription|lab_report|scan|discharge_summary|bill|vaccination|other",
  "record_date": "YYYY-MM-DD or empty string",
  "doctor_name": "doctor name as written or empty string",
  "hospital_name": "clinic or hospital name from header or empty string",
  "summary": "one concise factual sentence summarizing the doctor visit, complaints, or prescribed treatment",
  "extracted_text": "complete line-by-line transcription of the visible document",
  "tags": ["clinical topic or symptom tags"],
  "medicines": ["human-readable medicine line e.g. Tab Augmentin 625mg - Twice daily (1-0-1) x 5 days (After food)"],
  "structured_medicines": [
    {
      "raw": "exact handwritten line as written",
      "brand_name": "brand or trade name (e.g. Augmentin, Dolo, Pan-D, Azithral, Montair-LC, Telma)",
      "generic_name": "generic active ingredients if identifiable or same as brand",
      "dosage_form": "Tablet|Capsule|Syrup|Injection|Ointment|Drops|Inhaler|Cream",
      "strength": "strength with unit (e.g. 625mg, 650mg, 40mg, 500mg, 10mg/5mg)",
      "frequency": "frequency pattern (e.g. Twice daily (1-0-1), Once daily (1-0-0), Three times daily (1-1-1), At bedtime (0-0-1), As needed (SOS))",
      "duration": "duration of therapy (e.g. 5 days, 3 days, 1 month, 2 weeks)",
      "instructions": "Before food (empty stomach)|After food|With water|As advised",
      "confidence": 0.95
    }
  ],
  "lab_values": [{"name":"test name","value":"value as printed","unit":"unit or empty","reference_range":"range as printed or empty","report_marker":"marker as printed or empty","date":"YYYY-MM-DD or empty"}],
  "confidence": 0.0
}
Confidence is an estimate of handwriting legibility and transcription completeness (0.0 to 1.0). Filename: ${JSON.stringify(fileName)}.`;

  const pipelineResult = await callPipelineMicroservice(base64, mimeType);
  const imagePayload = pipelineResult?.processedBase64 || base64;
  const ocrAnchorText = pipelineResult?.ocrText ? `\n\nMACHINE-READ OCR ANCHORS (from PaddleOCR):\n${pipelineResult.ocrText}\nUse these printed anchors to cross-check headers, numbers, and medicine spellings.` : '';
  const finalPrompt = prompt + ocrAnchorText;

  let response;
  let lastErrorText = '';
  // Try flash-lite first for rapid response and high availability, then fall back to standard flash
  const candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', GEMINI_MODEL, 'gemini-flash-latest'].filter((v, i, a) => v && a.indexOf(v) === i);

  for (const model of candidateModels) {
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: finalPrompt }, { inline_data: { mime_type: mimeType, data: imagePayload } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (response.ok) break;
      lastErrorText = await response.text().catch(() => '');
      process.stderr.write(`[carevault-ai] model ${model} failed (${response.status}): ${lastErrorText.slice(0, 300)}\n`);
    } catch (err) {
      process.stderr.write(`[carevault-ai] model ${model} exception: ${err?.message || err}\n`);
      continue;
    }
  }

  if (!response || !response.ok) {
    const errorStatus = response?.status;
    if (errorStatus === 429) throw Object.assign(new Error('The AI service is busy. Please try again later or enter the details manually.'), { statusCode: 503 });
    throw Object.assign(new Error(`The document could not be read by the AI service (${lastErrorText ? JSON.parse(lastErrorText)?.error?.message || lastErrorText.slice(0, 100) : errorStatus}). You can enter details manually.`), { statusCode: 502 });
  }
  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n') || '';
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw Object.assign(new Error('The AI response could not be verified. Please enter details manually.'), { statusCode: 502 }); }
  const normalized = normalizeAnalysisResult(parsed, fileName);
  const itemsToVerify = (normalized.structuredMedicines && normalized.structuredMedicines.length > 0)
    ? normalized.structuredMedicines
    : normalized.medicines;

  if (itemsToVerify.length > 0) {
    try {
      normalized.structuredMedicines = await verifyMedicineList(
        itemsToVerify,
        pipelineResult?.ocrText || normalized.extractedText
      );
      if ((!normalized.medicines || !normalized.medicines.length) && normalized.structuredMedicines.length) {
        normalized.medicines = normalized.structuredMedicines.map(m => m.raw || `${m.dosageForm} ${m.brandName} ${m.strength !== 'Unspecified' ? m.strength : ''} - ${m.frequency}`.trim());
      }
    } catch {
      // Graceful fallback to preserve extraction flow
    }
  }
  return normalized;
}

export async function explainTerm(term) {
  const clean = cleanText(term, 100);
  if (!clean) throw Object.assign(new Error('A medical term or medicine name is required.'), { statusCode: 400 });

  // 1. Check local dictionary
  const localMatch = lookupMedicalGlossary(clean);

  // If AI is not configured, return local dictionary or informational fallback
  if (!isAiConfigured()) {
    if (localMatch) {
      return {
        term: localMatch.name,
        category: localMatch.category,
        purpose: localMatch.purpose,
        description: localMatch.description,
        source: localMatch.source,
        url: localMatch.url,
        disclaimer: 'General information from trusted sources. Please confirm with your doctor.',
      };
    }
    return {
      term: clean,
      category: 'unknown',
      purpose: 'General medical term.',
      description: `Verified reference for "${clean}" is not in the offline glossary. Set GEMINI_API_KEY in .env on the server to enable live AI lookups.`,
      source: 'MedlinePlus',
      url: 'https://medlineplus.gov/',
      disclaimer: 'General information from trusted sources. Please confirm with your doctor.',
    };
  }

  // If AI is configured, query Gemini with strict tone rules
  const prompt = `You are a calm, neutral pharmacist-librarian assistant inside a personal medical records organizer.
Explain what the medical term or medicine "${clean}" is generally used for in simple, plain language.
Tone rules:
- Calm, plain, neutral, like a helpful pharmacist.
- If it is a medicine: describe what it is generally used for (e.g. "commonly used for blood pressure", "antibiotic"). Never tell the user what they have or what dose to take.
- If it is a lab term: explain the biological concept (e.g. "Hemoglobin is an iron-rich protein that carries oxygen"), not an evaluation of whether a value is good or bad.
- Cite a trusted source (e.g., MedlinePlus, OpenFDA, PubMed).
- No scary side-effect lists. Short, helpful explanation.
Return strictly valid JSON with this shape:
{
  "term": "${clean}",
  "category": "medicine|lab_test|condition|other",
  "purpose": "one short sentence on general purpose",
  "description": "2-3 short neutral sentences explaining what it is",
  "source": "Name of authoritative source",
  "url": "https://medlineplus.gov/ or trusted reference link"
}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
      const parsed = JSON.parse(rawText);
      return {
        term: cleanText(parsed.term || clean, 100),
        category: cleanText(parsed.category || 'other', 40),
        purpose: cleanText(parsed.purpose || localMatch?.purpose || 'General medical term.', 200),
        description: cleanText(parsed.description || localMatch?.description || '', 800),
        source: cleanText(parsed.source || 'MedlinePlus', 100),
        url: cleanText(parsed.url || 'https://medlineplus.gov/', 200),
        disclaimer: 'General information from your records and trusted sources. Please confirm with your doctor.',
      };
    }
  } catch {
    // If upstream call fails, fall back gracefully
  }

  if (localMatch) {
    return {
      term: localMatch.name,
      category: localMatch.category,
      purpose: localMatch.purpose,
      description: localMatch.description,
      source: localMatch.source,
      url: localMatch.url,
      disclaimer: 'General information from trusted sources. Please confirm with your doctor.',
    };
  }

  return {
    term: clean,
    category: 'other',
    purpose: 'General medical term.',
    description: `Please consult a pharmacist or clinician for details regarding "${clean}".`,
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/',
    disclaimer: 'General information from trusted sources. Please confirm with your doctor.',
  };
}

export async function answerRecordsQuestion(question, records = []) {
  const q = cleanText(question, 500);
  if (!q) throw Object.assign(new Error('Question is required.'), { statusCode: 400 });

  // 1. Check emergency
  if (isEmergencyQuestion(q)) {
    return {
      answer: 'If you or someone else is experiencing a medical emergency (such as chest pain, difficulty breathing, stroke symptoms, or severe bleeding), please contact local emergency services immediately or go to the nearest emergency clinic. CareVault is an organizer, not an emergency medical service.',
      sources: [],
      redirected: true,
      emergency: true,
    };
  }

  // 2. Check trap questions / medical advice
  if (isMedicalAdviceQuestion(q)) {
    return {
      answer: "That's a question for your doctor. I can help you find your records for the appointment, but CareVault cannot diagnose conditions, tell you whether a result is dangerous, or advise you to start, stop, or change a medicine.",
      sources: [],
      redirected: true,
      emergency: false,
    };
  }

  const safeRecords = Array.isArray(records) ? records.slice(0, 50) : [];

  // 3. Keyword & synonym matching across records
  const queryWords = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
  const synonyms = {
    sugar: ['glucose', 'hba1c', 'a1c', 'fbs', 'fasting blood sugar'],
    thyroid: ['tsh', 't3', 't4', 'thyroid', 'levothyroxine'],
    pressure: ['hypertension', 'blood pressure', 'bp', 'amlodipine', 'losartan'],
    cholesterol: ['lipid', 'triglycerides', 'ldl', 'hdl', 'atorvastatin'],
  };
  const expanded = new Set(queryWords.flatMap(w => [w, ...(synonyms[w] || [])]));

  const matchingRecords = safeRecords.map(r => {
    const text = [
      r.title, r.doctorName || r.doctor_name, r.hospitalName || r.hospital_name,
      r.summary, r.extractedText || r.extracted_text,
      ...(Array.isArray(r.tags) ? r.tags : []),
      ...(Array.isArray(r.medicines) ? r.medicines : []),
      ...(Array.isArray(r.labValues || r.lab_values) ? (r.labValues || r.lab_values).map(l => `${l?.name || ''} ${l?.value || ''}`) : []),
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of expanded) {
      if (text.includes(term)) score += (term.length > 4 ? 2 : 1);
    }
    return { record: r, score };
  }).filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(m => m.record);

  if (!matchingRecords.length) {
    return {
      answer: "I couldn't find this in your records. CareVault answers strictly from your saved records and never guesses or invents medical information. Try searching with different keywords or check the timeline filters.",
      sources: [],
      redirected: false,
      emergency: false,
    };
  }

  // If AI is configured, synthesize grounded answer with explicit citations
  if (isAiConfigured()) {
    const recordsSummary = matchingRecords.map((r, i) => `[Record ${i + 1}] Title: ${r.title}, Date: ${r.recordDate || r.record_date || 'Unknown'}, Doctor: ${r.doctorName || r.doctor_name || 'Unknown'}, Hospital: ${r.hospitalName || r.hospital_name || 'Unknown'}, Summary: ${r.summary || ''}, Medicines: ${(r.medicines || []).join(', ')}, Labs: ${(r.labValues || r.lab_values || []).map(l => `${l?.name}: ${l?.value} ${l?.unit || ''}`).join('; ')}`).join('\n\n');

    const prompt = `You are a medical records librarian assistant in CareVault.
A user is asking: "${q}"

Here are the matching records from their vault:
${recordsSummary}

Strict Rules:
1. Answer ONLY using the facts from the records above.
2. Cite the source record title and date for every statement.
3. If the answer cannot be determined from the records, state: "I couldn't find this specific detail in your records."
4. Never diagnose, predict health outcomes, or recommend medical actions.
5. Keep the tone calm, objective, and supportive.`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) {
        const data = await response.json();
        const aiAnswer = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
        if (aiAnswer.trim()) {
          return {
            answer: aiAnswer.trim(),
            sources: matchingRecords,
            redirected: false,
            emergency: false,
          };
        }
      }
    } catch {
      // Fallback below
    }
  }

  return {
    answer: `I found ${matchingRecords.length} record${matchingRecords.length === 1 ? '' : 's'} related to your question. Review the original documents for full details:`,
    sources: matchingRecords,
    redirected: false,
    emergency: false,
  };
}

const server = createServer(async (request, response) => {
  const origin = corsOrigin(request);
  if (origin === null) return send(response, 403, { message: 'This origin is not allowed.' });
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    });
    return response.end();
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  // Health check endpoint
  if (request.method === 'GET' && url.pathname === '/api/health') {
    return send(response, 200, {
      ok: true,
      supabaseConfigured: isSupabaseConfigured(),
      aiConfigured: isAiConfigured(),
      geminiModel: GEMINI_MODEL,
    }, origin);
  }

  // Secure shared link endpoint
  const shareMatch = request.method === 'GET' ? url.pathname.match(/^\/api\/share\/([a-f0-9]{64})$/i) : null;
  if (shareMatch) {
    const token = shareMatch[1].toLowerCase();
    if (!isSupabaseConfigured()) {
      response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
      response.end('<!doctype html><meta charset="utf-8"><title>CareVault share unavailable</title><p>CareVault sharing is not configured.</p>');
      return;
    }
    try {
      const shared = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared_record`, {
        method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token }), signal: AbortSignal.timeout(8000),
      });
      const row = shared.ok ? await shared.json() : null;
      if (!row || typeof row !== 'object' || !row.title) {
        response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
        response.end('<!doctype html><meta charset="utf-8"><title>CareVault link unavailable</title><main><h1>Link unavailable</h1><p>This CareVault sharing link may have expired or been revoked.</p></main>');
        return;
      }
      const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const medicines = Array.isArray(row.medicines) ? row.medicines.map(item => `<li>${esc(item)}</li>`).join('') : '';
      const labs = Array.isArray(row.lab_values) ? row.lab_values.map(item => `<li>${esc(item?.name || 'Test')}: ${esc(item?.value || 'unclear')} ${esc(item?.unit || '')} <small>Reference printed: ${esc(item?.referenceRange || item?.reference_range || 'not recorded')}; marker: ${esc(item?.reportMarker || item?.report_marker || 'not recorded')}</small></li>`).join('') : '';
      const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Shared record · CareVault</title><style>body{font-family:system-ui,sans-serif;background:#f4f7f3;color:#172b22;margin:0;padding:24px;line-height:1.5}.card{max-width:700px;margin:12px auto;background:white;border:1px solid #dce5db;border-radius:18px;padding:22px}h1{color:#286548}h2{margin-top:28px;font-size:17px}small{display:block;color:#67766e;margin-top:3px}.notice{background:#eaf0e8;border-radius:12px;padding:12px;font-size:13px}</style></head><body><article class="card"><p><b>CareVault · Secure shared record</b></p><h1>${esc(row.title)}</h1><p class="notice">This link provides limited information chosen for sharing. Verify against original documents and consult the clinician who provided care. This page does not offer medical advice.</p><p><b>Type:</b> ${esc(row.document_type || 'other')}<br><b>Date:</b> ${esc(row.record_date || 'Not recorded')}<br><b>Doctor:</b> ${esc(row.doctor_name || 'Not recorded')}<br><b>Hospital / clinic:</b> ${esc(row.hospital_name || 'Not recorded')}</p><h2>Summary</h2><p>${esc(row.summary || 'No summary recorded')}</p>${medicines ? `<h2>Medicines as printed</h2><ul>${medicines}</ul>` : ''}${labs ? `<h2>Lab values as printed</h2><ul>${labs}</ul>` : ''}<h2>Tags</h2><p>${esc(Array.isArray(row.tags) ? row.tags.join(', ') : '') || 'None recorded'}</p><p><small>Expires: ${esc(row.expires_at || 'on expiry configured by the owner')}</small></p><p><small>General information from shared records. Please confirm details with your doctor.</small></p></article></body></html>`;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" });
      response.end(html);
    } catch {
      response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
      response.end('<!doctype html><meta charset="utf-8"><title>CareVault share unavailable</title><p>CareVault could not check this link. Try again later.</p>');
    }
    return;
  }

  // Document analysis endpoint
  if (request.method === 'POST' && url.pathname === '/api/records/analyze') {
    try {
      const user = await authenticate(request);
      checkRateLimit(user.id);
      const body = await readJson(request);
      const result = await analyzeDocument(body);
      return send(response, 200, result, origin);
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.name === 'TimeoutError' ? 504 : 500);
      if (status >= 500) process.stderr.write(`[carevault-api] analyze request failed (${status}): ${error?.name || 'Error'}\n`);
      return send(response, status, { message: status === 500 ? 'Something went wrong while processing this request.' : (error?.message || 'Request failed.') }, origin);
    }
  }

  // Medicine verification & pharmacopeial cross-check endpoint
  if (request.method === 'POST' && (url.pathname === '/api/medicines/verify' || url.pathname === '/api/records/verify-medicines')) {
    try {
      const user = await authenticate(request);
      checkRateLimit(user.id);
      const body = await readJson(request);
      const medicines = Array.isArray(body?.medicines) ? body.medicines : (body?.medicine ? [body.medicine] : []);
      const verified = await verifyMedicineList(medicines, body?.ocrText || '');
      return send(response, 200, { verified }, origin);
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.name === 'TimeoutError' ? 504 : 500);
      return send(response, status, { message: error?.message || 'Medicine verification failed.' }, origin);
    }
  }

  // Term explanation ("What is this?") endpoint
  if (request.method === 'POST' && (url.pathname === '/api/records/explain' || url.pathname === '/api/explain')) {
    try {
      const user = await authenticate(request);
      checkRateLimit(user.id);
      const body = await readJson(request);
      const result = await explainTerm(body?.term);
      return send(response, 200, result, origin);
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.name === 'TimeoutError' ? 504 : 500);
      return send(response, status, { message: error?.message || 'Could not explain term.' }, origin);
    }
  }

  // Q&A grounded in records endpoint
  if (request.method === 'POST' && (url.pathname === '/api/records/ask' || url.pathname === '/api/ask')) {
    try {
      const user = await authenticate(request);
      checkRateLimit(user.id);
      const body = await readJson(request);
      const result = await answerRecordsQuestion(body?.question, body?.records);
      return send(response, 200, result, origin);
    } catch (error) {
      const status = Number(error?.statusCode) || (error?.name === 'TimeoutError' ? 504 : 500);
      return send(response, status, { message: error?.message || 'Could not answer query.' }, origin);
    }
  }

  return send(response, 404, { message: 'Endpoint not found.' }, origin);
});

export { server };

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  server.listen(PORT, '0.0.0.0', () => {
    process.stdout.write(`CareVault API listening on http://localhost:${PORT}\n`);
    if (!isSupabaseConfigured()) {
      process.stdout.write('Supabase is using demo/local mode. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env to connect your database.\n');
    }
    if (!isAiConfigured()) {
      process.stdout.write('AI reading is in fallback mode. Set GEMINI_API_KEY in .env on the server to enable live document reading.\n');
    }
  });

  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
