"""
Prescription Image Preprocessing Engine using OpenCV.

Handles physical prescription artifacts before OCR and Gemini multimodal inference:
1. Skew / Rotation Correction (Hough transform / MinAreaRect)
2. Shadow Removal & Lighting Equalization (CLAHE on L-channel)
3. Noise Reduction (Bilateral filtering to preserve character stroke edges)
4. Adaptive Contrast Stretching
"""

import base64
import io
import math
from typing import Tuple, Dict, Any

try:
    import cv2
    import numpy as np
    HAS_OPENCV = True
except ImportError:
    HAS_OPENCV = False


def decode_base64_image(base64_str: str):
    """Decodes a base64 string to a numpy image array (BGR)."""
    if not HAS_OPENCV:
        return None
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    img_data = base64.b64decode(base64_str)
    nparr = np.frombuffer(img_data, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return image


def encode_image_base64(image) -> str:
    """Encodes a numpy image array (BGR) to a PNG base64 string."""
    if not HAS_OPENCV or image is None:
        return ""
    success, buffer = cv2.imencode(".png", image, [cv2.IMWRITE_PNG_COMPRESSION, 4])
    if not success:
        return ""
    return base64.b64encode(buffer).decode("utf-8")


def calculate_skew_angle(gray_image) -> float:
    """
    Computes skew angle in degrees using Hough lines or minimum area rectangle
    of text contours. Returns angle in [-45, 45].
    """
    if not HAS_OPENCV or gray_image is None:
        return 0.0

    # Invert and threshold to isolate dark handwritten/printed strokes
    blur = cv2.GaussianBlur(gray_image, (7, 7), 0)
    thresh = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 21, 10
    )

    # Dilate text blocks horizontally to form continuous text lines
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
    dilated = cv2.dilate(thresh, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    angles = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area > 1000:
            rect = cv2.minAreaRect(cnt)
            angle = rect[-1]
            if angle < -45:
                angle = 90 + angle
            elif angle > 45:
                angle = angle - 90
            angles.append(angle)

    if not angles:
        return 0.0

    # Use median angle to ignore outliers
    median_angle = float(np.median(angles))
    # Cap rotation correction to sane bounds
    if abs(median_angle) > 40:
        return 0.0
    return median_angle


def deskew_image(image, angle: float):
    """Rotates image around its center by angle degrees."""
    if not HAS_OPENCV or abs(angle) < 0.2:
        return image
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    rot_mat = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        image,
        rot_mat,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE
    )
    return rotated


def enhance_clahe_contrast(bgr_image):
    """
    Applies Contrast Limited Adaptive Histogram Equalization (CLAHE)
    to the Luminance channel in LAB color space. Removes camera flash shadows.
    """
    if not HAS_OPENCV:
        return bgr_image
    lab = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    merged = cv2.merge((cl, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def denoise_preservation(bgr_image):
    """
    Bilateral filter: smooths flat paper textures and noise
    while preserving sharp character stroke edges.
    """
    if not HAS_OPENCV:
        return bgr_image
    return cv2.bilateralFilter(bgr_image, d=9, sigmaColor=75, sigmaSpace=75)


def preprocess_prescription_image(
    base64_str: str,
    do_deskew: bool = True,
    do_clahe: bool = True,
    do_denoise: bool = True
) -> Dict[str, Any]:
    """
    Full prescription preprocessing pipeline:
    1. Base64 decode
    2. Skew detection and rotation
    3. CLAHE shadow and contrast enhancement
    4. Bilateral text-preserving denoising
    5. Base64 encode
    """
    if not HAS_OPENCV:
        return {
            "processed_base64": base64_str,
            "deskew_angle_degrees": 0.0,
            "width": 800,
            "height": 1000,
            "contrast_applied": False,
            "denoise_applied": False,
        }

    image = decode_base64_image(base64_str)
    if image is None:
        raise ValueError("Invalid image or base64 data could not be decoded.")

    h, w = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    angle = 0.0

    if do_deskew:
        angle = calculate_skew_angle(gray)
        if abs(angle) >= 0.5:
            image = deskew_image(image, angle)

    if do_clahe:
        image = enhance_clahe_contrast(image)

    if do_denoise:
        image = denoise_preservation(image)

    encoded = encode_image_base64(image)
    return {
        "processed_base64": encoded,
        "deskew_angle_degrees": round(angle, 2),
        "width": w,
        "height": h,
        "contrast_applied": do_clahe,
        "denoise_applied": do_denoise,
    }
