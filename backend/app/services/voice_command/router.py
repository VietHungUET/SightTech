import re
import unicodedata
from typing import Any

from .actions import ActionContext, ActionRegistry
from .classifier import HybridIntentClassifier
from .schemas import VoiceCommandResponse
from .store import RedisConversationStore


def normalize_command(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.replace("đ", "d")
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


class VoiceCommandRouter:
    def __init__(
        self,
        store: RedisConversationStore,
        classifier: HybridIntentClassifier,
        actions: ActionRegistry,
    ):
        self.store = store
        self.classifier = classifier
        self.actions = actions

    def handle(
        self,
        transcript: str,
        session_id: str,
        inputs: dict[str, Any] | None = None,
    ) -> VoiceCommandResponse:
        normalized = normalize_command(transcript)
        state = self.store.get_state(session_id)
        route = self.classifier.classify(transcript, normalized, state)
        execution = self.actions.execute(
            route,
            ActionContext(transcript=transcript, state=state, inputs=inputs or {}),
        )

        state.active_domain = route.domain
        state.last_operation = route.operation
        state.last_response = execution.feedback_text
        state.pending_action = route if execution.status == "awaiting_input" else None
        self.store.save_state(session_id, state)
        self.store.add_turn(
            session_id,
            {
                "transcript": transcript,
                "normalized_command": normalized,
                "route": route.model_dump(mode="json"),
                "execution_status": execution.status,
                "feedback_text": execution.feedback_text,
            },
        )
        return VoiceCommandResponse(
            session_id=session_id,
            transcript=transcript,
            normalized_command=normalized,
            route=route,
            execution=execution,
        )
