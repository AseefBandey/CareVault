"""
Prescription Helper Multi-Stage Pipeline - FastAPI Backend Service.

Coordinates:
- Stage 1: Upload and validate image
- Stage 2: OpenCV Preprocessing (deskew, denoise, CLAHE contrast)
- Stage 3: PaddleOCR Printed Text Recognition
- Stage 4: Consensus & Pharmacopeia Cross-Check
- Stage 5: Evaluation Benchmark Runner
"""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, List
import json

from schemas import (
    PreprocessRequest,
    PreprocessResponse,
    OCRRequest,
    OCRResponse,
    ConsensusRequest,
    ConsensusResponse,
    EvaluationReport,
)
from preprocess import preprocess_prescription_image
from ocr_engine import run_ocr
from consensus import reconcile_predictions
from evaluate import evaluate_extractions

app = FastAPI(
    title="CareVault Prescription Helper Pipeline",
    description="Multi-Stage OCR + Multimodal Vision + Pharmacopeial Verification Service",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "prescription-helper-pipeline",
        "version": "2.0.0",
        "stages": ["opencv_preprocess", "paddle_ocr", "consensus_crosscheck", "evaluation_harness"],
    }


@app.post("/pipeline/preprocess", response_model=PreprocessResponse)
def preprocess_endpoint(req: PreprocessRequest):
    try:
        result = preprocess_prescription_image(
            base64_str=req.image_base64,
            do_deskew=req.deskew,
            do_clahe=req.clahe_contrast,
            do_denoise=req.denoise,
        )
        return PreprocessResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image preprocessing failed: {str(e)}"
        )


@app.post("/pipeline/ocr", response_model=OCRResponse)
def ocr_endpoint(req: OCRRequest):
    try:
        import base64
        data = req.image_base64
        if "," in data:
            data = data.split(",", 1)[1]
        raw_bytes = base64.b64decode(data)
        result = run_ocr(raw_bytes, engine=req.engine)
        return OCRResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"OCR recognition failed: {str(e)}"
        )


@app.post("/pipeline/consensus", response_model=ConsensusResponse)
def consensus_endpoint(req: ConsensusRequest):
    try:
        result = reconcile_predictions(
            gemini_medicines=req.gemini_medicines,
            ocr_text=req.ocr_text
        )
        return ConsensusResponse(**result)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Consensus reconciliation failed: {str(e)}"
        )


@app.post("/pipeline/evaluate", response_model=EvaluationReport)
def evaluate_endpoint(payload: Dict[str, Any]):
    try:
        predictions = payload.get("predictions", [])
        ground_truth = payload.get("ground_truth", [])
        if not ground_truth:
            # Fall back to bundled ground truth samples
            with open("sample_evaluation_dataset.json", "r") as f:
                ground_truth = json.load(f)

        report = evaluate_extractions(predictions, ground_truth)
        return EvaluationReport(
            total_samples=report["total_samples"],
            medicine_name_exact_match_pct=report["medicine_name_exact_match_pct"],
            strength_exact_match_pct=report["strength_exact_match_pct"],
            dosage_exact_match_pct=report["dosage_exact_match_pct"],
            frequency_exact_match_pct=report["frequency_exact_match_pct"],
            unsupported_medicine_guesses=report["unsupported_medicine_guesses"],
            incorrect_fields_silently_saved=report["incorrect_fields_silently_saved"],
            passed_targets=report["passed_targets"],
            summary=report["markdown_summary"],
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Evaluation failed: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
