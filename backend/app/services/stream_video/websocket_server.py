"""
WebSocket server for real-time video description.
Frontend connects via WebSocket to receive continuous scene descriptions.
"""

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
import asyncio
import json
import sys
import os
import threading

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

# Import the real-time description module
from . import realtime_main

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.is_camera_running = False

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WebSocket] Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"[WebSocket] Client disconnected. Total connections: {len(self.active_connections)}")

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
            self.active_connections.remove(conn)

manager = ConnectionManager()


async def stream_descriptions_to_clients():
    """Background task that continuously sends descriptions to all connected clients"""
    while True:
        try:
            # Get latest description from the queue
            description_data = realtime_main.get_latest_description()
            
            if description_data and manager.active_connections:
                await manager.broadcast({
                    "type": "description",
                    "timestamp": description_data["timestamp"],
                    "text": description_data["description"]
                })
            
            await asyncio.sleep(0.1)  # Check queue every 100ms
            
        except Exception as e:
            print(f"[WebSocket Error] {e}")
            await asyncio.sleep(1)


# FastAPI route handlers (to be added to main.py)
async def websocket_realtime_description(websocket: WebSocket):
    """
    WebSocket endpoint for real-time scene description.
    
    Usage from frontend:
    ```javascript
    const ws = new WebSocket('ws://localhost:8000/ws/realtime-description');
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'description') {
            console.log('Scene:', data.text);
            speakText(data.text);  // Use Web Speech API
        }
    };
    ```
    """
    await manager.connect(websocket)
    
    # Start camera and description engine if not already running
    if not manager.is_camera_running:
        # Start the real-time description in background thread
        def start_camera():
            manager.is_camera_running = True
            realtime_main.main()
        
        camera_thread = threading.Thread(target=start_camera, daemon=True)
        camera_thread.start()
        await asyncio.sleep(1)  # Wait for camera to initialize
    
    try:
        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message.get("action") == "stop":
                realtime_main.is_running = False
                await websocket.send_json({"type": "status", "message": "Camera stopped"})
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        
        # Stop camera if no more clients
        if len(manager.active_connections) == 0:
            realtime_main.is_running = False
            manager.is_camera_running = False
            print("[WebSocket] No more clients, stopping camera")


async def start_realtime_description():
    """HTTP endpoint to start real-time description"""
    if manager.is_camera_running:
        return JSONResponse(content={
            "status": "already_running",
            "message": "Real-time description is already active"
        })
    
    def start_camera():
        manager.is_camera_running = True
        realtime_main.main()
    
    camera_thread = threading.Thread(target=start_camera, daemon=True)
    camera_thread.start()
    await asyncio.sleep(1)  # Wait for camera to initialize
    
    return JSONResponse(content={
        "status": "started",
        "message": "Real-time description started"
    })


async def stop_realtime_description():
    """HTTP endpoint to stop real-time description"""
    if not manager.is_camera_running:
        return JSONResponse(content={
            "status": "not_running",
            "message": "Real-time description is not active"
        })
    
    realtime_main.is_running = False
    manager.is_camera_running = False
    
    return JSONResponse(content={
        "status": "stopped",
        "message": "Real-time description stopped"
    })


async def get_description_status():
    """HTTP endpoint to check status"""
    return JSONResponse(content={
        "is_running": manager.is_camera_running,
        "connected_clients": len(manager.active_connections),
        "queue_size": realtime_main.description_queue.qsize()
    })
