import cv2
import time
from app.services.outdoor_navigation.utils.circularBuffer import CircularBuffer

# ============================================================
# Always use video (no webcam)
# ============================================================

stream = None
images_queue = None

def init_capturer(video_path: str):
    global stream, images_queue
    if stream is None:
        stream = cv2.VideoCapture(video_path)
        if not stream.isOpened():
            raise RuntimeError(f"[ERROR] Could not open video file: {video_path}")
        images_queue = CircularBuffer(2)
    return stream

def capturer(video_path: str):
    global stream, images_queue
    init_capturer(video_path=video_path)
    print("Capturing Starting (VIDEO MODE)")
    first_run = True

    while True:
        ret, frame = stream.read()

        # When video ends, restart
        if not ret or frame is None:
            stream.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        images_queue.add(frame)

        time.sleep(2 if first_run else 0.03)
        first_run = False


def get_images(video_path: str):
    global images_queue
    if images_queue is None:
        init_capturer(video_path=video_path)
    return images_queue
