import base64
import logging
import time
from dataclasses import dataclass

import cv2
import numpy as np

from .change_detection import calculate_change_ratio
from .frame_quality import check_frame_quality
from .gemini_analyzer import GeminiSafetyAnalyzer, decide_gemini_usage
from .object_detector import ObjectDetectorError, YoloObjectDetector
from .risk_analyzer import analyze_risks
from .schemas import GeminiDecision, PipelineResponse, RiskLevel
from .speech_generator import generate_speech

logger = logging.getLogger(__name__)


@dataclass
class RealtimeSessionState:
    previous_frame: np.ndarray | None = None
    processing: bool = False
    last_speech_output: str = ""
    frame_index: int = 0
    last_gemini_at: float = 0.0


class RealtimeDescriptionPipeline:
    def __init__(
        self,
        detector: YoloObjectDetector,
        gemini: GeminiSafetyAnalyzer,
        min_brightness: float = 45.0,
        min_blur_score: float = 60.0,
        change_threshold: float = 0.08,
        strong_change_threshold: float = 0.15,
        min_detection_confidence: float = 0.40,
        many_objects_threshold: int = 3,
        overlap_iou_threshold: float = 0.40,
        gemini_cooldown_seconds: float = 5.0,
        debug_logs: bool = False,
    ):
        self.detector = detector
        self.gemini = gemini
        self.min_brightness = min_brightness
        self.min_blur_score = min_blur_score
        self.change_threshold = change_threshold
        self.strong_change_threshold = strong_change_threshold
        self.min_detection_confidence = min_detection_confidence
        self.many_objects_threshold = many_objects_threshold
        self.overlap_iou_threshold = overlap_iou_threshold
        self.gemini_cooldown_seconds = gemini_cooldown_seconds
        self.debug_logs = debug_logs

    def process(
        self,
        base64_image: str,
        state: RealtimeSessionState,
        question: str | None = None,
    ) -> PipelineResponse:
        started_at = time.perf_counter()
        state.frame_index += 1
        frame_index = state.frame_index
        frame = decode_base64_frame(base64_image)
        quality = check_frame_quality(
            frame,
            self.min_brightness,
            self.min_blur_score,
        )
        if self.debug_logs:
            logger.info(
                "Realtime frame=%s quality brightness=%.2f blur_score=%.2f warning=%s",
                frame_index,
                quality.brightness,
                quality.blur_score,
                quality.warning,
            )

        change_ratio = calculate_change_ratio(state.previous_frame, frame)
        if change_ratio < self.change_threshold and not question:
            if self.debug_logs:
                logger.info(
                    "Realtime frame=%s skipped reason=no_change change_ratio=%.4f threshold=%.4f duration_ms=%.1f",
                    frame_index,
                    change_ratio,
                    self.change_threshold,
                    (time.perf_counter() - started_at) * 1000,
                )
            return PipelineResponse(
                status="no_change",
                change_ratio=round(change_ratio, 4),
                frame_quality=quality,
            )

        detector_error = None
        raw_detections = []
        try:
            raw_detections = self.detector.detect(frame)
        except ObjectDetectorError as exc:
            detector_error = str(exc)
            logger.warning("Local object detector unavailable: %s", exc)

        analyzed_raw, _ = analyze_risks(raw_detections)
        detections = [
            item for item in analyzed_raw if item.confidence >= self.min_detection_confidence
        ]
        detections, risk_level = analyze_risks(detections)
        rule_speech = generate_speech(detections, risk_level)
        decision = decide_gemini_usage(
            change_ratio=change_ratio,
            detections=analyzed_raw,
            risk_level=risk_level,
            question=question,
            detector_error=detector_error,
            strong_change_threshold=self.strong_change_threshold,
            many_objects_threshold=self.many_objects_threshold,
            official_detection_confidence=self.min_detection_confidence,
            overlap_iou_threshold=self.overlap_iou_threshold,
        )
        decision = self._apply_gemini_cooldown(decision, state, question)
        if self.debug_logs:
            logger.info(
                "Realtime frame=%s risk risk_level=%s kept_detections=%s gemini=%s reasons=%s",
                frame_index,
                risk_level.value,
                [
                    {
                        "class": item.class_name,
                        "confidence": item.confidence,
                        "position": item.position,
                        "area_ratio": item.area_ratio,
                        "risk_score": item.risk_score,
                    }
                    for item in detections
                ],
                decision.use_gemini,
                decision.reasons,
            )

        speech_output = rule_speech
        gemini_used = False
        if decision.use_gemini:
            try:
                gemini_started_at = time.perf_counter()
                state.last_gemini_at = time.monotonic()
                speech_output = self.gemini.analyze(
                    base64_image=strip_data_url(base64_image),
                    detections=detections,
                    risk_level=risk_level,
                    question=question,
                )
                gemini_used = True
                if self.debug_logs:
                    logger.info(
                        "Realtime frame=%s Gemini completed duration_ms=%.1f",
                        frame_index,
                        (time.perf_counter() - gemini_started_at) * 1000,
                    )
            except Exception as exc:
                logger.warning("Gemini safety analysis failed: %s", exc)
                if not speech_output:
                    speech_output = "Tôi chưa thể xác định rõ khung cảnh. Bạn hãy đi chậm và thận trọng."

        state.previous_frame = frame.copy()
        state.last_speech_output = speech_output
        if self.debug_logs:
            logger.info(
                "Realtime frame=%s completed status=success risk_level=%s gemini_used=%s speech_words=%s duration_ms=%.1f",
                frame_index,
                risk_level.value,
                gemini_used,
                len(speech_output.split()),
                (time.perf_counter() - started_at) * 1000,
            )
        return PipelineResponse(
            status="success",
            text=speech_output,
            speech_output=speech_output,
            risk_level=risk_level,
            change_ratio=round(change_ratio, 4),
            gemini_used=gemini_used,
            gemini_reasons=decision.reasons,
            detections=detections,
            frame_quality=quality,
            local_detector_error=detector_error,
        )

    def _apply_gemini_cooldown(
        self,
        decision: GeminiDecision,
        state: RealtimeSessionState,
        question: str | None,
    ) -> GeminiDecision:
        if not decision.use_gemini or question:
            return decision
        seconds_since_last = time.monotonic() - state.last_gemini_at
        if state.last_gemini_at and seconds_since_last < self.gemini_cooldown_seconds:
            return GeminiDecision(
                use_gemini=False,
                reasons=[*decision.reasons, "gemini_cooldown"],
            )
        return decision


def decode_base64_frame(base64_image: str) -> np.ndarray:
    try:
        image_bytes = base64.b64decode(strip_data_url(base64_image), validate=True)
        frame = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
    except Exception as exc:
        raise ValueError("Invalid base64 image data.") from exc
    if frame is None:
        raise ValueError("Invalid image data.")
    return frame


def strip_data_url(base64_image: str) -> str:
    return base64_image.split(",", 1)[1] if "," in base64_image else base64_image
