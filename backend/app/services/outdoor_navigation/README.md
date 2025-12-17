# Outdoor Navigation Service

## Architecture Overview

The outdoor navigation service uses **WebSocket communication** where:
- **Frontend** captures webcam frames and sends them to backend
- **Backend** processes frames and returns annotated results with navigation guidance
- **No direct camera access** on backend - all frames come from frontend

## Communication Flow

```
┌─────────────┐                                    ┌─────────────┐
│  Frontend   │                                    │   Backend   │
│  (React)    │                                    │  (FastAPI)  │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  1. Connect WebSocket                           │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │  2. Status: "Navigation ready"                  │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  3. Send Frame (base64 JPEG)                    │
       │  { type: "frame", data: "..." }                 │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │                              Process Frame:      │
       │                              - Sidewalk detect   │
       │                              - Turn detect       │
       │                              - Generate guidance │
       │                              - Render overlay    │
       │                                                  │
       │  4. Navigation Update                           │
       │  { type: "navigation_update",                   │
       │    sidewalk: "Middle of Sidewalk",              │
       │    turn: "No Turn",                             │
       │    guidance: "Stay centered",                   │
       │    frame: "base64_annotated_frame" }            │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  5. Repeat steps 3-4 (10 FPS)                   │
       │                                                  │
```

## Components

### 1. Pipeline (`pipeline.py`)
- **`OutdoorNavigationPipeline`**: Frame-based processing pipeline
  - `__init__()`: Initialize sidewalk and turn classifiers
  - `start()`: Set running flag (no camera initialization)
  - `stop()`: Clean shutdown
  - `process_frame(frame)`: Process single frame and return results
  - `render_result(frame, ...)`: Draw overlay on frame

### 2. WebSocket Server (`websocket_server.py`)
- **`websocket_outdoor_navigation(websocket)`**: Main WebSocket handler
  - Creates pipeline instance per connection
  - Receives base64-encoded frames from frontend
  - Decodes frames and calls `pipeline.process_frame()`
  - Returns annotated frames with navigation data
- **`stream_navigation_to_clients()`**: Placeholder (not used in new architecture)

### 3. Frontend (`OutdoorNavigation.jsx`)
- **WebSocket Connection**:
  - Connects on component mount
  - Starts sending frames immediately after connection
- **Frame Sending**:
  - Captures webcam frames using `react-webcam`
  - Sends as base64 JPEG via WebSocket at 10 FPS
  - `startSendingFrames()`: Sets up interval to send frames
- **Result Display**:
  - Receives annotated frames from backend
  - Displays on canvas overlay
  - Shows guidance text and navigation info

## Message Formats

### Frontend → Backend

```javascript
// Frame message
{
  "type": "frame",
  "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ..."
}

// Stop message
{
  "type": "stop"
}
```

### Backend → Frontend

```javascript
// Navigation update
{
  "type": "navigation_update",
  "sidewalk": "Middle of Sidewalk" | "Left of Sidewalk" | "Right of Sidewalk" | "Nothing Detected",
  "turn": "No Turn" | "Left Turn" | "Right Turn",
  "guidance": "Stay centered",
  "timestamp": 1701234567.89,
  "frame": "/9j/4AAQSkZJRgABAQAAAQ..."  // Base64 annotated frame
}

// Status message
{
  "type": "status",
  "message": "Navigation ready - send frames to begin"
}
```

## Key Changes from Previous Architecture

### Before (Camera on Backend)
- Backend directly accessed webcam via OpenCV
- Used threading for continuous frame capture
- Frame queue between capture and processing
- Backend pushed frames to frontend

### After (Camera on Frontend)
- Frontend captures webcam via `react-webcam`
- Backend receives frames via WebSocket
- No threading needed (frame-driven processing)
- Request-response pattern (send frame → get result)

## Benefits

1. **No Camera Conflicts**: Backend doesn't compete for camera access
2. **Simpler Architecture**: No threading, queues, or continuous loops
3. **Better Control**: Frontend controls frame rate and quality
4. **WebRTC Ready**: Easy to integrate WebRTC for peer-to-peer
5. **Cross-platform**: Works in browser without backend camera drivers

## Performance

- **Frame Rate**: 10 FPS (configurable in frontend)
- **Latency**: ~100-200ms per frame (network + processing)
- **Resolution**: 640x480 (frontend configurable)

## Usage

### Start Backend
```bash
cd backend
uvicorn app.main:app --reload
```

### Start Frontend
```bash
cd frontend
npm run dev
```

### Navigate to Page
```
http://localhost:5173/navigation
```

## Future Enhancements

- [ ] Add WebRTC support for lower latency
- [ ] Implement frame buffering for smoother display
- [ ] Add quality/FPS controls in frontend
- [ ] Support multiple concurrent users
- [ ] Add recording/playback features
