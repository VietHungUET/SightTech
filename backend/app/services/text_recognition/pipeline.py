import json
import logging
import re
import threading
import unicodedata
from dataclasses import asdict, dataclass
from typing import Callable, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

MIN_BLUR_SCORE = 60.0
LOW_BLUR_SCORE = 120.0
MIN_BRIGHTNESS = 50.0
MAX_BRIGHTNESS = 220.0
LOW_CONTRAST_STD = 35.0
MIN_SHORT_EDGE = 960
MIN_DOCUMENT_AREA_RATIO = 0.20
LOW_OCR_CONFIDENCE = 0.60
VIETNAMESE_DEGRADED_TOKEN_THRESHOLD = 4
VIETNAMESE_DEGRADED_TOKENS = {
    "lut",
    "dc",
    "diu",
    "trng",
    "dy",
    "hc",
    "ting",
    "vit",
    "thiu",
    "ngoi",
    "thc",
    "vic",
    "dng",
    "ph",
    "quc",
    "ngu",
    "ngon",
}


class TextRecognitionError(Exception):
    """Base error for text recognition failures."""


class ImageQualityError(TextRecognitionError):
    def __init__(self, message: str, quality: dict):
        super().__init__(message)
        self.quality = quality


class PaddleOCRUnavailableError(TextRecognitionError):
    """Raised when PaddleOCR is not installed or cannot initialize."""


@dataclass
class ImageQuality:
    blur_score: float
    blur: str
    brightness_score: float
    brightness: str
    overexposed_ratio: float
    contrast_score: float
    contrast_enhanced: bool = False
    resized: bool = False
    document_detected: bool = False
    perspective_corrected: bool = False
    warnings: list[str] | None = None


class TextRecognitionService:
    """Preprocess images, run PaddleOCR, and optionally fall back to Gemini."""

    def __init__(
        self,
        ocr_factory: Optional[Callable[[], object]] = None,
        fallback_ocr: Optional[Callable[[bytes], str]] = None,
    ):
        self._ocr_factory = ocr_factory or self._create_paddle_ocr
        self._fallback_ocr = fallback_ocr
        self._ocr = None
        self._ocr_lock = threading.Lock()

    def recognize(self, image_bytes: bytes) -> dict:
        image = self._decode_image(image_bytes)
        processed, quality = self.preprocess(image)

        try:
            text, confidence, lines = self._run_paddle_ocr(processed)
        except PaddleOCRUnavailableError as exc:
            logger.warning("PaddleOCR unavailable; attempting Gemini fallback: %s", exc)
            return self._fallback_result(processed, quality, "PaddleOCR is unavailable.")

        if text and self._looks_like_degraded_vietnamese(text):
            return self._fallback_result(
                processed,
                quality,
                "Local OCR detected Vietnamese text but lost too many diacritics.",
                local_confidence=confidence,
            )

        if text and confidence >= LOW_OCR_CONFIDENCE:
            feedback = (
                "Document recognized successfully."
                if confidence >= 0.80
                else "Document recognized, but some words may be inaccurate."
            )
            return {
                "status": "success",
                "text": text,
                "confidence": round(confidence, 3),
                "engine": "paddleocr",
                "quality": asdict(quality),
                "feedback": feedback,
                "lines": lines,
            }

        if self._is_unusable(quality):
            feedback = " ".join(quality.warnings or ["The image quality is too low. Please take another photo."])
            raise ImageQualityError(feedback, asdict(quality))

        reason = "Local OCR confidence was low." if text else "Local OCR did not detect text."
        return self._fallback_result(processed, quality, reason, local_confidence=confidence)

    def preprocess(self, image: np.ndarray) -> tuple[np.ndarray, ImageQuality]:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        brightness_score = float(cv2.cvtColor(image, cv2.COLOR_BGR2HSV)[:, :, 2].mean())
        overexposed_ratio = float(np.mean(gray >= 250))
        contrast_score = float(gray.std())

        quality = ImageQuality(
            blur_score=round(blur_score, 2),
            blur=self._blur_label(blur_score),
            brightness_score=round(brightness_score, 2),
            brightness=self._brightness_label(brightness_score, contrast_score),
            overexposed_ratio=round(overexposed_ratio, 3),
            contrast_score=round(contrast_score, 2),
            warnings=[],
        )

        if blur_score < MIN_BLUR_SCORE:
            quality.warnings.append("The image is blurry. Hold the camera steady for a clearer result.")
        if brightness_score < MIN_BRIGHTNESS:
            quality.warnings.append("The image is dark. Move to a brighter area for a clearer result.")
        elif (
            brightness_score > MAX_BRIGHTNESS
            and overexposed_ratio > 0.65
            and contrast_score < LOW_CONTRAST_STD
        ):
            quality.warnings.append("The image has strong glare. Move away from direct light for a clearer result.")

        processed, document_detected = self._crop_and_correct_document(image)
        quality.document_detected = document_detected
        quality.perspective_corrected = document_detected

        short_edge = min(processed.shape[:2])
        if short_edge < MIN_SHORT_EDGE:
            scale = MIN_SHORT_EDGE / short_edge
            processed = cv2.resize(
                processed,
                None,
                fx=scale,
                fy=scale,
                interpolation=cv2.INTER_CUBIC,
            )
            quality.resized = True

        processed_gray = cv2.cvtColor(processed, cv2.COLOR_BGR2GRAY)
        if processed_gray.std() < LOW_CONTRAST_STD:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            processed_gray = clahe.apply(processed_gray)
            quality.contrast_enhanced = True

        # PaddleOCR 3.x detection expects a three-channel image.
        return cv2.cvtColor(processed_gray, cv2.COLOR_GRAY2BGR), quality

    @staticmethod
    def _is_unusable(quality: ImageQuality) -> bool:
        nearly_black = quality.brightness_score < 20 and quality.contrast_score < 15
        nearly_blank = quality.overexposed_ratio > 0.95 and quality.contrast_score < 15
        return nearly_black or nearly_blank

    def _fallback_result(
        self,
        processed: np.ndarray,
        quality: ImageQuality,
        reason: str,
        local_confidence: float = 0.0,
    ) -> dict:
        if self._fallback_ocr is None:
            raise TextRecognitionError(f"{reason} Gemini fallback is not configured.")

        text = self._fallback_ocr(self._encode_jpeg(processed)).strip()
        if not text:
            raise TextRecognitionError(f"{reason} Gemini fallback did not detect text.")

        return {
            "status": "success",
            "text": text,
            "confidence": None,
            "local_ocr_confidence": round(local_confidence, 3),
            "engine": "gemini_fallback",
            "quality": asdict(quality),
            "feedback": f"{reason} Used Gemini to read the document.",
            "lines": [],
        }

    def _run_paddle_ocr(self, image: np.ndarray) -> tuple[str, float, list[dict]]:
        ocr = self._get_ocr()
        try:
            predict = getattr(ocr, "predict", None)
            if callable(predict):
                raw_result = list(predict(image))
            else:
                try:
                    raw_result = ocr.ocr(image, cls=True)
                except TypeError:
                    raw_result = ocr.ocr(image)
        except Exception as exc:
            raise TextRecognitionError(f"PaddleOCR failed: {exc}") from exc

        lines = self._parse_ocr_result(raw_result)
        text = "\n".join(line["text"] for line in lines)
        confidence = sum(line["confidence"] for line in lines) / len(lines) if lines else 0.0
        return text, confidence, lines

    @staticmethod
    def _looks_like_degraded_vietnamese(text: str) -> bool:
        normalized = unicodedata.normalize("NFC", text).lower()
        tokens = re.findall(r"[a-zA-ZÀ-ỹĐđ]+", normalized)
        degraded_count = sum(token in VIETNAMESE_DEGRADED_TOKENS for token in tokens)

        # PaddleOCR can report high confidence while silently dropping Vietnamese
        # diacritics. A few characteristic truncated words are a stronger signal.
        return degraded_count >= VIETNAMESE_DEGRADED_TOKEN_THRESHOLD

    def _get_ocr(self):
        if self._ocr is not None:
            return self._ocr
        with self._ocr_lock:
            if self._ocr is None:
                self._ocr = self._ocr_factory()
        return self._ocr

    @staticmethod
    def _create_paddle_ocr():
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise PaddleOCRUnavailableError(
                "Install paddlepaddle and paddleocr to enable local OCR."
            ) from exc

        try:
            return PaddleOCR(
                text_detection_model_name="PP-OCRv5_mobile_det",
                text_recognition_model_name="latin_PP-OCRv5_mobile_rec",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=True,
                enable_mkldnn=False,
            )
        except TypeError:
            return PaddleOCR(use_angle_cls=True, lang="vi", show_log=False)
        except Exception as exc:
            raise PaddleOCRUnavailableError(f"Could not initialize PaddleOCR: {exc}") from exc

    @staticmethod
    def _parse_ocr_result(raw_result) -> list[dict]:
        lines = []
        if not raw_result:
            return lines

        legacy_items = raw_result[0] if len(raw_result) == 1 and isinstance(raw_result[0], list) else raw_result
        for item in legacy_items:
            if (
                isinstance(item, (list, tuple))
                and len(item) >= 2
                and isinstance(item[1], (list, tuple))
                and len(item[1]) >= 2
                and isinstance(item[1][0], str)
            ):
                lines.append(
                    {
                        "text": item[1][0].strip(),
                        "confidence": float(item[1][1]),
                        "box": item[0],
                    }
                )
        if lines:
            return [line for line in lines if line["text"]]

        for result in raw_result:
            payload = result if isinstance(result, dict) else (
                getattr(result, "json", None) or getattr(result, "res", None)
            )
            if callable(payload):
                payload = payload()
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    continue
            if not isinstance(payload, dict):
                continue
            payload = payload.get("res", payload)
            texts = payload.get("rec_texts", [])
            scores = payload.get("rec_scores", [])
            boxes = payload.get("rec_polys", payload.get("dt_polys", []))
            for index, text in enumerate(texts):
                clean_text = str(text).strip()
                if clean_text:
                    box = boxes[index] if index < len(boxes) else []
                    lines.append(
                        {
                            "text": clean_text,
                            "confidence": float(scores[index]) if index < len(scores) else 0.0,
                            "box": box.tolist() if hasattr(box, "tolist") else box,
                        }
                    )
        return lines

    @staticmethod
    def _crop_and_correct_document(image: np.ndarray) -> tuple[np.ndarray, bool]:
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)
        edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:10]:
            if cv2.contourArea(contour) / float(height * width) < MIN_DOCUMENT_AREA_RATIO:
                continue
            perimeter = cv2.arcLength(contour, True)
            polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
            if len(polygon) == 4:
                return TextRecognitionService._four_point_transform(image, polygon.reshape(4, 2)), True
        return image, False

    @staticmethod
    def _four_point_transform(image: np.ndarray, points: np.ndarray) -> np.ndarray:
        points = points.astype("float32")
        ordered = np.zeros((4, 2), dtype="float32")
        point_sum = points.sum(axis=1)
        point_diff = np.diff(points, axis=1).reshape(-1)
        ordered[0] = points[np.argmin(point_sum)]
        ordered[2] = points[np.argmax(point_sum)]
        ordered[1] = points[np.argmin(point_diff)]
        ordered[3] = points[np.argmax(point_diff)]

        top_left, top_right, bottom_right, bottom_left = ordered
        width = int(max(np.linalg.norm(bottom_right - bottom_left), np.linalg.norm(top_right - top_left)))
        height = int(max(np.linalg.norm(top_right - bottom_right), np.linalg.norm(top_left - bottom_left)))
        if width < 2 or height < 2:
            return image

        destination = np.array(
            [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
            dtype="float32",
        )
        matrix = cv2.getPerspectiveTransform(ordered, destination)
        return cv2.warpPerspective(image, matrix, (width, height))

    @staticmethod
    def _decode_image(image_bytes: bytes) -> np.ndarray:
        image = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise TextRecognitionError("Invalid image data.")
        return image

    @staticmethod
    def _encode_jpeg(image: np.ndarray) -> bytes:
        success, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        if not success:
            raise TextRecognitionError("Could not encode the processed document image.")
        return buffer.tobytes()

    @staticmethod
    def _blur_label(score: float) -> str:
        if score < MIN_BLUR_SCORE:
            return "too_blurry"
        if score < LOW_BLUR_SCORE:
            return "low"
        return "good"

    @staticmethod
    def _brightness_label(score: float, contrast_score: float) -> str:
        if score < MIN_BRIGHTNESS:
            return "too_dark"
        if score > MAX_BRIGHTNESS:
            return "overexposed" if contrast_score < LOW_CONTRAST_STD else "bright"
        return "good"
