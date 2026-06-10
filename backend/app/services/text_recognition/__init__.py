"""Hybrid local-first text recognition service."""

from .pipeline import (
    ImageQualityError,
    PaddleOCRUnavailableError,
    TextRecognitionError,
    TextRecognitionService,
)

__all__ = [
    "ImageQualityError",
    "PaddleOCRUnavailableError",
    "TextRecognitionError",
    "TextRecognitionService",
]
