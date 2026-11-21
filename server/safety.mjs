export const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const DOCUMENT_TYPES = new Set([
  'prescription',
  'lab_report',
  'scan',
  'discharge_summary',
  'bill',
  'vaccination',
  'other',
]);

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function cleanText(value, limit = 4000) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, limit);
}

export function cleanList(value, limit = 16, itemLimit = 120) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === 'string').map(item => cleanText(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

export function isSupportedDocument(mimeType, byteLength) {
  return SUPPORTED_MIME_TYPES.has(String(mimeType || '').toLowerCase()) && Number.isFinite(byteLength) && byteLength > 0 && byteLength <= 15 * 1024 * 1024;
}

export function normalizeAnalysisResult(input, fileName = 'Medical record') {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rawType = cleanText(value.document_type || value.documentType, 40).toLowerCase();
  const documentType = DOCUMENT_TYPES.has(rawType) ? rawType : 'other';
  const rawDate = cleanText(value.record_date || value.recordDate, 32);
  const recordDate = isValidISODate(rawDate) ? rawDate : null;
  const rawConfidence = Number(value.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : null;
  const candidateSummary = cleanText(value.summary, 1200);

  // Summaries must describe the page, not turn extracted text into medical advice or diagnostic conclusions.
  const unsafeSummary = /\b(you have|you may have|you likely have|diagnos(?:is|ed|e)|normal|abnormal|serious condition|should (?:start|stop|take|avoid|increase|decrease)|take this medicine|stop taking|change your dose|increase your dose|decrease your dose|treatment recommendation)\b/i.test(candidateSummary);
  const safeSummary = unsafeSummary ? 'Document contents were extracted for review. Please check the original document for exact details.' : candidateSummary;

  const rawLabValues = Array.isArray(value.lab_values) ? value.lab_values : Array.isArray(value.labValues) ? value.labValues : [];
  const labValues = rawLabValues.slice(0, 100).map(item => ({
    name: cleanText(item?.name, 120) || 'Unlabelled test',
    value: cleanText(item?.value, 100) || 'unclear',
    unit: cleanText(item?.unit, 40),
    referenceRange: cleanText(item?.reference_range || item?.referenceRange, 100),
    reportMarker: cleanText(item?.report_marker || item?.reportMarker, 40),
    date: isValidISODate(cleanText(item?.date, 32)) ? cleanText(item?.date, 32) : '',
  }));

  const rawStructured = Array.isArray(value.structured_medicines) ? value.structured_medicines : Array.isArray(value.structuredMedicines) ? value.structuredMedicines : [];
  const structuredMedicines = rawStructured.slice(0, 80).map(item => ({
    raw: cleanText(item?.raw || item?.name, 140),
    brandName: cleanText(item?.brandName || item?.brand_name || item?.name, 100),
    genericName: cleanText(item?.genericName || item?.generic_name, 120),
    dosageForm: cleanText(item?.dosageForm || item?.dosage_form || item?.form, 40) || 'Tablet',
    strength: cleanText(item?.strength, 60) || 'Unspecified',
    frequency: cleanText(item?.frequency, 60) || 'As advised',
    duration: cleanText(item?.duration, 60) || 'As advised',
    instructions: cleanText(item?.instructions, 100) || 'Standard administration',
    category: cleanText(item?.category, 100) || 'Prescription medication',
    rxcui: item?.rxcui ? String(item.rxcui).slice(0, 32) : null,
    verificationStatus: ['verified_catalogue', 'verified_rxnorm', 'fuzzy_match', 'unverified'].includes(item?.verificationStatus || item?.verification_status)
      ? (item?.verificationStatus || item?.verification_status)
      : 'unverified',
    confidence: Number.isFinite(Number(item?.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : 0.5,
    consensusSupported: Boolean(item?.consensusSupported ?? item?.consensus_supported ?? true),
    flags: cleanList(item?.flags, 5, 140),
  }));

  return {
    title: cleanText(value.title, 160) || cleanText(fileName, 160) || 'Medical record',
    documentType,
    recordDate,
    doctorName: cleanText(value.doctor_name || value.doctorName, 140) || null,
    hospitalName: cleanText(value.hospital_name || value.hospitalName, 180) || null,
    summary: safeSummary,
    extractedText: cleanText(value.extracted_text || value.extractedText, 20000),
    tags: cleanList(value.tags, 15, 50),
    medicines: cleanList(value.medicines, 80, 140),
    structuredMedicines,
    labValues,
    confidence,
  };
}

// Trap question patterns that must always be redirected calmly to a clinician.
export const ADVICE_TRAP_PATTERNS = [
  /\b(do i have|am i having|could i have|am i suffering from|is this|is that|is it|is my|are my|could this be)\b.{0,60}\b(diabetes|cancer|tumor|tumour|heart attack|stroke|kidney disease|infection|hypertension|serious|dangerous|bad|normal|abnormal)\b/i,
  /\b(should i|can i|may i|do i need to)\b.{0,30}\b(stop|start|skip|change|increase|decrease|take|double|discontinue)\b.{0,35}\b(medicine|medication|tablet|dose|pill|drug|insulin|antibiotic|steroid)?\b/i,
  /\b(what dose|how much should i take|how many tablets|is it safe to take|treat my|cure my|diagnose me|is this serious|am i cured)\b/i,
  /\b(can i stop (?:this|my) (?:tablet|medicine|medication|pill))\b/i,
  /\b(is (?:this|it) cancer)\b/i,
  /\b(do i have diabetes)\b/i,
];

export const EMERGENCY_PATTERNS = [
  /\b(chest pain|shortness of breath|can't breathe|cannot breathe|difficulty breathing|stroke|unconscious|passed out|severe bleeding|heavy bleeding|coughing blood|poisoning|overdose|suicid|heart attack)\b/i,
];

export function isEmergencyQuestion(query) {
  if (typeof query !== 'string') return false;
  return EMERGENCY_PATTERNS.some(re => re.test(query));
}

export function isMedicalAdviceQuestion(query) {
  if (typeof query !== 'string') return false;
  return ADVICE_TRAP_PATTERNS.some(re => re.test(query));
}

export const TRUSTED_MEDICAL_GLOSSARY = {
  // Common medications & generic classes (purpose described neutrally)
  metformin: {
    name: 'Metformin',
    category: 'medicine',
    purpose: 'Commonly used to help manage blood sugar levels in type 2 diabetes.',
    description: 'Metformin belongs to the biguanide class. It helps lower glucose production in the liver and improves the body’s sensitivity to insulin.',
    source: 'MedlinePlus / U.S. National Library of Medicine',
    url: 'https://medlineplus.gov/druginfo/meds/a696005.html',
  },
  atorvastatin: {
    name: 'Atorvastatin',
    category: 'medicine',
    purpose: 'Commonly used to lower cholesterol and reduce cardiovascular risk.',
    description: 'Atorvastatin is a statin medication that works by slowing cholesterol production in the liver.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a600045.html',
  },
  amlodipine: {
    name: 'Amlodipine',
    category: 'medicine',
    purpose: 'Commonly used for blood pressure management and chest pain (angina).',
    description: 'Amlodipine is a calcium channel blocker that relaxes and widens blood vessels so blood flows more easily.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a692044.html',
  },
  losartan: {
    name: 'Losartan',
    category: 'medicine',
    purpose: 'Commonly used to treat high blood pressure and protect kidney function in diabetic patients.',
    description: 'Losartan is an angiotensin II receptor blocker (ARB) that helps keep blood vessels relaxed.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a695008.html',
  },
  levothyroxine: {
    name: 'Levothyroxine',
    category: 'medicine',
    purpose: 'Commonly used as replacement hormone therapy for an underactive thyroid (hypothyroidism).',
    description: 'Levothyroxine replaces or supplements the thyroxine hormone normally produced by the thyroid gland.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a682461.html',
  },
  omeprazole: {
    name: 'Omeprazole',
    category: 'medicine',
    purpose: 'Commonly used for acid reflux, heartburn, and stomach ulcers.',
    description: 'Omeprazole is a proton pump inhibitor (PPI) that decreases the amount of acid made in the stomach.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a693050.html',
  },
  pantoprazole: {
    name: 'Pantoprazole',
    category: 'medicine',
    purpose: 'Commonly used to decrease excess stomach acid and treat gastroesophageal reflux.',
    description: 'Pantoprazole is a proton pump inhibitor that reduces acid secretion in the stomach lining.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a601246.html',
  },
  amoxicillin: {
    name: 'Amoxicillin',
    category: 'medicine',
    purpose: 'An antibiotic commonly used to treat bacterial infections.',
    description: 'Amoxicillin is a penicillin-class antibiotic that stops the growth of certain bacteria. It does not treat viral infections like colds or flu.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a685001.html',
  },
  paracetamol: {
    name: 'Paracetamol (Acetaminophen)',
    category: 'medicine',
    purpose: 'Commonly used for mild-to-moderate pain relief and fever reduction.',
    description: 'Paracetamol works primarily in the central nervous system to relieve aches and reduce body temperature during a fever.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a681004.html',
  },
  acetaminophen: {
    name: 'Acetaminophen (Paracetamol)',
    category: 'medicine',
    purpose: 'Commonly used for pain relief and reducing fever.',
    description: 'An analgesic and antipyretic medication used for temporary relief of headaches, aches, and fever.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a681004.html',
  },
  ibuprofen: {
    name: 'Ibuprofen',
    category: 'medicine',
    purpose: 'A nonsteroidal anti-inflammatory drug (NSAID) used for pain relief, fever, and inflammation.',
    description: 'Ibuprofen relieves pain and inflammation by blocking enzymes (COX) that produce prostaglandins.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a682159.html',
  },
  cetirizine: {
    name: 'Cetirizine',
    category: 'medicine',
    purpose: 'An antihistamine commonly used for allergy symptoms like sneezing, runny nose, and hives.',
    description: 'Cetirizine blocks histamine, a natural substance your body produces during an allergic reaction.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a698026.html',
  },
  azithromycin: {
    name: 'Azithromycin',
    category: 'medicine',
    purpose: 'A macrolide antibiotic commonly prescribed for certain bacterial infections.',
    description: 'Azithromycin inhibits bacterial protein synthesis, preventing bacteria from multiplying.',
    source: 'MedlinePlus',
    url: 'https://medlineplus.gov/druginfo/meds/a697037.html',
  },

  // Common lab tests
  hemoglobin: {
    name: 'Hemoglobin (Hb)',
    category: 'lab_test',
    purpose: 'Measures the amount of oxygen-carrying protein inside red blood cells.',
    description: 'Hemoglobin is an iron-rich protein that transports oxygen from the lungs to tissues throughout the body.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-test/',
  },
  haemoglobin: {
    name: 'Hemoglobin (Hb)',
    category: 'lab_test',
    purpose: 'Measures the amount of oxygen-carrying protein inside red blood cells.',
    description: 'Hemoglobin is an iron-rich protein that transports oxygen from the lungs to tissues throughout the body.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-test/',
  },
  hba1c: {
    name: 'HbA1c (Glycated Hemoglobin)',
    category: 'lab_test',
    purpose: 'Measures the average percentage of blood sugar attached to hemoglobin over the past 2–3 months.',
    description: 'HbA1c reflects medium-term glucose levels because glucose stays attached to red blood cells for their ~120-day lifespan.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/',
  },
  glucose: {
    name: 'Fasting Blood Glucose / Blood Sugar',
    category: 'lab_test',
    purpose: 'Measures the concentration of glucose in the bloodstream at the time of the blood draw.',
    description: 'Glucose is the primary sugar that cells use for fuel. Values are compared with laboratory-specific printed reference ranges.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/blood-glucose-test/',
  },
  tsh: {
    name: 'TSH (Thyroid Stimulating Hormone)',
    category: 'lab_test',
    purpose: 'Measures the hormone produced by the pituitary gland that instructs the thyroid gland to produce thyroxine.',
    description: 'TSH tests help doctors evaluate how actively the thyroid is functioning. Results must be interpreted in clinical context alongside T3/T4.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/',
  },
  creatinine: {
    name: 'Serum Creatinine',
    category: 'lab_test',
    purpose: 'Measures a normal waste product from muscle breakdown that healthy kidneys filter out of the blood.',
    description: 'Creatinine levels in the blood help clinicians assess kidney filtration capacity (eGFR).',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/creatinine-test/',
  },
  platelets: {
    name: 'Platelet Count',
    category: 'lab_test',
    purpose: 'Measures the number of tiny cell fragments in blood that help form clots and stop bleeding.',
    description: 'Platelets adhere to damaged blood vessel walls and clump together to initiate normal blood clotting.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/platelet-tests/',
  },
  cholesterol: {
    name: 'Lipid Profile / Total Cholesterol',
    category: 'lab_test',
    purpose: 'Measures fats (lipids) in the blood, including total cholesterol, LDL, HDL, and triglycerides.',
    description: 'Cholesterol is a waxy substance used to build cell membranes and hormones. Reports typically print separate reference limits for each component.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/cholesterol-levels/',
  },
  alt: {
    name: 'ALT / SGPT (Alanine Aminotransferase)',
    category: 'lab_test',
    purpose: 'Measures an enzyme found mainly in the liver.',
    description: 'ALT is released into the bloodstream when liver cells are stressed or injured. Results are evaluated alongside printed ranges.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/alt-blood-test/',
  },
  ast: {
    name: 'AST / SGOT (Aspartate Aminotransferase)',
    category: 'lab_test',
    purpose: 'Measures an enzyme found in the liver, heart, and muscle tissue.',
    description: 'AST is evaluated alongside ALT to provide clinical insight into liver and muscle health.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/ast-test/',
  },
  'vitamin d': {
    name: '25-Hydroxy Vitamin D',
    category: 'lab_test',
    purpose: 'Measures the circulating level of vitamin D in the blood.',
    description: 'Vitamin D is essential for calcium absorption, bone strength, and immune function.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/vitamin-d-test/',
  },
  'vitamin b12': {
    name: 'Vitamin B12 (Cobalamin)',
    category: 'lab_test',
    purpose: 'Measures the level of vitamin B12, important for nerve function and red blood cell production.',
    description: 'Vitamin B12 is a nutrient absorbed from food that supports cellular energy and nervous system health.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/vitamin-b-test/',
  },
};

export function lookupMedicalGlossary(query) {
  if (!query || typeof query !== 'string') return null;
  const normalized = query.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
  if (TRUSTED_MEDICAL_GLOSSARY[normalized]) return TRUSTED_MEDICAL_GLOSSARY[normalized];
  for (const [key, item] of Object.entries(TRUSTED_MEDICAL_GLOSSARY)) {
    if (normalized.includes(key) || key.includes(normalized)) return item;
  }
  return null;
}
