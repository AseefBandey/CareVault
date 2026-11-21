from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class BBox(BaseModel):
    x_min: int = Field(..., description="Top-left X coordinate")
    y_min: int = Field(..., description="Top-left Y coordinate")
    x_max: int = Field(..., description="Bottom-right X coordinate")
    y_max: int = Field(..., description="Bottom-right Y coordinate")

class OCRToken(BaseModel):
    text: str = Field(..., description="Recognized word or phrase")
    confidence: float = Field(..., ge=0.0, le=1.0, description="OCR confidence score")
    bbox: Optional[BBox] = Field(None, description="Bounding box on original or preprocessed image")

class PreprocessRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded input prescription image")
    deskew: bool = Field(True, description="Automatically calculate and correct rotation skew")
    clahe_contrast: bool = Field(True, description="Apply CLAHE contrast enhancement for uneven lighting")
    denoise: bool = Field(True, description="Bilateral edge-preserving denoising")
    binarize: bool = Field(False, description="Apply adaptive Otsu binarization")

class PreprocessResponse(BaseModel):
    processed_base64: str
    deskew_angle_degrees: float
    width: int
    height: int
    contrast_applied: bool
    denoise_applied: bool

class OCRRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 image to OCR")
    engine: str = Field("paddleocr", description="paddleocr or tesseract")

class OCRResponse(BaseModel):
    engine: str
    full_text: str
    lines: List[str]
    tokens: List[OCRToken]
    mean_confidence: float

class StructuredMedicine(BaseModel):
    raw_text: str = Field(..., description="Raw text line as written or extracted")
    brand_name: str = Field(..., description="Commercial brand name or primary label")
    generic_name: str = Field(..., description="Active pharmaceutical ingredient (INN)")
    dosage_form: str = Field("Tablet", description="Tablet, Capsule, Syrup, Inhaler, etc.")
    strength: str = Field("Unspecified", description="e.g. 500mg, 625mg, 20mcg")
    frequency: str = Field("As advised", description="e.g. Twice daily (1-0-1), OD, TDS, SOS")
    duration: str = Field("As advised", description="e.g. 5 days, 1 month")
    instructions: str = Field("Standard administration", description="Before food, After food, Bedtime")
    category: str = Field("Prescription medication", description="Therapeutic class")
    rxcui: Optional[str] = Field(None, description="NIH RxNorm Concept Unique Identifier")
    verification_status: str = Field("unverified", description="verified_rxnorm, verified_catalogue, fuzzy_match, unverified")
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    consensus_supported: bool = Field(True, description="True if confirmed by OCR text stream")
    flags: List[str] = Field(default_factory=list, description="Safety warnings or ambiguity flags")

class ConsensusRequest(BaseModel):
    ocr_text: str = Field(..., description="Machine-read text from PaddleOCR")
    gemini_medicines: List[Dict[str, Any]] = Field(..., description="Medicines extracted by Gemini Vision")

class ConsensusResponse(BaseModel):
    verified_medicines: List[StructuredMedicine]
    hallucination_detected: bool
    unsupported_count: int
    overall_confidence: float

class GroundTruthSample(BaseModel):
    id: str
    image_path: Optional[str] = None
    expected_medicines: List[Dict[str, str]]
    # e.g. [{"name": "Augmentin", "strength": "625mg", "dosage": "1-0-1", "frequency": "Twice daily"}]

class EvaluationReport(BaseModel):
    total_samples: int
    medicine_name_exact_match_pct: float
    strength_exact_match_pct: float
    dosage_exact_match_pct: float
    frequency_exact_match_pct: float
    unsupported_medicine_guesses: int
    incorrect_fields_silently_saved: int
    passed_targets: bool
    summary: str
