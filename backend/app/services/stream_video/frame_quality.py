import cv2
import numpy as np

from .schemas import FrameQuality


def check_frame_quality(
    frame: np.ndarray,
    min_brightness: float = 45.0,
    min_blur_score: float = 60.0,
) -> FrameQuality:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    brightness = float(gray.mean())
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if brightness < min_brightness:
        return FrameQuality(
            valid=True,
            warning="dark",
            blur_score=round(blur_score, 2),
            brightness=round(brightness, 2),
        )
    if blur_score < min_blur_score:
        return FrameQuality(
            valid=True,
            warning="blur",
            blur_score=round(blur_score, 2),
            brightness=round(brightness, 2),
        )
    return FrameQuality(
        valid=True,
        blur_score=round(blur_score, 2),
        brightness=round(brightness, 2),
    )
