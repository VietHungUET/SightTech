from dataclasses import dataclass, field
from typing import Any, Callable

from .schemas import ConversationState, Domain, ExecutionResult, Operation, RouteDecision


@dataclass
class ActionContext:
    transcript: str
    state: ConversationState
    inputs: dict[str, Any] = field(default_factory=dict)


ActionHandler = Callable[[RouteDecision, ActionContext], ExecutionResult]


class ActionRegistry:
    def __init__(self):
        self._handlers: dict[tuple[Domain, Operation], ActionHandler] = {}

    def register(self, domain: Domain, operation: Operation, handler: ActionHandler) -> None:
        self._handlers[(domain, operation)] = handler

    def execute(self, route: RouteDecision, context: ActionContext) -> ExecutionResult:
        handler = self._handlers.get((route.domain, route.operation))
        if handler:
            return handler(route, context)
        return ExecutionResult(
            status="delegated",
            feedback_text="Đã nhận lệnh. Chức năng tương ứng sẽ tiếp tục xử lý.",
            delegated_to=route.domain.value,
            result={"route": route.model_dump(mode="json")},
        )


def build_default_action_registry(
    recognize_document: Callable[[bytes], dict],
    process_document: Callable[[str, str], str],
    answer_question: Callable[[str], str],
    read_news: Callable[[str], list],
) -> ActionRegistry:
    registry = ActionRegistry()

    def recognize_text(route: RouteDecision, context: ActionContext) -> ExecutionResult:
        image_bytes = context.inputs.get("image_bytes")
        if not image_bytes:
            return ExecutionResult(
                status="awaiting_input",
                feedback_text="Hãy gửi ảnh văn bản để tôi đọc.",
                required_inputs=["image"],
            )
        result = recognize_document(image_bytes)
        context.state.contexts[Domain.TEXT_RECOGNITION.value] = {"text": result["text"]}
        return ExecutionResult(
            status="success",
            feedback_text=result["text"],
            result=result,
        )

    def process_previous_text(route: RouteDecision, context: ActionContext) -> ExecutionResult:
        previous = context.state.contexts.get(Domain.TEXT_RECOGNITION.value, {})
        document_text = previous.get("text") if isinstance(previous, dict) else None
        if not document_text:
            return ExecutionResult(
                status="missing_context",
                feedback_text="Tôi chưa có văn bản trước đó để xử lý.",
                required_inputs=["previous_text"],
            )
        instruction = route.instruction or context.transcript
        answer = process_document(instruction, document_text)
        return ExecutionResult(status="success", feedback_text=answer, result={"text": answer})

    def repeat_last(_route: RouteDecision, context: ActionContext) -> ExecutionResult:
        if not context.state.last_response:
            return ExecutionResult(
                status="missing_context",
                feedback_text="Tôi chưa có phản hồi trước đó để đọc lại.",
            )
        return ExecutionResult(
            status="success",
            feedback_text=context.state.last_response,
            result={"text": context.state.last_response},
        )

    def chatbot_query(route: RouteDecision, context: ActionContext) -> ExecutionResult:
        answer = answer_question(route.instruction or context.transcript)
        return ExecutionResult(status="success", feedback_text=answer, result={"text": answer})

    def news_query(route: RouteDecision, context: ActionContext) -> ExecutionResult:
        articles = read_news(route.instruction or context.transcript)
        serialized = [
            article.to_dict() if hasattr(article, "to_dict") else article for article in articles
        ]
        if not serialized:
            return ExecutionResult(status="not_found", feedback_text="Không tìm thấy bài báo phù hợp.")
        feedback = (
            serialized[0].get("summary")
            or serialized[0].get("title")
            or "Đã tìm thấy bài báo phù hợp."
        )
        context.state.contexts[Domain.NEWS_READING.value] = {"articles": serialized}
        return ExecutionResult(status="success", feedback_text=feedback, result={"articles": serialized})

    def requires_image(_route: RouteDecision, _context: ActionContext) -> ExecutionResult:
        return ExecutionResult(
            status="awaiting_input",
            feedback_text="Hãy gửi ảnh để thực hiện nhận diện.",
            required_inputs=["image"],
        )

    def requires_audio(_route: RouteDecision, _context: ActionContext) -> ExecutionResult:
        return ExecutionResult(
            status="awaiting_input",
            feedback_text="Hãy gửi đoạn âm thanh cần nhận diện.",
            required_inputs=["audio_sample"],
        )

    registry.register(Domain.TEXT_RECOGNITION, Operation.RECOGNIZE, recognize_text)
    registry.register(
        Domain.TEXT_RECOGNITION,
        Operation.PROCESS_PREVIOUS_RESULT,
        process_previous_text,
    )
    registry.register(Domain.CHATBOT, Operation.QUERY, chatbot_query)
    registry.register(Domain.NEWS_READING, Operation.QUERY, news_query)
    registry.register(Domain.OBJECT_DETECTION, Operation.RECOGNIZE, requires_image)
    registry.register(Domain.MUSIC_RECOGNITION, Operation.RECOGNIZE, requires_audio)

    for domain in Domain:
        registry.register(domain, Operation.REPEAT, repeat_last)

    return registry
