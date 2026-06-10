import json
import unittest

from app.services.voice_command import (
    HybridIntentClassifier,
    RedisConversationStore,
    VoiceCommandRouter,
    build_default_action_registry,
    normalize_command,
)


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.operations = []

    def lpush(self, key, value):
        self.operations.append(("lpush", key, value))
        return self

    def ltrim(self, key, start, end):
        self.operations.append(("ltrim", key, start, end))
        return self

    def expire(self, key, ttl):
        self.operations.append(("expire", key, ttl))
        return self

    def execute(self):
        for operation in self.operations:
            name, *args = operation
            getattr(self.redis, name)(*args)


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.lists = {}
        self.ttls = {}

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = ttl

    def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, value)

    def ltrim(self, key, start, end):
        self.lists[key] = self.lists.get(key, [])[start : end + 1]

    def expire(self, key, ttl):
        self.ttls[key] = ttl

    def pipeline(self):
        return FakePipeline(self)


def build_router(llm_classifier=None):
    fake_redis = FakeRedis()
    store = RedisConversationStore(
        "redis://unused",
        ttl_seconds=120,
        max_turns=2,
        client=fake_redis,
    )

    def recognize_document(_image_bytes):
        return {"text": "SightTech hỗ trợ người khiếm thị.", "confidence": 0.9}

    def process_document(instruction, text):
        return f"{instruction} | {text}"

    actions = build_default_action_registry(
        recognize_document=recognize_document,
        process_document=process_document,
        answer_question=lambda question: f"answer: {question}",
        read_news=lambda _query: [],
    )
    router = VoiceCommandRouter(
        store=store,
        classifier=HybridIntentClassifier(llm_classifier=llm_classifier),
        actions=actions,
    )
    return router, fake_redis


class VoiceCommandTests(unittest.TestCase):
    def test_normalizes_vietnamese_command(self):
        self.assertEqual(normalize_command("Đọc văn bản!"), "doc van ban")

    def test_text_recognition_requires_image(self):
        router, fake_redis = build_router()

        response = router.handle("Đọc văn bản", "session-a")

        self.assertEqual(response.route.domain.value, "text_recognition")
        self.assertEqual(response.execution.status, "awaiting_input")
        self.assertEqual(response.execution.required_inputs, ["image"])
        self.assertIn("sighttech:voice:session:session-a", fake_redis.values)

    def test_open_ended_follow_up_uses_redis_document_context(self):
        llm_payload = {
            "domain": "text_recognition",
            "operation": "process_previous_result",
            "instruction": "Chỉ ra ba ý quan trọng nhất",
            "context_reference": "text_recognition",
            "parameters": {},
            "confidence": 0.96,
        }
        router, _fake_redis = build_router(lambda _prompt: json.dumps(llm_payload))
        router.handle("Đọc văn bản", "session-b", {"image_bytes": b"image"})

        response = router.handle("Chỉ ra ba ý quan trọng nhất", "session-b")

        self.assertEqual(response.route.source, "llm")
        self.assertEqual(response.execution.status, "success")
        self.assertIn("SightTech hỗ trợ người khiếm thị", response.execution.feedback_text)

    def test_sessions_do_not_share_document_context(self):
        llm_payload = json.dumps(
            {
                "domain": "text_recognition",
                "operation": "process_previous_result",
                "instruction": "Viết lại ngắn hơn",
                "context_reference": "text_recognition",
                "parameters": {},
                "confidence": 0.9,
            }
        )
        router, _fake_redis = build_router(lambda _prompt: llm_payload)
        router.handle("Đọc văn bản", "session-with-text", {"image_bytes": b"image"})

        response = router.handle("Viết lại ngắn hơn", "different-session")

        self.assertEqual(response.execution.status, "missing_context")

    def test_turn_history_is_capped(self):
        router, fake_redis = build_router()
        router.handle("Đọc báo công nghệ", "session-c")
        router.handle("Đọc báo thể thao", "session-c")
        router.handle("Đọc báo khoa học", "session-c")

        turns = fake_redis.lists["sighttech:voice:session:session-c:turns"]
        self.assertEqual(len(turns), 2)

    def test_full_stop_command_keeps_explicit_domain(self):
        router, _fake_redis = build_router()

        response = router.handle(
            "Dừng nhận diện vật thể theo thời gian thực",
            "session-d",
        )

        self.assertEqual(response.route.domain.value, "realtime_object_detection")
        self.assertEqual(response.route.operation.value, "stop")
        self.assertEqual(response.execution.status, "delegated")


if __name__ == "__main__":
    unittest.main()
