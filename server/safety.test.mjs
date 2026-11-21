import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSupportedDocument,
  normalizeAnalysisResult,
  isMedicalAdviceQuestion,
  isEmergencyQuestion,
  lookupMedicalGlossary,
} from './safety.mjs';
import { explainTerm, answerRecordsQuestion } from './index.mjs';

test('only supported document formats and files up to 15 MB are accepted', () => {
  assert.equal(isSupportedDocument('application/pdf', 1024), true);
  assert.equal(isSupportedDocument('image/jpeg', 1024), true);
  assert.equal(isSupportedDocument('image/heic', 1024), false);
  assert.equal(isSupportedDocument('application/pdf', 15 * 1024 * 1024 + 1), false);
  assert.equal(isSupportedDocument('application/pdf', 0), false);
});

test('analysis normalizer fails closed on unknown categories and dates', () => {
  const result = normalizeAnalysisResult({ document_type: 'diagnosis', record_date: 'tomorrow', confidence: 3 }, 'visit.pdf');
  assert.equal(result.documentType, 'other');
  assert.equal(result.recordDate, null);
  assert.equal(result.confidence, 1);
  assert.equal(result.title, 'visit.pdf');
});

test('analysis text is bounded and malformed values become empty or unclear', () => {
  const result = normalizeAnalysisResult({
    title: '  test\u0000 file  ',
    extracted_text: 'x'.repeat(30000),
    tags: ['one', 'one', 4, 'two'],
    lab_values: [{ name: '', value: null, reference_range: 'range' }],
  });
  assert.equal(result.title, 'test file');
  assert.equal(result.extractedText.length, 20000);
  assert.deepEqual(result.tags, ['one', 'two']);
  assert.equal(result.labValues[0].name, 'Unlabelled test');
  assert.equal(result.labValues[0].value, 'unclear');
});

test('unsafe medical conclusions in an AI summary are replaced with neutral wording', () => {
  const result = normalizeAnalysisResult({ summary: 'You have diabetes and your glucose result is abnormal. You should start treatment.' });
  assert.equal(result.summary, 'Document contents were extracted for review. Please check the original document for exact details.');
});

test('calendar-invalid dates are rejected rather than accepted by shape alone', () => {
  const result = normalizeAnalysisResult({
    title: 'Date edge case',
    record_date: '2026-02-30',
    lab_values: [{ name: 'Test', value: '1', date: '2026-13-01' }],
  });
  assert.equal(result.recordDate, null);
  assert.equal(result.labValues[0].date, '');
});

test('valid leap-day dates are retained', () => {
  const result = normalizeAnalysisResult({
    title: 'Leap day',
    record_date: '2024-02-29',
    lab_values: [{ name: 'Test', value: '1', date: '2024-02-29' }],
  });
  assert.equal(result.recordDate, '2024-02-29');
  assert.equal(result.labValues[0].date, '2024-02-29');
});

test('trap questions are correctly identified as medical advice traps', () => {
  const trapQuestions = [
    'Do I have diabetes?',
    'Can I stop this tablet?',
    'Can I stop my medication?',
    'Is this cancer?',
    'Should I take 500mg of Metformin?',
    'Can I double my dose?',
    'Is my glucose result dangerous?',
    'What dose should I take?',
    'Diagnose me based on this test',
  ];

  for (const q of trapQuestions) {
    assert.equal(isMedicalAdviceQuestion(q), true, `Expected "${q}" to be detected as medical advice trap`);
  }

  // Factual search queries should NOT trigger medical advice traps
  const safeQueries = [
    'my last thyroid test',
    '2024 blood reports',
    'Dr. Sharma prescription',
    'HbA1c test results',
    'hospital bills from October',
  ];

  for (const q of safeQueries) {
    assert.equal(isMedicalAdviceQuestion(q), false, `Expected "${q}" NOT to be detected as medical advice trap`);
  }
});

test('emergency questions are identified accurately', () => {
  assert.equal(isEmergencyQuestion('I am having severe chest pain right now'), true);
  assert.equal(isEmergencyQuestion('Cannot breathe, difficulty breathing'), true);
  assert.equal(isEmergencyQuestion('Where is my cholesterol report?'), false);
});

test('trusted medical glossary lookup returns verified definitions', () => {
  const metformin = lookupMedicalGlossary('Metformin');
  assert.ok(metformin);
  assert.equal(metformin.name, 'Metformin');
  assert.ok(metformin.source.includes('MedlinePlus'));

  const tsh = lookupMedicalGlossary('TSH');
  assert.ok(tsh);
  assert.equal(tsh.category, 'lab_test');

  const unknown = lookupMedicalGlossary('completely_fictional_compound_xyz');
  assert.equal(unknown, null);
});

test('answerRecordsQuestion redirects trap questions safely without calling AI', async () => {
  const response = await answerRecordsQuestion('Do I have diabetes?', []);
  assert.equal(response.redirected, true);
  assert.equal(response.emergency, false);
  assert.ok(response.answer.includes("question for your doctor"));

  const emergencyResponse = await answerRecordsQuestion('I have severe chest pain', []);
  assert.equal(emergencyResponse.emergency, true);
  assert.ok(emergencyResponse.answer.includes("emergency services"));
});

test('answerRecordsQuestion searches records cleanly and reports when not found', async () => {
  const response = await answerRecordsQuestion('thyroid', []);
  assert.equal(response.redirected, false);
  assert.ok(response.answer.includes("couldn't find this in your records"));

  const records = [
    {
      id: 'rec-1',
      title: 'Thyroid Function Test',
      record_date: '2024-05-10',
      doctor_name: 'Dr. Rao',
      hospital_name: 'City Care',
      summary: 'Normal thyroid profile report',
      extracted_text: 'TSH: 2.1 uIU/mL',
      lab_values: [{ name: 'TSH', value: '2.1', unit: 'uIU/mL' }],
    },
  ];

  const found = await answerRecordsQuestion('my thyroid test', records);
  assert.equal(found.sources.length, 1);
  assert.equal(found.sources[0].id, 'rec-1');
});

test('explainTerm returns structured, neutral explanation with trusted source citation', async () => {
  const result = await explainTerm('Amlodipine');
  assert.ok(result);
  assert.equal(result.term, 'Amlodipine');
  assert.ok(result.disclaimer.includes('Please confirm with your doctor'));
  assert.ok(result.url.startsWith('https://'));
});
