import base64
import time
import unittest

import cv2
import numpy as np

from app.services.stream_video.change_detection import calculate_change_ratio
from app.services.stream_video.frame_quality import check_frame_quality
from app.services.stream_video.gemini_analyzer import decide_gemini_usage, limit_words
from app.services.stream_video.object_detector import ObjectDetectorError
from app.services.stream_video.pipeline import RealtimeDescriptionPipeline, RealtimeSessionState
from app.services.stream_video.risk_analyzer import (
    analyze_risks,
    has_overlapping_important_objects,
)
from app.services.stream_video.schemas import Detection, GeminiDecision, RiskLevel
from app.services.stream_video.speech_generator import generate_speech


def checkerboard() -> np.ndarray:
    grid = np.indices((480, 640)).sum(axis=0) % 2
    gray = (grid * 180 + 50).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def encode_frame(frame: np.ndarray) -> str:
    success, buffer = cv2.imencode(".jpg", frame)
    assert success
    return base64.b64encode(buffer).decode("utf-8")


def detection(
    class_name="chair",
    confidence=0.88,
    position="center",
    area_ratio=0.22,
    box=None,
) -> Detection:
    return Detection(
        class_name=class_name,
        confidence=confidence,
        bounding_box=box or [100, 100, 400, 400],
        position=position,
        area_ratio=area_ratio,
    )


class FakeDetector:
    def __init__(self, detections):
        self.detections = detections
        self.calls = 0

    def detect(self, _frame):
        self.calls += 1
        return [item.model_copy(deep=True) for item in self.detections]


class FakeGemini:
    def __init__(self, response="Mô tả ngữ cảnh an toàn."):
        self.response = response
        self.calls = 0

    def analyze(self, **_kwargs):
        self.calls += 1
        return self.response


class FailingDetector:
    def detect(self, _frame):
        raise ObjectDetectorError("detector unavailable")


class RealtimeDescriptionTests(unittest.TestCase):
    def test_dark_frame_is_allowed_with_metadata_warning(self):
        quality = check_frame_quality(np.zeros((480, 640, 3), dtype=np.uint8))

        self.assertTrue(quality.valid)
        self.assertEqual(quality.warning, "dark")
        self.assertEqual(quality.speech_output, "")

    def test_bright_flat_frame_is_allowed_with_blur_warning(self):
        quality = check_frame_quality(np.full((480, 640, 3), 130, dtype=np.uint8))

        self.assertTrue(quality.valid)
        self.assertEqual(quality.warning, "blur")
        self.assertEqual(quality.speech_output, "")

    def test_mild_blur_warns_but_still_allows_processing(self):
        quality = check_frame_quality(
            checkerboard(),
            min_blur_score=1_000_000,
        )

        self.assertTrue(quality.valid)
        self.assertEqual(quality.warning, "blur")

    def test_unchanged_frame_skips_detector_and_gemini(self):
        frame = checkerboard()
        detector = FakeDetector([detection()])
        gemini = FakeGemini()
        pipeline = RealtimeDescriptionPipeline(detector=detector, gemini=gemini)
        state = RealtimeSessionState(previous_frame=frame.copy())

        response = pipeline.process(encode_frame(frame), state)

        self.assertEqual(response.status, "no_change")
        self.assertLess(response.change_ratio, 0.08)
        self.assertEqual(detector.calls, 0)
        self.assertEqual(gemini.calls, 0)

    def test_chair_ahead_close_is_high_risk_without_gemini(self):
        detector = FakeDetector([detection()])
        gemini = FakeGemini()
        pipeline = RealtimeDescriptionPipeline(detector=detector, gemini=gemini)

        response = pipeline.process(encode_frame(checkerboard()), RealtimeSessionState())

        self.assertEqual(response.risk_level, RiskLevel.HIGH)
        self.assertFalse(response.gemini_used)
        self.assertTrue(response.speech_output.startswith("Cảnh báo:"))
        self.assertIn("phía trước", response.speech_output)

    def test_mild_blur_does_not_block_detector(self):
        detector = FakeDetector([detection()])
        pipeline = RealtimeDescriptionPipeline(
            detector=detector,
            gemini=FakeGemini(),
            min_blur_score=1_000_000,
        )

        response = pipeline.process(encode_frame(checkerboard()), RealtimeSessionState())

        self.assertEqual(response.status, "success")
        self.assertEqual(response.frame_quality.warning, "blur")
        self.assertEqual(detector.calls, 1)

    def test_dark_frame_still_reaches_detector(self):
        detector = FakeDetector([detection()])
        pipeline = RealtimeDescriptionPipeline(detector=detector, gemini=FakeGemini())

        response = pipeline.process(
            encode_frame(np.zeros((480, 640, 3), dtype=np.uint8)),
            RealtimeSessionState(),
        )

        self.assertEqual(response.status, "success")
        self.assertEqual(response.frame_quality.warning, "dark")
        self.assertEqual(detector.calls, 1)

    def test_open_question_calls_gemini(self):
        detector = FakeDetector([])
        gemini = FakeGemini("Bạn có thể đi tiếp chậm rãi.")
        pipeline = RealtimeDescriptionPipeline(detector=detector, gemini=gemini)

        response = pipeline.process(
            encode_frame(checkerboard()),
            RealtimeSessionState(),
            question="Tôi có thể đi tiếp không?",
        )

        self.assertTrue(response.gemini_used)
        self.assertIn("open_question", response.gemini_reasons)
        self.assertEqual(response.speech_output, "Bạn có thể đi tiếp chậm rãi.")

    def test_strong_change_without_important_objects_skips_gemini(self):
        decision = decide_gemini_usage(
            change_ratio=1.0,
            detections=[detection(class_name="remote", confidence=0.7)],
            risk_level=RiskLevel.NO_RISK,
            question=None,
        )

        self.assertFalse(decision.use_gemini)

    def test_uncertain_object_on_left_skips_gemini(self):
        uncertain = detection(
            class_name="bottle",
            confidence=0.45,
            position="left",
            area_ratio=0.25,
        )
        analyzed, overall = analyze_risks([uncertain])

        decision = decide_gemini_usage(0.10, analyzed, overall, None)

        self.assertFalse(decision.use_gemini)

    def test_moderate_risk_uses_rule_even_with_lower_confidence(self):
        obstacle = detection(
            class_name="bottle",
            confidence=0.52,
            position="center",
            area_ratio=0.25,
        )
        analyzed, overall = analyze_risks([obstacle])

        decision = decide_gemini_usage(0.20, analyzed, overall, None)

        self.assertEqual(overall, RiskLevel.MODERATE)
        self.assertFalse(decision.use_gemini)

    def test_three_official_detections_trigger_gemini(self):
        detections = [
            detection(class_name="person", confidence=0.85, position="center"),
            detection(class_name="remote", confidence=0.70, position="left"),
            detection(class_name="cup", confidence=0.60, position="right"),
        ]
        analyzed, overall = analyze_risks(detections)

        decision = decide_gemini_usage(0.10, analyzed, overall, None)

        self.assertTrue(decision.use_gemini)
        self.assertIn("three_or_more_objects", decision.reasons)

    def test_three_low_confidence_detections_do_not_trigger_object_count(self):
        detections = [
            detection(class_name="person", confidence=0.35, position="left"),
            detection(class_name="remote", confidence=0.35, position="left"),
            detection(class_name="cup", confidence=0.35, position="right"),
        ]
        analyzed, overall = analyze_risks(detections)

        decision = decide_gemini_usage(0.10, analyzed, overall, None)

        self.assertNotIn("three_or_more_objects", decision.reasons)

    def test_automatic_gemini_respects_cooldown(self):
        pipeline = RealtimeDescriptionPipeline(
            detector=FakeDetector([]),
            gemini=FakeGemini(),
            gemini_cooldown_seconds=5,
        )
        state = RealtimeSessionState(last_gemini_at=time.monotonic())

        decision = pipeline._apply_gemini_cooldown(
            GeminiDecision(use_gemini=True, reasons=["overlapping_objects"]),
            state,
            question=None,
        )

        self.assertFalse(decision.use_gemini)
        self.assertIn("gemini_cooldown", decision.reasons)

    def test_open_question_bypasses_gemini_cooldown(self):
        pipeline = RealtimeDescriptionPipeline(
            detector=FakeDetector([]),
            gemini=FakeGemini(),
            gemini_cooldown_seconds=5,
        )
        state = RealtimeSessionState(last_gemini_at=time.monotonic())

        decision = pipeline._apply_gemini_cooldown(
            GeminiDecision(use_gemini=True, reasons=["open_question"]),
            state,
            question="Xung quanh tôi có gì?",
        )

        self.assertTrue(decision.use_gemini)

    def test_risk_scoring_and_speech_direction(self):
        analyzed, overall = analyze_risks(
            [detection(position="left", area_ratio=0.10, confidence=0.8)]
        )

        self.assertEqual(analyzed[0].risk_score, 4)
        self.assertEqual(overall, RiskLevel.LOW)
        self.assertIn("bên trái", generate_speech(analyzed, overall))

    def test_overlapping_objects_trigger_gemini_reason(self):
        first = detection(confidence=0.6, position="left", area_ratio=0.03, box=[100, 100, 400, 400])
        second = detection(
            class_name="person",
            confidence=0.6,
            position="right",
            area_ratio=0.03,
            box=[120, 120, 390, 390],
        )
        analyzed, overall = analyze_risks([first, second])

        self.assertTrue(has_overlapping_important_objects(analyzed))
        decision = decide_gemini_usage(0.10, analyzed, overall, None)
        self.assertIn("overlapping_objects", decision.reasons)

    def test_detector_failure_uses_gemini_fallback(self):
        gemini = FakeGemini("Tôi chưa thấy vật cản rõ ràng.")
        pipeline = RealtimeDescriptionPipeline(detector=FailingDetector(), gemini=gemini)

        response = pipeline.process(encode_frame(checkerboard()), RealtimeSessionState())

        self.assertTrue(response.gemini_used)
        self.assertIn("local_detector_unavailable", response.gemini_reasons)
        self.assertIsNotNone(response.local_detector_error)

    def test_session_states_do_not_share_previous_frames(self):
        frame = checkerboard()
        self.assertEqual(calculate_change_ratio(frame, frame), 0.0)
        self.assertEqual(calculate_change_ratio(None, frame), 1.0)

    def test_gemini_output_is_limited_to_25_words(self):
        output = limit_words(" ".join(f"word{i}" for i in range(30)), 25)

        self.assertEqual(len(output.rstrip(".").split()), 25)


if __name__ == "__main__":
    unittest.main()
