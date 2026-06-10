import json
from datetime import datetime, timezone
from typing import Any

from .schemas import ConversationState


class ConversationStoreError(RuntimeError):
    """Raised when conversation context cannot be read from or written to Redis."""


class RedisConversationStore:
    def __init__(
        self,
        redis_url: str,
        ttl_seconds: int = 1800,
        max_turns: int = 10,
        client=None,
    ):
        self.redis_url = redis_url
        self.ttl_seconds = ttl_seconds
        self.max_turns = max_turns
        self._client = client

    @property
    def client(self):
        if self._client is None:
            try:
                from redis import Redis
            except ImportError as exc:
                raise ConversationStoreError(
                    "Redis support is not installed. Install the redis package."
                ) from exc
            self._client = Redis.from_url(self.redis_url, decode_responses=True)
        return self._client

    def get_state(self, session_id: str) -> ConversationState:
        try:
            payload = self.client.get(self._state_key(session_id))
        except Exception as exc:
            raise ConversationStoreError(f"Could not read conversation state: {exc}") from exc
        if not payload:
            return ConversationState()
        try:
            return ConversationState.model_validate_json(payload)
        except Exception as exc:
            raise ConversationStoreError("Stored conversation state is invalid.") from exc

    def save_state(self, session_id: str, state: ConversationState) -> None:
        state.updated_at = datetime.now(timezone.utc).isoformat()
        try:
            self.client.setex(
                self._state_key(session_id),
                self.ttl_seconds,
                state.model_dump_json(),
            )
        except Exception as exc:
            raise ConversationStoreError(f"Could not save conversation state: {exc}") from exc

    def add_turn(self, session_id: str, turn: dict[str, Any]) -> None:
        key = self._turns_key(session_id)
        try:
            pipeline = self.client.pipeline()
            pipeline.lpush(key, json.dumps(turn, ensure_ascii=False, default=str))
            pipeline.ltrim(key, 0, self.max_turns - 1)
            pipeline.expire(key, self.ttl_seconds)
            pipeline.execute()
        except Exception as exc:
            raise ConversationStoreError(f"Could not save conversation turn: {exc}") from exc

    @staticmethod
    def _state_key(session_id: str) -> str:
        return f"sighttech:voice:session:{session_id}"

    @staticmethod
    def _turns_key(session_id: str) -> str:
        return f"sighttech:voice:session:{session_id}:turns"
