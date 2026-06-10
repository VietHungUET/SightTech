import cv2
import numpy as np


def calculate_change_ratio(
    previous_frame: np.ndarray | None,
    current_frame: np.ndarray,
    pixel_threshold: int = 30,
) -> float:
    if previous_frame is None:
        return 1.0

    previous_gray = cv2.cvtColor(previous_frame, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
    previous_small = cv2.resize(previous_gray, (320, 240))
    current_small = cv2.resize(current_gray, (320, 240))
    difference = cv2.absdiff(previous_small, current_small)
    return float(np.count_nonzero(difference > pixel_threshold) / difference.size)
