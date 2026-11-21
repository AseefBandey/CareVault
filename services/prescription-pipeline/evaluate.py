"""
Ground Truth Evaluation Benchmark Harness for Prescription Extraction.

Measures multi-stage pipeline performance against verified ground-truth targets:
- Medicine-name exact match (Target: >= 95%)
- Strength exact match (Target: >= 95%)
- Dosage exact match (Target: >= 95%)
- Frequency exact match (Target: >= 95%)
- Unsupported medicine guesses (Target: 0)
- Incorrect fields silently saved (Target: 0)
"""

import json
from typing import List, Dict, Any


def evaluate_extractions(
    predictions: List[Dict[str, Any]],
    ground_truth: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Compares predicted prescription medicines against verified human annotations.
    """
    total_meds_expected = 0
    name_matches = 0
    strength_matches = 0
    dosage_matches = 0
    frequency_matches = 0
    unsupported_guesses = 0
    silent_errors = 0

    gt_map = {item["id"]: item for item in ground_truth}

    for pred in predictions:
        sample_id = pred.get("id")
        gt = gt_map.get(sample_id)
        if not gt:
            continue

        expected_meds = gt.get("expected_medicines", [])
        pred_meds = pred.get("extracted_medicines", [])

        total_meds_expected += len(expected_meds)

        # Track which expected medicines were matched
        matched_expected = set()

        for p_med in pred_meds:
            p_name = p_med.get("name", "").strip().lower()
            p_strength = p_med.get("strength", "").strip().lower().replace(" ", "")
            p_dosage = p_med.get("dosage", "").strip().lower()
            p_freq = p_med.get("frequency", "").strip().lower()

            found_match = False
            for idx, e_med in enumerate(expected_meds):
                if idx in matched_expected:
                    continue

                e_name = e_med.get("name", "").strip().lower()
                e_strength = e_med.get("strength", "").strip().lower().replace(" ", "")
                e_dosage = e_med.get("dosage", "").strip().lower()
                e_freq = e_med.get("frequency", "").strip().lower()

                if p_name == e_name:
                    found_match = True
                    matched_expected.add(idx)
                    name_matches += 1

                    if p_strength == e_strength:
                        strength_matches += 1
                    else:
                        silent_errors += 1

                    if p_dosage == e_dosage or p_dosage in e_dosage or e_dosage in p_dosage:
                        dosage_matches += 1
                    else:
                        silent_errors += 1

                    if p_freq == e_freq or p_freq in e_freq or e_freq in p_freq:
                        frequency_matches += 1
                    break

            if not found_match:
                # Prediction invented a medicine not in ground truth
                unsupported_guesses += 1

    denom = max(1, total_meds_expected)
    name_pct = round((name_matches / denom) * 100, 2)
    strength_pct = round((strength_matches / denom) * 100, 2)
    dosage_pct = round((dosage_matches / denom) * 100, 2)
    freq_pct = round((frequency_matches / denom) * 100, 2)

    passed = (
        name_pct >= 95.0
        and strength_pct >= 95.0
        and dosage_pct >= 95.0
        and freq_pct >= 95.0
        and unsupported_guesses == 0
        and silent_errors == 0
    )

    report = {
        "total_samples": len(predictions),
        "total_medicines_evaluated": total_meds_expected,
        "medicine_name_exact_match_pct": name_pct,
        "strength_exact_match_pct": strength_pct,
        "dosage_exact_match_pct": dosage_pct,
        "frequency_exact_match_pct": freq_pct,
        "unsupported_medicine_guesses": unsupported_guesses,
        "incorrect_fields_silently_saved": silent_errors,
        "passed_targets": passed,
    }

    report["markdown_summary"] = generate_markdown_report(report)
    return report


def generate_markdown_report(metrics: Dict[str, Any]) -> str:
    md = [
        "# Prescription Helper Evaluation Benchmark Report",
        "",
        f"**Total Samples Evaluated**: {metrics['total_samples']} ({metrics['total_medicines_evaluated']} medicines)",
        f"**Target Gate Result**: {'✅ PASSED ALL TARGETS' if metrics['passed_targets'] else '⚠️ BELOW TARGET GATES'}",
        "",
        "| Evaluation Metric | Measured Score | Target Gate | Status |",
        "| :--- | :--- | :--- | :--- |",
        f"| Medicine-name exact match | {metrics['medicine_name_exact_match_pct']}% | ≥ 95% | {'✅' if metrics['medicine_name_exact_match_pct'] >= 95.0 else '❌'} |",
        f"| Strength exact match | {metrics['strength_exact_match_pct']}% | ≥ 95% | {'✅' if metrics['strength_exact_match_pct'] >= 95.0 else '❌'} |",
        f"| Dosage exact match | {metrics['dosage_exact_match_pct']}% | ≥ 95% | {'✅' if metrics['dosage_exact_match_pct'] >= 95.0 else '❌'} |",
        f"| Frequency exact match | {metrics['frequency_exact_match_pct']}% | ≥ 95% | {'✅' if metrics['frequency_exact_match_pct'] >= 95.0 else '❌'} |",
        f"| Unsupported medicine guesses | {metrics['unsupported_medicine_guesses']} | 0 | {'✅' if metrics['unsupported_medicine_guesses'] == 0 else '❌'} |",
        f"| Incorrect fields silently saved | {metrics['incorrect_fields_silently_saved']} | 0 | {'✅' if metrics['incorrect_fields_silently_saved'] == 0 else '❌'} |",
        "",
    ]
    return "\n".join(md)
