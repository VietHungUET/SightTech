from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Domain(str, Enum):
    OBJECT_DETECTION = "object_detection"
    REALTIME_OBJECT_DETECTION = "realtime_object_detection"
    TEXT_RECOGNITION = "text_recognition"
    MUSIC_RECOGNITION = "music_recognition"
    CHATBOT = "chatbot"
    NEWS_READING = "news_reading"
    SYSTEM = "system"
    UNKNOWN = "unknown"


class Operation(str, Enum):
    START = "start"
    STOP = "stop"
    CAPTURE = "capture"
    RECOGNIZE = "recognize"
    QUERY = "query"
    REPEAT = "repeat"
    PROCESS_PREVIOUS_RESULT = "process_previous_result"
    CONTINUE = "continue"
    UNKNOWN = "unknown"


class RouteDecision(BaseModel):
    domain: Domain
    operation: Operation
    instruction: str | None = None
    context_reference: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: str = "fallback"


class ExecutionResult(BaseModel):
    status: str
    feedback_text: str
    result: Any = None
    required_inputs: list[str] = Field(default_factory=list)
    delegated_to: str | None = None


class ConversationState(BaseModel):
    active_domain: Domain | None = None
    last_operation: Operation | None = None
    contexts: dict[str, Any] = Field(default_factory=dict)
    last_response: str | None = None
    pending_action: RouteDecision | None = None
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class VoiceCommandResponse(BaseModel):
    session_id: str
    transcript: str
    normalized_command: str
    route: RouteDecision
    execution: ExecutionResult
