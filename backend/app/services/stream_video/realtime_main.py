"""Optional local-camera runner for the shared real-time safety pipeline."""

import base64
import time

import cv2

from .pipeline import RealtimeSessionState
from .websocket_server import realtime_pipeline


def encode_image_from_frame(frame) -> str:
    success, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    if not success:
        raise RuntimeError("Could not encode camera frame.")
    return base64.b64encode(buffer).decode("utf-8")


def main():
    state = RealtimeSessionState()
    camera = cv2.VideoCapture(0)
    if not camera.isOpened():
        raise RuntimeError("Cannot open camera.")

    print("Safety-first real-time description started. Press Ctrl+C to stop.")
    try:
        while True:
            success, frame = camera.read()
            if not success:
                time.sleep(0.2)
                continue
            response = realtime_pipeline.process(encode_image_from_frame(frame), state)
            if response.speech_output:
                print(response.speech_output)
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("Real-time description stopped.")
    finally:
        camera.release()


if __name__ == "__main__":
    main()
