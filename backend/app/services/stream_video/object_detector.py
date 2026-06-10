import os
import logging
import tempfile
import threading
import time

import numpy as np

from .schemas import Detection

logger = logging.getLogger(__name__)


class ObjectDetectorError(RuntimeError):
    """Raised when the local pretrained object detector is unavailable."""


class YoloObjectDetector:
    def __init__(
        self,
        model_path: str = "yolo11n.pt",
        inference_confidence: float = 0.30,
        debug_logs: bool = False,
    ):
        self.model_path = model_path
        self.inference_confidence = inference_confidence
        self.debug_logs = debug_logs
        self._model = None
        self._lock = threading.Lock()
        self._predict_lock = threading.Lock()

    def detect(self, frame: np.ndarray) -> list[Detection]:
        model = self._get_model()
        started_at = time.perf_counter()
        try:
            with self._predict_lock:
                results = model.predict(
                    source=frame,
                    conf=self.inference_confidence,
                    verbose=False,
                )
        except Exception as exc:
            raise ObjectDetectorError(f"YOLO inference failed: {exc}") from exc

        height, width = frame.shape[:2]
        detections: list[Detection] = []
        for result in results:
            names = result.names
            for box in result.boxes:
                coordinates = box.xyxy[0].tolist()
                confidence = float(box.conf[0])
                class_name = str(names[int(box.cls[0])])
                x1, y1, x2, y2 = coordinates
                center_x = (x1 + x2) / 2
                position = (
                    "left"
                    if center_x < width / 3
                    else "center"
                    if center_x < 2 * width / 3
                    else "right"
                )
                area_ratio = max(0.0, (x2 - x1) * (y2 - y1) / float(width * height))
                detections.append(
                    Detection(
                        class_name=class_name,
                        confidence=round(confidence, 3),
                        bounding_box=[round(value, 1) for value in coordinates],
                        position=position,
                        area_ratio=round(area_ratio, 4),
                    )
                )
        if self.debug_logs:
            logger.info(
                "YOLO inference completed duration_ms=%.1f raw_detections=%s detections=%s",
                (time.perf_counter() - started_at) * 1000,
                len(detections),
                [
                    {
                        "class": item.class_name,
                        "confidence": item.confidence,
                        "position": item.position,
                        "area_ratio": item.area_ratio,
                    }
                    for item in detections
                ],
            )
        return detections

    def _get_model(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            config_dir = os.getenv("YOLO_CONFIG_DIR") or os.path.join(
                tempfile.gettempdir(),
                "sighttech-ultralytics",
            )
            try:
                os.makedirs(config_dir, exist_ok=True)
            except OSError:
                logger.debug("Could not create YOLO config directory: %s", config_dir)
            os.environ["YOLO_CONFIG_DIR"] = config_dir
            if self.debug_logs:
                logger.info(
                    "Loading YOLO model model_path=%s config_dir=%s",
                    self.model_path,
                    config_dir,
                )
            try:
                from ultralytics import YOLO
            except ImportError as exc:
                raise ObjectDetectorError(
                    "Ultralytics is not installed; local YOLO detection is unavailable."
                ) from exc
            try:
                self._model = YOLO(self.model_path)
            except Exception as exc:
                raise ObjectDetectorError(f"Could not load YOLO model: {exc}") from exc
            if self.debug_logs:
                logger.info("YOLO model loaded model_path=%s", self.model_path)
        return self._model
