import json
import re
from typing import Callable

from .schemas import ConversationState, Domain, Operation, RouteDecision


DOMAIN_ALIASES = {
    Domain.REALTIME_OBJECT_DETECTION: (
        "nhan dien vat the theo thoi gian thuc",
        "mo ta theo thoi gian thuc",
        "mo ta lien tuc",
        "realtime object",
        "real time object",
        "continuous description",
    ),
    Domain.TEXT_RECOGNITION: (
        "doc van ban",
        "nhan dien van ban",
        "doc tai lieu",
        "read document",
        "read text",
        "text recognition",
    ),
    Domain.MUSIC_RECOGNITION: (
        "nhan dien nhac",
        "bai hat gi",
        "what song",
        "recognize music",
    ),
    Domain.NEWS_READING: (
        "doc bao",
        "doc tin",
        "tin tuc",
        "read news",
        "news",
    ),
    Domain.OBJECT_DETECTION: (
        "nhan dien vat the",
        "day la cai gi",
        "vat the nay",
        "recognize object",
        "what is this object",
    ),
    Domain.CHATBOT: (
        "hoi tro ly",
        "tro chuyen",
        "chatbot",
        "ask assistant",
    ),
}

STOP_COMMANDS = {"dung", "dung lai", "tam dung", "stop", "pause", "cancel"}
CONTINUE_COMMANDS = {"tiep tuc", "continue", "resume"}
REPEAT_COMMANDS = {"doc lai", "noi lai", "lap lai", "repeat", "say that again"}
START_WORDS = ("bat dau", "mo", "start", "enable")


class HybridIntentClassifier:
    def __init__(self, llm_classifier: Callable[[str], str] | None = None):
        self.llm_classifier = llm_classifier

    def classify(
        self,
        transcript: str,
        normalized_command: str,
        state: ConversationState,
    ) -> RouteDecision:
        deterministic = self._deterministic_route(normalized_command, state)
        if deterministic:
            return deterministic
        if self.llm_classifier:
            try:
                return self._llm_route(transcript, state)
            except Exception:
                pass
        return RouteDecision(
            domain=state.active_domain or Domain.CHATBOT,
            operation=Operation.QUERY,
            instruction=transcript,
            confidence=0.4,
            source="fallback",
        )

    def _deterministic_route(
        self,
        command: str,
        state: ConversationState,
    ) -> RouteDecision | None:
        if command in STOP_COMMANDS:
            return self._control_route(Operation.STOP, state)
        if command in CONTINUE_COMMANDS:
            return self._control_route(Operation.CONTINUE, state)
        if command in REPEAT_COMMANDS:
            return self._control_route(Operation.REPEAT, state)

        domain = self._find_domain(command)
        if not domain:
            return None

        operation = Operation.RECOGNIZE
        if any(command.startswith(f"{word} ") for word in STOP_COMMANDS):
            operation = Operation.STOP
        elif any(command.startswith(word) for word in START_WORDS):
            operation = Operation.START
        elif domain == Domain.REALTIME_OBJECT_DETECTION:
            operation = Operation.START
        elif domain in {Domain.NEWS_READING, Domain.CHATBOT}:
            operation = Operation.QUERY

        return RouteDecision(
            domain=domain,
            operation=operation,
            instruction=command,
            confidence=0.92,
            source="rule",
        )

    def _llm_route(self, transcript: str, state: ConversationState) -> RouteDecision:
        available_contexts = list(state.contexts.keys())
        prompt = (
            "Classify this Vietnamese or English voice command for SightTech.\n"
            f"Command: {transcript}\n"
            f"Active domain: {state.active_domain.value if state.active_domain else None}\n"
            f"Available previous-result contexts: {available_contexts}\n"
            "Return JSON only with: domain, operation, instruction, context_reference, "
            "parameters, confidence. Domains: object_detection, realtime_object_detection, "
            "text_recognition, music_recognition, chatbot, news_reading, system, unknown. "
            "Operations: start, stop, capture, recognize, query, repeat, "
            "process_previous_result, continue, unknown. Preserve the user's open-ended "
            "request in instruction. Use process_previous_result when the user asks to "
            "transform, explain, summarize, translate, extract, or otherwise work with a "
            "previous result."
        )
        raw = self.llm_classifier(prompt)
        payload = self._parse_json(raw)
        payload["source"] = "llm"
        return RouteDecision.model_validate(payload)

    @staticmethod
    def _find_domain(command: str) -> Domain | None:
        for domain, aliases in DOMAIN_ALIASES.items():
            if any(alias in command for alias in aliases):
                return domain
        return None

    @staticmethod
    def _control_route(operation: Operation, state: ConversationState) -> RouteDecision:
        return RouteDecision(
            domain=state.active_domain or Domain.SYSTEM,
            operation=operation,
            context_reference=state.active_domain.value if state.active_domain else None,
            confidence=0.98,
            source="rule",
        )

    @staticmethod
    def _parse_json(raw: str) -> dict:
        cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(cleaned)
