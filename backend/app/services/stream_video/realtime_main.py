import cv2
import numpy as np
import os
import base64
import time
import threading
from queue import Queue
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from config import config
from langchain_google_genai import ChatGoogleGenerativeAI

# Initialize Gemini client
gemini_client = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.3,
    google_api_key=config.GOOGLE_API_KEY
)

# Global variables
description_queue = Queue()  # Queue for descriptions to send to frontend
current_frame = None
previous_frame = None
is_running = True


def encode_image_from_frame(frame):
    """Encode OpenCV frame to base64 JPEG"""
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return base64.b64encode(buffer).decode('utf-8')


def detect_significant_change(frame1, frame2, threshold=0.15):
    """Detect if there's significant change between two frames"""
    if frame1 is None or frame2 is None:
        return True
    
    # Resize for faster comparison
    frame1_small = cv2.resize(frame1, (320, 240))
    frame2_small = cv2.resize(frame2, (320, 240))
    
    # Calculate difference
    diff = cv2.absdiff(frame1_small, frame2_small)
    change_ratio = np.sum(diff > 30) / diff.size
    
    return change_ratio > threshold


def create_vision_message(base64_image):
    """Create message for Gemini vision API"""
    image_url = f"data:image/jpeg;base64,{base64_image}"
    return [
        {
            "role": "system",
            "content": "You are a real-time scene narrator for visually impaired users. Describe scenes naturally and conversationally in 1-2 short sentences. Focus on important objects, people, and spatial relationships. Be concise but informative."
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": image_url}
                }
            ]
        }
    ]


def analyze_image(base64_image):
    """Analyze image using Gemini and return description"""
    try:
        messages = create_vision_message(base64_image)
        
        # Invoke Gemini
        response = gemini_client.invoke(messages)
        
        description = response.content.strip()
        print(f"[DESCRIPTION] {description}")
        print()  # New line
        
        return description
    except Exception as e:
        print(f"[ERROR] Gemini analysis failed: {e}")
        return None


def capture_video_stream():
    """Capture video frames continuously"""
    global current_frame, is_running
    
    print("[VIDEO] Starting camera...")
    cap = cv2.VideoCapture(0)  # 0 for webcam, or video file path
    
    if not cap.isOpened():
        print("[ERROR] Cannot open camera")
        return
    
    # Set camera properties for better performance
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    print("[VIDEO] Camera opened successfully")
    
    while is_running:
        ret, frame = cap.read()
        if ret:
            current_frame = frame.copy()
            
            # Optional: Display preview window
            cv2.imshow('Real-time Description (Press Q to quit)', frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                is_running = False
                break
        else:
            print("[VIDEO] Failed to capture frame")
            time.sleep(0.1)
    
    cap.release()
    cv2.destroyAllWindows()
    print("[VIDEO] Camera stopped")


def process_frames():
    """Process frames and generate descriptions"""
    global current_frame, previous_frame, is_running
    
    print("[PROCESS] Starting frame processor...")
    last_description_time = 0
    description_interval = 3  # Describe every 3 seconds
    
    while is_running:
        try:
            # Wait for frame to be available
            if current_frame is None:
                time.sleep(0.5)
                continue
            
            current_time = time.time()
            
            # Check if enough time has passed
            if current_time - last_description_time < description_interval:
                time.sleep(0.5)
                continue
            
            # Check for significant change
            if not detect_significant_change(previous_frame, current_frame):
                print("[PROCESS] No significant change detected, skipping...")
                time.sleep(1)
                continue
            
            # Process frame
            frame_to_process = current_frame.copy()
            previous_frame = frame_to_process.copy()
            
            print(f"\n[PROCESS] Analyzing frame at {time.strftime('%H:%M:%S')}...")
            base64_image = encode_image_from_frame(frame_to_process)
            
            # Analyze image
            description = analyze_image(base64_image)
            
            if description:
                # Put description in queue for WebSocket/API to consume
                description_queue.put({
                    "timestamp": time.time(),
                    "description": description
                })
                last_description_time = current_time
            
        except Exception as e:
            print(f"[PROCESS ERROR] {e}")
            time.sleep(1)
    
    print("[PROCESS] Frame processor stopped")


def get_latest_description():
    """Get latest description from queue (non-blocking)"""
    try:
        return description_queue.get_nowait()
    except:
        return None


def main():
    """Main function to run real-time description"""
    global is_running
    
    print("="*60)
    print("🎥 REAL-TIME SCENE DESCRIPTION (Backend Only)")
    print("="*60)
    print("Camera will start automatically.")
    print("Descriptions generated every 3 seconds when changes detected.")
    print("Descriptions available via get_latest_description() for WebSocket/API.")
    print("Press 'Q' in video window or Ctrl+C to stop.")
    print("="*60)
    print()
    
    # Create threads
    video_thread = threading.Thread(target=capture_video_stream, daemon=True)
    process_thread = threading.Thread(target=process_frames, daemon=True)
    
    try:
        # Start all threads
        video_thread.start()
        time.sleep(1)  # Wait for camera to initialize
        process_thread.start()
        
        # Keep main thread alive
        video_thread.join()
        
    except KeyboardInterrupt:
        print("\n[MAIN] Stopping...")
    finally:
        is_running = False
        time.sleep(2)  # Wait for threads to finish
        print("[MAIN] Application stopped")


if __name__ == "__main__":
    main()
