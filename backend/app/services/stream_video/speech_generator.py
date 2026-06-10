from .risk_analyzer import choose_primary_risk
from .schemas import Detection, RiskLevel


OBJECT_NAMES_VI = {
    "person": "người",
    "chair": "ghế",
    "couch": "ghế sofa",
    "dining table": "bàn",
    "bed": "giường",
    "backpack": "ba lô",
    "suitcase": "vali",
    "dog": "chó",
    "car": "ô tô",
    "motorcycle": "xe máy",
    "bicycle": "xe đạp",
    "bus": "xe buýt",
    "truck": "xe tải",
    "bottle": "chai hoặc lọ",
}
POSITIONS_VI = {
    "left": "bên trái",
    "center": "phía trước",
    "right": "bên phải",
}


def generate_speech(detections: list[Detection], risk_level: RiskLevel) -> str:
    primary = choose_primary_risk(detections)
    if primary is None:
        return ""

    object_name = OBJECT_NAMES_VI.get(primary.class_name, "vật thể")
    position = POSITIONS_VI[primary.position]
    distance = relative_distance(primary.area_ratio)

    if risk_level == RiskLevel.HIGH:
        return (
            f"Cảnh báo: {position} có {object_name} {distance}. "
            f"{recommended_action(primary.position, detections, urgent=True)}"
        )
    if risk_level == RiskLevel.MODERATE:
        return (
            f"{position.capitalize()} có {object_name} {distance}. "
            f"{recommended_action(primary.position, detections)}"
        )
    if risk_level == RiskLevel.LOW:
        return f"Có {object_name} ở {position}."
    return ""


def relative_distance(area_ratio: float) -> str:
    if area_ratio >= 0.18:
        return "khá gần"
    if area_ratio >= 0.08:
        return "ở gần"
    return "ở xa hơn"


def recommended_action(
    position: str,
    detections: list[Detection],
    urgent: bool = False,
) -> str:
    blocked = {
        detection.position
        for detection in detections
        if detection.risk_level in {RiskLevel.MODERATE, RiskLevel.HIGH}
    }
    if position == "left" and "right" not in blocked:
        return "Bạn nên đi lệch sang phải."
    if position == "right" and "left" not in blocked:
        return "Bạn nên đi lệch sang trái."
    if urgent:
        return "Bạn nên dừng lại hoặc đi thật chậm."
    return "Bạn nên chú ý và đi chậm."
