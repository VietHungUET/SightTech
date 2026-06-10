import json

from .risk_analyzer import IMPORTANT_CLASSES, has_overlapping_important_objects
from .schemas import Detection, GeminiDecision, RiskLevel


OPEN_QUESTION_PATTERNS = (
    "xung quanh tôi có gì",
    "tôi có thể đi tiếp không",
    "đây là nơi nào",
    "có gì nguy hiểm không",
    "đọc biển báo",
    "đọc ký hiệu",
    "what is around me",
    "can i continue",
    "where am i",
    "read the sign",
)


def decide_gemini_usage(
    change_ratio: float,
    detections: list[Detection],
    risk_level: RiskLevel,
    question: str | None,
    detector_error: str | None = None,
    strong_change_threshold: float = 0.15,
    many_objects_threshold: int = 3,
    official_detection_confidence: float = 0.40,
    overlap_iou_threshold: float = 0.40,
) -> GeminiDecision:
    normalized_question = (question or "").strip().lower()
    reasons = []
    if normalized_question and (
        any(pattern in normalized_question for pattern in OPEN_QUESTION_PATTERNS)
        or normalized_question
    ):
        reasons.append("open_question")
    if detector_error:
        reasons.append("local_detector_unavailable")

    important = [item for item in detections if item.class_name in IMPORTANT_CLASSES]
    official_detections = [
        item for item in detections if item.confidence >= official_detection_confidence
    ]
    if len(official_detections) >= many_objects_threshold:
        reasons.append("three_or_more_objects")

    clear_risk = (
        risk_level in {RiskLevel.HIGH, RiskLevel.MODERATE}
        and len(important) <= 3
        and important
    )
    if clear_risk and "three_or_more_objects" not in reasons:
        return GeminiDecision(use_gemini=False)

    if change_ratio >= strong_change_threshold and len(important) >= 2:
        reasons.append("strong_scene_change")
    if any(
        0.30 <= item.confidence <= 0.50 and item.position == "center"
        for item in important
    ):
        reasons.append("local_detector_uncertain")
    if has_overlapping_important_objects(detections, overlap_iou_threshold):
        reasons.append("overlapping_objects")

    return GeminiDecision(use_gemini=bool(reasons), reasons=list(dict.fromkeys(reasons)))


class GeminiSafetyAnalyzer:
    def __init__(self, api_key: str | None, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model = model
        self._client = None

    def analyze(
        self,
        base64_image: str,
        detections: list[Detection],
        risk_level: RiskLevel,
        question: str | None,
    ) -> str:
        client = self._get_client()
        image_url = f"data:image/jpeg;base64,{base64_image}"
        detection_data = [item.model_dump(mode="json") for item in detections]
        prompt = (
            "Hãy trả lời bằng tiếng Việt cho người khiếm thị, ưu tiên an toàn và hành động. "
            "Không mô tả chi tiết không cần thiết, không bịa nếu không chắc chắn. "
            "Nếu có nguy hiểm, bắt đầu bằng 'Cảnh báo:'. Tối đa khoảng 25 từ.\n"
            f"Câu hỏi người dùng: {question or 'Không có'}\n"
            f"Mức rủi ro rule-based: {risk_level.value}\n"
            f"YOLO detections: {json.dumps(detection_data, ensure_ascii=False)}"
        )
        response = client.invoke(
            [
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": [{"type": "image_url", "image_url": {"url": image_url}}],
                },
            ]
        )
        return limit_words(str(response.content).strip(), 25)

    def _get_client(self):
        if not self.api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured.")
        if self._client is None:
            from langchain_google_genai import ChatGoogleGenerativeAI

            self._client = ChatGoogleGenerativeAI(
                model=self.model,
                temperature=0.2,
                google_api_key=self.api_key,
            )
        return self._client


def limit_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(".,;:") + "."
