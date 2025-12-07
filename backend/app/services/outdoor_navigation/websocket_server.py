"""
WebSocket server for outdoor navigation.
Frontend connects via WebSocket to receive continuous navigation guidance.
"""

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import asyncio
import json
import cv2
import base64
import numpy as np
from typing import Optional

from app.websocket_manager import manager
from .pipeline import OutdoorNavigationPipeline


def encode_frame_to_base64(frame: np.ndarray) -> str:
    """
    Encode frame to base64 string for transmission.
    
    Args:
        frame: OpenCV frame (numpy array)
        
    Returns:
        Base64 encoded JPEG image
    """
    # Encode frame as JPEG
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
    # Convert to base64
    jpg_as_text = base64.b64encode(buffer).decode('utf-8')
    return jpg_as_text


async def stream_navigation_to_clients():
    """
    Background task placeholder.
    In the new architecture, frames are processed immediately when received,
    so continuous streaming is not needed.
    """
    while True:
        await asyncio.sleep(1)  # Keep task alive but idle


# FastAPI route handlers (to be added to main.py)
async def websocket_outdoor_navigation(websocket: WebSocket):
    """
    WebSocket endpoint for outdoor navigation.
    Receives frames from frontend, processes them, and sends back navigation guidance.
    
    Frontend sends:
    {
        "type": "frame",
        "data": "base64_encoded_jpeg_image"
    }
    
    Backend responds:
    {
        "type": "navigation_update",
        "sidewalk": "Middle of Sidewalk",
        "turn": "No Turn",
        "guidance": "Stay centered"
    }
    """
    await manager.connect(websocket)
    
    print("[Navigation WS] Client connected")
    
    # Create pipeline for this session (models load here)
    navigation_pipeline = OutdoorNavigationPipeline()
    
    # Start pipeline only after models are loaded
    navigation_pipeline.start()
    manager.pipelines[websocket] = navigation_pipeline
    
    # Send initial status
    await websocket.send_json({
        "type": "status",
        "message": "Navigation ready"
    })
    
    try:
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "frame":
                # Check if pipeline is still running before processing
                if not navigation_pipeline.is_running:
                    break
                    
                # Decode base64 frame
                try:
                    frame_data = message.get("data", "")
                    # Remove data URL prefix if present
                    if "base64," in frame_data:
                        frame_data = frame_data.split("base64,")[1]
                    
                    # Decode base64 to bytes
                    img_bytes = base64.b64decode(frame_data)
                    # Convert to numpy array
                    nparr = np.frombuffer(img_bytes, np.uint8)
                    # Decode image
                    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                    
                    if frame is not None and navigation_pipeline.is_running:
                        # Process frame
                        result = navigation_pipeline.process_frame(frame)
                        
                        # Only send response if still running and connected
                        if result and navigation_pipeline.is_running:
                            response = {
                                "type": "navigation_update",
                                "sidewalk": result["sidewalk"],
                                "turn": result["turn"],
                                "guidance": result["guidance"],
                                "timestamp": result.get("timestamp")
                            }
                            
                            await websocket.send_json(response)
                        
                except Exception as e:
                    if navigation_pipeline.is_running:
                        print(f"[Navigation WS] Error: {e}")
            
            elif message_type == "stop":
                break
    
    except WebSocketDisconnect:
        pass
    finally:
        # Cleanup
        manager.disconnect(websocket)
        if navigation_pipeline:
            navigation_pipeline.stop()
            if websocket in manager.pipelines:
                del manager.pipelines[websocket]
        print("[Navigation WS] Client disconnected, pipeline stopped")


async def start_outdoor_navigation(use_camera: bool = True, video_path: Optional[str] = None):
    """HTTP endpoint to start outdoor navigation"""
    return JSONResponse(content={
        "status": "info",
        "message": "Use WebSocket connection to start navigation. Connect to ws://localhost:8000/ws/outdoor-navigation"
    })


async def stop_outdoor_navigation():
    """HTTP endpoint to stop outdoor navigation"""
    return JSONResponse(content={
        "status": "info",
        "message": "Use WebSocket connection to stop navigation"
    })


async def get_navigation_status():
    """HTTP endpoint to check status"""
    return JSONResponse(content={
        "connected_clients": len(manager.active_connections),
        "message": "Connect via WebSocket for real-time navigation"
    })
