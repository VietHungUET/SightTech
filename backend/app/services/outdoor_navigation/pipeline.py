"""
Outdoor Navigation Pipeline
Combines sidewalk classification and turn detection for navigation assistance.
"""

import cv2
import numpy as np
import threading
import time
from typing import Optional, Dict
from concurrent.futures import ThreadPoolExecutor

from app.services.outdoor_navigation.sidewalk_classification import SidewalkClassification
from app.services.outdoor_navigation.turn_classification import TurnClassification


class OutdoorNavigationPipeline:
    """
    Pipeline that combines sidewalk position detection and turn detection
    to provide comprehensive outdoor navigation guidance.
    """

    def __init__(self):
        """
        Initialize the outdoor navigation pipeline.
        Pipeline processes frames received from frontend via WebSocket.
        """
        print("\n" + "=" * 60)
        print("[Pipeline] Initializing Outdoor Navigation")
        print("=" * 60)
        
        # Initialize models (load weights first)
        self.sidewalk_classifier = SidewalkClassification()
        self.turn_classifier = TurnClassification()
        
        # State management
        self.is_running = False
        self.models_ready = True
        
        # Thread pool for parallel inference
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Latest results
        self.latest_frame = None
        self.latest_sidewalk = None
        self.latest_turn = None
        self.latest_guidance = None
        
        # Threading locks
        self.lock = threading.Lock()
        
        print("[Pipeline] Ready to start")
        print("=" * 60 + "\n")

    def start(self):
        """Start the navigation pipeline"""
        if self.is_running:
            print("[Pipeline] Already running")
            return
        
        if not self.models_ready:
            print("[Pipeline] Error: Models not ready")
            return
        
        self.is_running = True
        print("[Pipeline] Started - Ready to process frames")

    def stop(self):
        """Stop the navigation pipeline"""
        if not self.is_running:
            return
        
        self.is_running = False
        self.executor.shutdown(wait=False)
        print("[Pipeline] Stopped")

    def process_frame(self, frame: np.ndarray) -> Dict:
        """
        Process a single frame received from frontend.
        Runs both models in parallel for faster inference.
        """
        if not self.is_running:
            return None
            
        try:
            # Run both models in parallel
            sidewalk_future = self.executor.submit(self.sidewalk_classifier.predict, frame)
            turn_future = self.executor.submit(self.turn_classifier.predict, frame)
            
            # Wait for both results
            sidewalk_result = sidewalk_future.result()
            turn_result = turn_future.result()
            
            # Generate guidance
            guidance = self._generate_guidance(sidewalk_result, turn_result)
            
            # Update latest results
            with self.lock:
                self.latest_frame = frame.copy()
                self.latest_sidewalk = sidewalk_result
                self.latest_turn = turn_result
                self.latest_guidance = guidance
            
            return {
                "sidewalk": sidewalk_result,
                "turn": turn_result,
                "guidance": guidance,
                "timestamp": time.time(),
                "frame": frame
            }
            
        except Exception as e:
            print(f"[Pipeline] Error: {e}")
            return None

    def _generate_guidance(self, sidewalk: str, turn: str) -> str:
        """
        Generate interpretable navigation guidance based on sidewalk position and turn detection.
        
        Args:
            sidewalk: Sidewalk position result
            turn: Turn detection result
            
        Returns:
            Clear, actionable navigation guidance string
        """
        # Priority 1: Turn detection (immediate action)
        if turn and turn != "No Turn":
            if turn == "Left Turn":
                return "Turn left ahead"
            elif turn == "Right Turn":
                return "Turn right ahead"
        
        # Priority 2: Sidewalk position (continuous adjustment)
        if sidewalk:
            if sidewalk == "Left of Sidewalk":
                return "Move right to stay on sidewalk"
            elif sidewalk == "Right of Sidewalk":
                return "Move left to stay on sidewalk"
            elif sidewalk == "Middle of Sidewalk":
                return "Keep going straight"
            elif sidewalk == "Nothing Detected":
                return "Caution: No sidewalk detected"
        
        return "Analyzing environment"

    def get_latest_result(self) -> Optional[Dict]:
        """
        Get the latest navigation result.
        
        Returns:
            Dictionary with sidewalk, turn, guidance, and frame
        """
        with self.lock:
            if self.latest_frame is None:
                return None
            
            return {
                "sidewalk": self.latest_sidewalk,
                "turn": self.latest_turn,
                "guidance": self.latest_guidance,
                "frame": self.latest_frame.copy()
            }

    def render_result(self, frame: np.ndarray, sidewalk: str, turn: str, guidance: str) -> np.ndarray:
        """
        Render navigation results on frame.
        
        Args:
            frame: Input frame
            sidewalk: Sidewalk position
            turn: Turn direction
            guidance: Navigation guidance text
            
        Returns:
            Frame with rendered results
        """
        display_frame = frame.copy()
        font = cv2.FONT_HERSHEY_SIMPLEX
        
        # Background for text
        overlay = display_frame.copy()
        cv2.rectangle(overlay, (10, 10), (display_frame.shape[1] - 10, 120), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.6, display_frame, 0.4, 0, display_frame)
        
        # Draw text
        y_offset = 30
        
        # Sidewalk position
        if sidewalk:
            cv2.putText(display_frame, f"Position: {sidewalk}", 
                       (20, y_offset), font, 0.7, (0, 255, 255), 2)
            y_offset += 30
        
        # Turn detection
        if turn:
            color = (0, 255, 0) if turn == "No Turn" else (0, 165, 255)
            cv2.putText(display_frame, f"Turn: {turn}", 
                       (20, y_offset), font, 0.7, color, 2)
            y_offset += 30
        
        # Guidance
        if guidance:
            cv2.putText(display_frame, f"Guidance: {guidance}", 
                       (20, y_offset), font, 0.7, (255, 255, 255), 2)
        
        return display_frame


# Example usage
if __name__ == "__main__":
    # Test with video file
    video_path = r"examples/outdoor_navigation/ShiftSidewalk.mp4"
    
    pipeline = OutdoorNavigationPipeline(use_camera=False, video_path=video_path)
    pipeline.start()
    
    print("\n>>> Running navigation pipeline...")
    print(">>> Press 'q' to quit\n")
    
    try:
        while True:
            result = pipeline.get_latest_result()
            
            if result:
                frame = result["frame"]
                sidewalk = result["sidewalk"]
                turn = result["turn"]
                guidance = result["guidance"]
                
                # Render and display
                display_frame = pipeline.render_result(frame, sidewalk, turn, guidance)
                cv2.imshow("Outdoor Navigation", display_frame)
                
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
            else:
                time.sleep(0.1)
                
    except KeyboardInterrupt:
        print("\n>>> Interrupted by user")
    finally:
        pipeline.stop()
        cv2.destroyAllWindows()
        print(">>> Stopped")
