"""WebSocket transport for the safety-first real-time description pipeline."""

import asyncio
import json
import logging
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.config import config

from .gemini_analyzer import GeminiSafetyAnalyzer
from .object_detector import YoloObjectDetector
from .pipeline import RealtimeDescriptionPipeline, RealtimeSessionState

logger = logging.getLogger(__name__)


realtime_pipeline = RealtimeDescriptionPipeline(
    detector=YoloObjectDetector(
        model_path=config.YOLO_MODEL_PATH,
        inference_confidence=0.30,
        debug_logs=config.REALTIME_DEBUG_LOGS,
    ),
    gemini=GeminiSafetyAnalyzer(api_key=config.GOOGLE_API_KEY),
    min_brightness=config.REALTIME_MIN_BRIGHTNESS,
    min_blur_score=config.REALTIME_MIN_BLUR_SCORE,
    change_threshold=config.REALTIME_CHANGE_THRESHOLD,
    strong_change_threshold=config.REALTIME_STRONG_CHANGE_THRESHOLD,
    min_detection_confidence=config.REALTIME_YOLO_CONFIDENCE,
    many_objects_threshold=config.REALTIME_MANY_OBJECTS_THRESHOLD,
    overlap_iou_threshold=config.REALTIME_OVERLAP_IOU_THRESHOLD,
    gemini_cooldown_seconds=config.REALTIME_GEMINI_COOLDOWN_SECONDS,
    debug_logs=config.REALTIME_DEBUG_LOGS,
)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.states: dict[WebSocket, RealtimeSessionState] = {}
        self.last_description_time = 0.0

    async def connect(self, websocket: WebSocket) -> RealtimeSessionState:
        await websocket.accept()
        state = RealtimeSessionState()
        self.active_connections.append(websocket)
        self.states[websocket] = state
        logger.info("Realtime description client connected; total=%s", len(self.active_connections))
        return state

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.states.pop(websocket, None)
        logger.info("Realtime description client disconnected; total=%s", len(self.active_connections))

    async def send_personal_message(self, message: dict, websocket: WebSocket) -> None:
        await websocket.send_json(message)


manager = ConnectionManager()


async def websocket_realtime_description(websocket: WebSocket):
    """Receive base64 JPEG frames and return safety-first spoken guidance."""
    state = await manager.connect(websocket)
    try:
        await manager.send_personal_message(
            {
                "type": "status",
                "message": "Connected. Send frames to receive safety-first descriptions.",
            },
            websocket,
        )
        while True:
            message = json.loads(await websocket.receive_text())
            if message.get("action") == "stop":
                await manager.send_personal_message(
                    {"type": "status", "message": "Stopping real-time description"},
                    websocket,
                )
                break
            if message.get("type") != "frame":
                continue

            base64_image = message.get("data")
            if config.REALTIME_DEBUG_LOGS:
                logger.info(
                    "Realtime frame received next_frame=%s bytes=%s has_question=%s",
                    state.frame_index + 1,
                    len(base64_image) if base64_image else 0,
                    bool(message.get("question")),
                )
            if not base64_image:
                await manager.send_personal_message(
                    {"type": "error", "message": "No image data received"},
                    websocket,
                )
                continue
            if state.processing:
                await manager.send_personal_message(
                    {"type": "description", "status": "busy", "text": "", "speech_output": ""},
                    websocket,
                )
                continue

            state.processing = True
            try:
                response = await asyncio.to_thread(
                    realtime_pipeline.process,
                    base64_image,
                    state,
                    message.get("question"),
                )
                payload = response.model_dump(mode="json")
                payload["timestamp"] = datetime.now().timestamp()
                if not response.speech_output:
                    payload["type"] = "status"
                    payload["message"] = response.status
                manager.last_description_time = payload["timestamp"]
                await manager.send_personal_message(payload, websocket)
            except ValueError as exc:
                await manager.send_personal_message(
                    {"type": "error", "message": str(exc)},
                    websocket,
                )
            except Exception:
                logger.exception("Realtime description pipeline failed")
                await manager.send_personal_message(
                    {"type": "error", "message": "Failed to analyze frame"},
                    websocket,
                )
            finally:
                state.processing = False
    except WebSocketDisconnect:
        logger.info("Realtime description client disconnected normally")
    except json.JSONDecodeError:
        await manager.send_personal_message(
            {"type": "error", "message": "Invalid WebSocket message"},
            websocket,
        )
    except Exception:
        logger.exception("Realtime description WebSocket failed")
    finally:
        manager.disconnect(websocket)


async def start_realtime_description():
    return JSONResponse(
        content={
            "status": "ready",
            "message": "WebSocket service is ready. Connect via /ws/realtime-description",
            "connected_clients": len(manager.active_connections),
        }
    )


async def stop_realtime_description():
    for connection in manager.active_connections.copy():
        try:
            await connection.close()
        except Exception:
            logger.debug("Could not close realtime connection", exc_info=True)
        manager.disconnect(connection)
    return JSONResponse(content={"status": "stopped", "message": "All connections closed"})


async def get_description_status():
    return JSONResponse(
        content={
            "is_running": bool(manager.active_connections),
            "connected_clients": len(manager.active_connections),
            "last_description_time": manager.last_description_time,
            "change_threshold": config.REALTIME_CHANGE_THRESHOLD,
            "strong_change_threshold": config.REALTIME_STRONG_CHANGE_THRESHOLD,
            "yolo_model": config.YOLO_MODEL_PATH,
            "gemini_cooldown_seconds": config.REALTIME_GEMINI_COOLDOWN_SECONDS,
            "debug_logs": config.REALTIME_DEBUG_LOGS,
        }
    )


async def stream_descriptions_to_clients():
    """Kept for compatibility; frames are processed directly per WebSocket client."""
    logger.info("stream_descriptions_to_clients is deprecated; clients send frames directly")
