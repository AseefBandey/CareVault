import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRawMedicineLine,
  calculateLevenshteinSimilarity,
  lookupCatalogue,
  validateStrength,
  checkOcrConsensus,
  verifyMedicine,
  verifyMedicineList,
} from './medicineVerification.mjs';

test('parseRawMedicineLine extracts structured clinical fields cleanly', () => {
  const line = 'Tab Augmentin 625mg - 1-0-1 x 5 days (after food)';
  const parsed = parseRawMedicineLine(line);

  assert.equal(parsed.form, 'Tablet');
  assert.equal(parsed.strength, '625mg');
  assert.ok(parsed.name.toLowerCase().includes('augmentin'));
  assert.equal(parsed.frequency, 'Twice daily (1-0-1)');
  assert.equal(parsed.duration, '5 days');
  assert.equal(parsed.instructions, 'After food');
});

test('parseRawMedicineLine handles syrup, SOS, and before-food timing', () => {
  const line = 'Syr Calpol 250mg/5ml - SOS (with water)';
  const parsed = parseRawMedicineLine(line);

  assert.equal(parsed.form, 'Syrup');
  assert.equal(parsed.strength, '250mg/5ml');
  assert.equal(parsed.frequency, 'As needed (SOS)');
  assert.equal(parsed.instructions, 'With water');
});

test('calculateLevenshteinSimilarity returns 1 for identical and sensible fractional distance for typos', () => {
  assert.equal(calculateLevenshteinSimilarity('Augmentin', 'Augmentin'), 1.0);
  assert.equal(calculateLevenshteinSimilarity('', ''), 1.0);
  assert.equal(calculateLevenshteinSimilarity('Augmentin', ''), 0.0);

  // Common handwriting typo / OCR drop
  const sim = calculateLevenshteinSimilarity('Augmentin', 'Augmentn');
  assert.ok(sim >= 0.85);

  const lowSim = calculateLevenshteinSimilarity('Metformin', 'Amlodipine');
  assert.ok(lowSim < 0.4);
});

test('lookupCatalogue resolves brand names to generic concepts', () => {
  const aug = lookupCatalogue('Augmentin');
  assert.ok(aug);
  assert.equal(aug.entry.generic, 'Amoxicillin + Clavulanic Acid');
  assert.equal(aug.entry.rxcui, '706857');

  const dolo = lookupCatalogue('Dolo 650');
  assert.ok(dolo);
  assert.equal(dolo.entry.generic, 'Paracetamol');

  const panD = lookupCatalogue('Pan-D');
  assert.ok(panD);
  assert.equal(panD.entry.generic, 'Pantoprazole + Domperidone');
});

test('lookupCatalogue performs fuzzy matching for doctor handwriting variations', () => {
  // Handwriting abbreviation / OCR error
  const match = lookupCatalogue('Augmentn');
  assert.ok(match);
  assert.equal(match.matchedName, 'Augmentin');
  assert.ok(match.score >= 0.80);
});

test('validateStrength flags anomalous dosages and approves standard strengths', () => {
  const standard = ['375mg', '625mg', '1000mg'];

  const normalCheck = validateStrength('625mg', standard);
  assert.equal(normalCheck.valid, true);
  assert.equal(normalCheck.warning, null);

  const abnormalCheck = validateStrength('6250mg', standard);
  assert.equal(abnormalCheck.valid, false);
  assert.ok(abnormalCheck.warning.includes('Unusual strength'));
});

test('checkOcrConsensus verifies text presence and warns on unsupported hallucinations', () => {
  const ocrText = 'Rx: Dr. Sharma Clinic. Patient John Doe. AUGMENTIN 625 MG TDS x 5 days. PAN 40 1-0-0';

  const present = checkOcrConsensus('Augmentin', ocrText);
  assert.equal(present.supported, true);
  assert.ok(present.score >= 0.9);

  // Medicine not present on the prescription
  const hallucinated = checkOcrConsensus('Morphine Sulfate', ocrText);
  assert.equal(hallucinated.supported, false);
  assert.ok(hallucinated.reason.includes('not detected in the machine-read OCR text'));
});

test('verifyMedicine returns complete structured validation object with confidence scoring', async () => {
  const rawLine = 'Tab Augmentin 625mg - 1-0-1 x 5 days (after food)';
  const ocrText = 'Rx AUGMENTIN 625MG tab 1-0-1 x 5d after food';

  const result = await verifyMedicine(rawLine, ocrText);

  assert.equal(result.brandName, 'Augmentin');
  assert.equal(result.genericName, 'Amoxicillin + Clavulanic Acid');
  assert.equal(result.dosageForm, 'Tablet');
  assert.equal(result.strength, '625mg');
  assert.equal(result.verificationStatus, 'verified_catalogue');
  assert.ok(result.confidence >= 0.90);
  assert.equal(result.consensusSupported, true);
  assert.equal(result.flags.length, 0);
});

test('verifyMedicine flags hallucinated drug with reduced confidence and warning note', async () => {
  const rawLine = 'Tab Atorvastatin 40mg - 0-0-1';
  const ocrText = 'Only syrup paracetamol was written on this slip';

  const result = await verifyMedicine(rawLine, ocrText);

  assert.equal(result.consensusSupported, false);
  assert.ok(result.flags.some(f => f.includes('not detected in the machine-read OCR text')));
  assert.ok(result.confidence < 0.80);
});

test('verifyMedicineList verifies multiple items correctly', async () => {
  const list = [
    'Tab Pan 40 - 1-0-0 before food',
    'Tab Dolo 650 - SOS',
  ];
  const ocr = 'PAN 40 BD, DOLO 650';

  const results = await verifyMedicineList(list, ocr);
  assert.equal(results.length, 2);
  assert.equal(results[0].genericName, 'Pantoprazole');
  assert.equal(results[1].genericName, 'Paracetamol');
});
