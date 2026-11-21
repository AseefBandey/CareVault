"""
Unit tests for Prescription Multi-Stage Pipeline components:
- Preprocessing fallback handling
- Consensus and hallucination detection
- Evaluation benchmark calculation against targets
"""

import unittest
from consensus import (
    calculate_token_similarity,
    cross_check_medicine_against_ocr,
    reconcile_predictions,
)
from evaluate import evaluate_extractions


class TestPrescriptionPipeline(unittest.TestCase):

    def test_token_similarity(self):
        self.assertEqual(calculate_token_similarity("Augmentin", "Augmentin"), 1.0)
        self.assertEqual(calculate_token_similarity("", ""), 0.0)
        # Typo tolerance
        sim = calculate_token_similarity("Augmentin", "Augmentn")
        self.assertGreaterEqual(sim, 0.85)

    def test_cross_check_medicine_detected(self):
        ocr_text = "Clinic Slip. Patient John. AUGMENTIN 625 TAB BD X 5 DAYS. PAN 40"
        supported, score, reason = cross_check_medicine_against_ocr("Augmentin", ocr_text)
        self.assertTrue(supported)
        self.assertGreaterEqual(score, 0.90)

    def test_cross_check_flags_unsupported_hallucination(self):
        ocr_text = "Only multivitamins written on slip."
        supported, score, reason = cross_check_medicine_against_ocr("Morphine", ocr_text)
        self.assertFalse(supported)
        self.assertIn("not detected in OCR text", reason)

    def test_reconcile_predictions_scores_confidence(self):
        gemini_meds = [
            {"name": "Augmentin", "strength": "625mg", "dosage_form": "Tablet", "frequency": "BD", "confidence": 0.9},
            {"name": "PhantomDrug", "strength": "100mg", "dosage_form": "Tablet", "frequency": "OD", "confidence": 0.8},
        ]
        ocr = "Dr Rx: AUGMENTIN 625mg BD"
        result = reconcile_predictions(gemini_meds, ocr)

        self.assertTrue(result["hallucination_detected"])
        self.assertEqual(result["unsupported_count"], 1)

        aug = next(m for m in result["verified_medicines"] if m["brand_name"] == "Augmentin")
        self.assertTrue(aug["consensus_supported"])
        self.assertGreaterEqual(aug["confidence"], 0.9)

        phantom = next(m for m in result["verified_medicines"] if m["brand_name"] == "PhantomDrug")
        self.assertFalse(phantom["consensus_supported"])
        self.assertLess(phantom["confidence"], 0.7)
        self.assertTrue(any("not detected in OCR text" in f for f in phantom["flags"]))

    def test_evaluate_extractions_perfect_match(self):
        ground_truth = [
            {
                "id": "rx-001",
                "expected_medicines": [
                    {"name": "Augmentin", "strength": "625mg", "dosage": "1-0-1", "frequency": "Twice daily"}
                ]
            }
        ]
        predictions = [
            {
                "id": "rx-001",
                "extracted_medicines": [
                    {"name": "Augmentin", "strength": "625mg", "dosage": "1-0-1", "frequency": "Twice daily"}
                ]
            }
        ]
        report = evaluate_extractions(predictions, ground_truth)
        self.assertEqual(report["medicine_name_exact_match_pct"], 100.0)
        self.assertEqual(report["strength_exact_match_pct"], 100.0)
        self.assertEqual(report["dosage_exact_match_pct"], 100.0)
        self.assertEqual(report["unsupported_medicine_guesses"], 0)
        self.assertEqual(report["incorrect_fields_silently_saved"], 0)
        self.assertTrue(report["passed_targets"])

    def test_evaluate_extractions_flags_unsupported_guess(self):
        ground_truth = [
            {
                "id": "rx-001",
                "expected_medicines": [
                    {"name": "Augmentin", "strength": "625mg", "dosage": "1-0-1", "frequency": "Twice daily"}
                ]
            }
        ]
        predictions = [
            {
                "id": "rx-001",
                "extracted_medicines": [
                    {"name": "Augmentin", "strength": "625mg", "dosage": "1-0-1", "frequency": "Twice daily"},
                    {"name": "HallucinatedDrug", "strength": "10mg", "dosage": "1-0-0", "frequency": "OD"}
                ]
            }
        ]
        report = evaluate_extractions(predictions, ground_truth)
        self.assertEqual(report["unsupported_medicine_guesses"], 1)
        self.assertFalse(report["passed_targets"])


if __name__ == "__main__":
    unittest.main()
