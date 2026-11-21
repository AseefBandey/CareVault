import type { MedicalRecord } from './types';

const ADVICE_TRAPS = [
  /\b(do i have|am i having|could i have|am i suffering from|is this|is that|is it|is my|are my|could this be)\b.{0,60}\b(diabetes|cancer|tumor|tumour|heart attack|stroke|kidney disease|infection|hypertension|serious|dangerous|bad|normal|abnormal)\b/i,
  /\b(should i|can i|may i|do i need to)\b.{0,30}\b(stop|start|skip|change|increase|decrease|take|double|discontinue)\b.{0,35}\b(medicine|medication|tablet|dose|pill|drug|insulin|antibiotic|steroid)?\b/i,
  /\b(what dose|how much should i take|how many tablets|is it safe to take|treat my|cure my|diagnose me|is this serious|am i cured)\b/i,
  /\b(can i stop (?:this|my) (?:tablet|medicine|medication|pill))\b/i,
  /\b(is (?:this|it) cancer)\b/i,
  /\b(do i have diabetes)\b/i,
];

const EMERGENCY = /\b(chest pain|shortness of breath|can't breathe|cannot breathe|difficulty breathing|stroke|unconscious|passed out|severe bleeding|heavy bleeding|coughing blood|poisoning|overdose|suicid|heart attack)\b/i;

export type SafetyResponse = { answer: string; sources: MedicalRecord[]; redirected: boolean; emergency: boolean };

export function isMedicalAdviceQuestion(question: string): boolean {
  return ADVICE_TRAPS.some(re => re.test(question));
}

export function answerFromRecords(question: string, records: MedicalRecord[]): SafetyResponse {
  const q = question.trim();
  if (EMERGENCY.test(q)) {
    return {
      answer: 'If you or someone else may be in immediate danger or having a medical emergency, contact local emergency services or visit the nearest clinic immediately. CareVault is an organizer, not an emergency clinical service.',
      sources: [],
      redirected: true,
      emergency: true,
    };
  }
  if (isMedicalAdviceQuestion(q)) {
    return {
      answer: "That is a question for your doctor. I can help you find your records for your appointment, but CareVault cannot diagnose a condition, evaluate whether a result is dangerous, or advise you to start, stop, or change a medicine.",
      sources: [],
      redirected: true,
      emergency: false,
    };
  }
  const terms = q.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(t => t.length > 2);
  const expansions: Record<string, string[]> = {
    sugar: ['glucose', 'hba1c', 'a1c', 'fbs', 'fasting glucose'],
    thyroid: ['tsh', 't3', 't4', 'thyroid', 'levothyroxine'],
    medicine: ['medicines', 'prescription', 'tablet'],
    pressure: ['blood pressure', 'bp', 'hypertension', 'amlodipine', 'losartan'],
    cholesterol: ['lipid', 'triglycerides', 'ldl', 'hdl', 'atorvastatin'],
    doctor: ['doctor', 'hospital', 'clinic'],
  };
  const expanded = new Set(terms.flatMap(t => [t, ...(expansions[t] || [])]));
  const sources = records.map(r => {
    const content = [
      r.title, r.doctorName, r.hospitalName, r.summary, r.extractedText,
      ...r.tags, ...r.medicines,
      ...r.labValues.map(v => `${v.name} ${v.value} ${v.unit || ''}`),
    ].join(' ').toLowerCase();
    const score = [...expanded].reduce((n, term) => n + (content.includes(term) ? (term.length > 4 ? 2 : 1) : 0), 0);
    return { r, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(x => x.r);

  if (!sources.length) {
    return {
      answer: "I couldn't find this in your records. CareVault answers strictly from your saved records and never guesses. Try searching by doctor name, date, or test title.",
      sources: [],
      redirected: false,
      emergency: false,
    };
  }
  return {
    answer: `I found ${sources.length} matching record${sources.length === 1 ? '' : 's'} in your vault. Review the original documents for complete details:`,
    sources,
    redirected: false,
    emergency: false,
  };
}

export const TRUSTED_GLOSSARY: Record<string, { description: string; source: string; url: string }> = {
  // Medicines (purpose described neutrally, pharmacist tone)
  metformin: {
    description: 'Metformin is commonly used to help manage blood sugar levels in type 2 diabetes. It works by reducing glucose production in the liver and improving body insulin sensitivity.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a696005.html',
  },
  atorvastatin: {
    description: 'Atorvastatin is commonly used to lower blood cholesterol levels and decrease cardiovascular risk. It slows cholesterol production in the liver.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a600045.html',
  },
  amlodipine: {
    description: 'Amlodipine is commonly used for blood pressure management and chest pain. It relaxes blood vessel walls to improve blood flow.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a692044.html',
  },
  losartan: {
    description: 'Losartan is commonly used to manage high blood pressure and protect kidney function in diabetic patients. It blocks angiotensin II receptors.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a695008.html',
  },
  levothyroxine: {
    description: 'Levothyroxine is commonly used as thyroid hormone replacement for an underactive thyroid gland (hypothyroidism).',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a682461.html',
  },
  omeprazole: {
    description: 'Omeprazole is commonly used for heartburn, acid reflux, and stomach ulcers by decreasing stomach acid production.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a693050.html',
  },
  pantoprazole: {
    description: 'Pantoprazole is a proton pump inhibitor commonly used to reduce excess stomach acid and treat reflux symptoms.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a601246.html',
  },
  amoxicillin: {
    description: 'Amoxicillin is a penicillin-class antibiotic commonly prescribed for certain bacterial infections. It does not treat viral infections.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a685001.html',
  },
  paracetamol: {
    description: 'Paracetamol (acetaminophen) is commonly used for temporary relief of mild-to-moderate pain and reducing fever.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a681004.html',
  },
  acetaminophen: {
    description: 'Acetaminophen (paracetamol) is commonly used for pain relief and fever reduction.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a681004.html',
  },
  ibuprofen: {
    description: 'Ibuprofen is an NSAID commonly used to relieve mild-to-moderate pain, fever, and swelling.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a682159.html',
  },
  cetirizine: {
    description: 'Cetirizine is an antihistamine commonly used for allergic symptoms such as sneezing, itchy eyes, and runny nose.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a698026.html',
  },
  azithromycin: {
    description: 'Azithromycin is an antibiotic commonly prescribed for bacterial infections of the respiratory tract, ears, and skin.',
    source: 'MedlinePlus / U.S. NLM',
    url: 'https://medlineplus.gov/druginfo/meds/a697037.html',
  },

  // Lab tests
  haemoglobin: {
    description: 'Hemoglobin is an iron-containing protein in red blood cells that transports oxygen throughout the body.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-test/',
  },
  hemoglobin: {
    description: 'Hemoglobin is an iron-containing protein in red blood cells that transports oxygen throughout the body.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-test/',
  },
  hba1c: {
    description: 'The HbA1c test measures the average percentage of blood glucose attached to hemoglobin over the previous 2 to 3 months.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/',
  },
  tsh: {
    description: 'TSH (Thyroid Stimulating Hormone) is produced by the pituitary gland to regulate thyroid hormone production.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/tsh-thyroid-stimulating-hormone-test/',
  },
  glucose: {
    description: 'Blood glucose measures the concentration of sugar in the blood. Printed reference ranges vary by whether the sample was fasting or random.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/blood-glucose-test/',
  },
  creatinine: {
    description: 'Serum creatinine is a muscle metabolism byproduct filtered by the kidneys, used to help assess renal filtration rate.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/creatinine-test/',
  },
  platelets: {
    description: 'Platelets are cell fragments that clump together to help blood clot and prevent bleeding.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/platelet-tests/',
  },
  cholesterol: {
    description: 'Lipid panels measure circulating fats including total cholesterol, LDL, HDL, and triglycerides.',
    source: 'MedlinePlus Lab Tests',
    url: 'https://medlineplus.gov/lab-tests/cholesterol-levels/',
  },
};

export function lookupGlossary(term: string) {
  const key = term.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  if (TRUSTED_GLOSSARY[key]) return TRUSTED_GLOSSARY[key];
  for (const [k, v] of Object.entries(TRUSTED_GLOSSARY)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}
