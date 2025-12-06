"""
WebSocket server for real-time video description.
Receives frames from frontend React WebCam component.
"""

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import asyncio
import json
import base64
import numpy as np
import cv2
from datetime import datetime

# Import the analysis function from realtime_main
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))
from config import config
from langchain_google_genai import ChatGoogleGenerativeAI

# Initialize Gemini client
gemini_client = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.3,
    google_api_key=config.GOOGLE_API_KEY
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.last_frame = None
        self.last_description_time = 0
        self.description_interval = 3  # seconds

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WebSocket] Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"[WebSocket] Client disconnected. Total connections: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        """Send message to specific client"""
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"[WebSocket Error] Failed to send message: {e}")

    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                disconnected.append(connection)
        
        # Remove disconnected clients
        for conn in disconnected:
            self.disconnect(conn)

manager = ConnectionManager()


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


async def analyze_frame(base64_image: str) -> str:
    """Analyze image using Gemini and return description"""
    try:
        messages = create_vision_message(base64_image)
        
        # Invoke Gemini
        response = gemini_client.invoke(messages)
        
        description = response.content.strip()
        print(f"[DESCRIPTION] {description}")
        
        return description
    except Exception as e:
        print(f"[ERROR] Gemini analysis failed: {e}")
        return None


def detect_significant_change(frame1_b64, frame2_b64, threshold=0.15):
    """Detect if there's significant change between two frames"""
    if frame1_b64 is None or frame2_b64 is None:
        return True
    
    try:
        # Decode base64 to numpy arrays
        frame1_data = base64.b64decode(frame1_b64)
        frame2_data = base64.b64decode(frame2_b64)
        
        frame1 = cv2.imdecode(np.frombuffer(frame1_data, np.uint8), cv2.IMREAD_COLOR)
        frame2 = cv2.imdecode(np.frombuffer(frame2_data, np.uint8), cv2.IMREAD_COLOR)
        
        if frame1 is None or frame2 is None:
            return True
        
        # Resize for faster comparison
        frame1_small = cv2.resize(frame1, (320, 240))
        frame2_small = cv2.resize(frame2, (320, 240))
        
        # Calculate difference
        diff = cv2.absdiff(frame1_small, frame2_small)
        change_ratio = np.sum(diff > 30) / diff.size
        
        return change_ratio > threshold
    except Exception as e:
        print(f"[ERROR] Change detection failed: {e}")
        return True


async def websocket_realtime_description(websocket: WebSocket):
    """
    WebSocket endpoint for real-time scene description.
    Receives frames from frontend React WebCam component.
    
    Frontend sends:
    {
        "type": "frame",
        "data": "base64_image_data",
        "timestamp": 1234567890
    }
    
    Backend responds with:
    {
        "type": "description",
        "text": "Scene description here",
        "timestamp": 1234567890
    }
    """
    await manager.connect(websocket)
    
    try:
        # Send initial status
        await manager.send_personal_message({
            "type": "status",
            "message": "Connected. Send frames to receive descriptions."
        }, websocket)
        
        while True:
            # Receive frame from frontend
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("type") == "frame":
                base64_image = message.get("data")
                current_time = datetime.now().timestamp()
                
                if not base64_image:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "No image data received"
                    }, websocket)
                    continue
                
                # Check if enough time has passed since last description
                time_since_last = current_time - manager.last_description_time
                if time_since_last < manager.description_interval:
                    print(f"[THROTTLE] Skipping frame, {manager.description_interval - time_since_last:.1f}s remaining")
                    continue
                
                # Check for significant change
                if not detect_significant_change(manager.last_frame, base64_image):
                    print("[PROCESS] No significant change detected, skipping...")
                    continue
                
                # Analyze the frame
                print(f"[PROCESS] Analyzing frame at {datetime.now().strftime('%H:%M:%S')}...")
                description = await analyze_frame(base64_image)
                
                if description:
                    # Update state
                    manager.last_frame = base64_image
                    manager.last_description_time = current_time
                    
                    # Send description back to client
                    await manager.send_personal_message({
                        "type": "description",
                        "text": description,
                        "timestamp": current_time
                    }, websocket)
                else:
                    await manager.send_personal_message({
                        "type": "error",
                        "message": "Failed to analyze frame"
                    }, websocket)
            
            elif message.get("action") == "stop":
                await manager.send_personal_message({
                    "type": "status",
                    "message": "Stopping real-time description"
                }, websocket)
                break
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print("[WebSocket] Client disconnected normally")
    except Exception as e:
        print(f"[WebSocket Error] {e}")
        manager.disconnect(websocket)


# HTTP endpoints for backwards compatibility
async def start_realtime_description():
    """HTTP endpoint to check service status"""
    return JSONResponse(content={
        "status": "ready",
        "message": "WebSocket service is ready. Connect via /ws/realtime-description",
        "connected_clients": len(manager.active_connections)
    })


async def stop_realtime_description():
    """HTTP endpoint to stop all connections"""
    # Close all connections
    for connection in manager.active_connections.copy():
        try:
            await connection.close()
        except:
            pass
    
    manager.active_connections.clear()
    
    return JSONResponse(content={
        "status": "stopped",
        "message": "All connections closed"
    })


async def get_description_status():
    """HTTP endpoint to check status"""
    return JSONResponse(content={
        "is_running": len(manager.active_connections) > 0,
        "connected_clients": len(manager.active_connections),
        "last_description_time": manager.last_description_time
    })


# No background task needed - frontend sends frames on demand
async def stream_descriptions_to_clients():
    """
    Deprecated: Not needed anymore since frontend sends frames.
    Kept for compatibility.
    """
    print("[INFO] stream_descriptions_to_clients() is deprecated - frontend now sends frames")
    pass