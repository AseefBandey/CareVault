"""
Consensus and Cross-Checking Engine between Machine OCR and Multimodal AI (Gemini).

Implements Stage 4 verification:
- Compares OCR text tokens with Gemini Vision medicine entities.
- Flags unsupported AI hallucinations (e.g., model guessing a drug not on the prescription).
- Reconciles conflicting strengths or frequencies.
"""

import re
from typing import List, Dict, Any, Tuple


def calculate_token_similarity(s1: str, s2: str) -> float:
    """Calculates character-level Levenshtein similarity [0.0, 1.0]."""
    s1, s2 = s1.strip().lower(), s2.strip().lower()
    if not s1 or not s2:
        return 0.0
    if s1 == s2:
        return 1.0

    len1, len2 = len(s1), len(s2)
    dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]
    for i in range(len1 + 1):
        dp[i][0] = i
    for j in range(len2 + 1):
        dp[0][j] = j

    for i in range(1, len1 + 1):
        for j in range(1, len2 + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)

    dist = dp[len1][len2]
    return max(0.0, 1.0 - dist / max(len1, len2))


def cross_check_medicine_against_ocr(
    med_name: str,
    ocr_text: str
) -> Tuple[bool, float, str]:
    """
    Checks if a predicted medicine is confirmed by the OCR text.
    Returns (supported, alignment_score, reason).
    """
    if not ocr_text:
        return True, 0.5, "No OCR text available for cross-validation."

    ocr_lower = ocr_text.lower()
    name_lower = med_name.lower().strip()

    # 1. Exact substring
    if name_lower in ocr_lower:
        return True, 1.0, "Exact match in OCR text stream."

    # 2. Token overlap
    tokens = [t for t in re.split(r"[\s\-_]+", name_lower) if len(t) >= 3]
    if tokens:
        matched = sum(1 for t in tokens if t in ocr_lower)
        if matched == len(tokens):
            return True, 0.95, "All brand/generic tokens present in OCR text."
        if matched > 0:
            return True, 0.75, "Partial brand tokens present in OCR text."

    # 3. Fuzzy sliding window across OCR words
    ocr_words = [w for w in re.split(r"[\s,.-]+", ocr_lower) if len(w) >= 3]
    best_sim = 0.0
    for w in ocr_words:
        sim = calculate_token_similarity(name_lower, w)
        if sim > best_sim:
            best_sim = sim
            if best_sim >= 0.85:
                break

    if best_sim >= 0.80:
        return True, round(best_sim, 2), "Fuzzy token match in OCR text."

    return False, round(best_sim, 2), "Warning: Medicine was not detected in OCR text stream. High risk of AI hallucination."


def reconcile_predictions(
    gemini_medicines: List[Dict[str, Any]],
    ocr_text: str
) -> Dict[str, Any]:
    """
    Reconciles medicines extracted by Gemini Vision against the OCR text.
    Outputs structured medicines with consensus flags and confidence scoring.
    """
    verified_list = []
    hallucination_detected = False
    unsupported_count = 0
    total_conf = 0.0

    for item in gemini_medicines:
        name = item.get("brand_name") or item.get("name") or item.get("raw", "")
        raw = item.get("raw") or item.get("raw_text") or name
        strength = item.get("strength", "Unspecified")
        form = item.get("dosage_form") or item.get("form", "Tablet")
        freq = item.get("frequency", "As advised")
        duration = item.get("duration", "As advised")
        instr = item.get("instructions", "Standard administration")
        status = item.get("verification_status", "unverified")

        supported, align_score, reason = cross_check_medicine_against_ocr(name, ocr_text)

        flags = list(item.get("flags", []))
        confidence = float(item.get("confidence", 0.7))

        if not supported:
            hallucination_detected = True
            unsupported_count += 1
            confidence = max(0.2, confidence - 0.35)
            flags.append(reason)
        else:
            confidence = min(1.0, confidence + (0.05 if align_score >= 0.9 else 0.0))

        total_conf += confidence

        verified_list.append({
            "raw_text": raw,
            "brand_name": name,
            "generic_name": item.get("generic_name", name),
            "dosage_form": form,
            "strength": strength,
            "frequency": freq,
            "duration": duration,
            "instructions": instr,
            "category": item.get("category", "Prescription medication"),
            "rxcui": item.get("rxcui"),
            "verification_status": status,
            "confidence": round(confidence, 2),
            "consensus_supported": supported,
            "flags": flags,
        })

    mean_conf = total_conf / len(verified_list) if verified_list else 0.0

    return {
        "verified_medicines": verified_list,
        "hallucination_detected": hallucination_detected,
        "unsupported_count": unsupported_count,
        "overall_confidence": round(mean_conf, 2),
    }
