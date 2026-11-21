"""
Kaggle / Custom Prescription Dataset Importer and Labeling Helper.

Imports prescription images and transcription annotations from Kaggle datasets
(e.g., Doctor Handwriting Prescription datasets, Medical Prescription OCR datasets)
and converts them into the ground-truth format required by `evaluate.py`.
"""

import os
import sys
import json
import csv
import re
from typing import List, Dict, Any, Optional
from pathlib import Path


def parse_clinical_line(line: str) -> Dict[str, str]:
    """
    Decomposes a raw transcribed prescription line into ground-truth components:
    Name, Strength, Dosage, Frequency, Form.
    """
    cleaned = line.strip()

    # 1. Dosage form
    form = "Tablet"
    for f in ["Tablet", "Tab", "Capsule", "Cap", "Syrup", "Syr", "Injection", "Inj", "Inhaler", "Drops", "Ointment"]:
        if re.search(rf"\b{f}\b", cleaned, re.IGNORECASE):
            form = "Tablet" if f.lower().startswith("tab") else ("Capsule" if f.lower().startswith("cap") else ("Syrup" if f.lower().startswith("syr") else f))
            break

    # 2. Strength
    strength_match = re.search(r"(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|iu|units?|%|meq)", cleaned, re.IGNORECASE)
    strength = strength_match.group(0).lower().replace(" ", "") if strength_match else "Unspecified"

    # 3. Schedule / Dosage
    dosage = "1-0-0"
    if re.search(r"\b1-0-1\b", cleaned):
        dosage = "1-0-1"
    elif re.search(r"\b1-1-1\b", cleaned):
        dosage = "1-1-1"
    elif re.search(r"\b0-0-1\b", cleaned):
        dosage = "0-0-1"
    elif re.search(r"\b(?:sos|prn|as needed)\b", cleaned, re.IGNORECASE):
        dosage = "SOS"
    elif re.search(r"\b(?:bd|bid)\b", cleaned, re.IGNORECASE):
        dosage = "BD"
    elif re.search(r"\b(?:tds|tid)\b", cleaned, re.IGNORECASE):
        dosage = "TDS"
    elif re.search(r"\b(?:od|once daily)\b", cleaned, re.IGNORECASE):
        dosage = "OD"

    # 4. Frequency label
    freq_map = {
        "1-0-1": "Twice daily",
        "BD": "Twice daily",
        "1-1-1": "Three times daily",
        "TDS": "Three times daily",
        "1-0-0": "Once daily morning",
        "OD": "Once daily",
        "0-0-1": "At bedtime",
        "SOS": "As needed (SOS)",
    }
    frequency = freq_map.get(dosage, "As advised")

    # 5. Medicine Name
    name = re.sub(r"^(?:tab|tablet|cap|capsule|syr|syrup|inj|injection)\s+", "", cleaned, flags=re.IGNORECASE)
    name = re.sub(r"\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|units?|%)\b.*$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[-–—].*$", "", name)
    name = re.sub(r"\b(?:1-0-1|1-1-1|0-0-1|1-0-0|od|bd|bid|tds|tid|sos)\b.*$", "", name, flags=re.IGNORECASE)
    name = name.strip() or cleaned.split()[0]

    return {
        "name": name.title(),
        "form": form,
        "strength": strength,
        "dosage": dosage,
        "frequency": frequency,
    }


def import_from_csv(
    csv_path: str,
    images_dir: str,
    output_json_path: str = "data/evaluation_dataset.json"
) -> List[Dict[str, Any]]:
    """
    Imports a CSV with columns like `[image_file, prescription_text]` or `[image_name, medicines]`.
    """
    samples = []
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Annotation CSV file not found: {csv_path}")

    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            img_col = next((k for k in row.keys() if "image" in k.lower() or "file" in k.lower() or "name" in k.lower()), None)
            text_col = next((k for k in row.keys() if "text" in k.lower() or "med" in k.lower() or "label" in k.lower() or "transcription" in k.lower()), None)

            if not img_col or not text_col:
                continue

            img_filename = row[img_col].strip()
            raw_transcription = row[text_col].strip()

            img_full_path = os.path.join(images_dir, img_filename)

            # Split prescription into distinct medicine lines
            lines = [l.strip() for l in re.split(r"[\n;,|]+", raw_transcription) if l.strip()]
            expected_meds = [parse_clinical_line(l) for l in lines]

            sample_id = Path(img_filename).stem
            samples.append({
                "id": sample_id,
                "image_filename": img_filename,
                "image_path": img_full_path if os.path.exists(img_full_path) else img_filename,
                "raw_transcription": raw_transcription,
                "expected_medicines": expected_meds,
            })

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2)

    print(f"Successfully imported {len(samples)} prescription samples into {output_json_path}")
    return samples


def scan_image_folder_template(
    images_dir: str,
    output_json_path: str = "data/kaggle_annotation_template.json"
) -> List[Dict[str, Any]]:
    """
    If you downloaded 50-100 raw images from Kaggle without a ready-made CSV,
    this creates a starter annotation template with automatic sample IDs.
    """
    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    samples = []

    if not os.path.exists(images_dir):
        print(f"Directory not found: {images_dir}. Creating empty placeholder.")
        os.makedirs(images_dir, exist_ok=True)
        return []

    files = sorted(os.listdir(images_dir))
    for f in files:
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            sample_id = Path(f).stem
            samples.append({
                "id": sample_id,
                "image_filename": f,
                "image_path": os.path.join(images_dir, f),
                "expected_medicines": [
                    {
                        "name": "ExampleBrand",
                        "form": "Tablet",
                        "strength": "500mg",
                        "dosage": "1-0-1",
                        "frequency": "Twice daily"
                    }
                ]
            })

    os.makedirs(os.path.dirname(os.path.abspath(output_json_path)), exist_ok=True)
    with open(output_json_path, "w", encoding="utf-8") as out:
        json.dump(samples, out, indent=2)

    print(f"Generated annotation template for {len(samples)} images at: {output_json_path}")
    return samples


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Import Kaggle prescription dataset")
    parser.add_argument("--csv", type=str, help="Path to Kaggle labels CSV")
    parser.add_argument("--images", type=str, default="data/kaggle_prescriptions", help="Directory with prescription images")
    parser.add_argument("--out", type=str, default="data/evaluation_dataset.json", help="Output JSON path")
    parser.add_argument("--scan-only", action="store_true", help="Scan images folder and create template JSON")

    args = parser.parse_args()

    if args.scan_only or not args.csv:
        scan_image_folder_template(args.images, args.out)
    else:
        import_from_csv(args.csv, args.images, args.out)
