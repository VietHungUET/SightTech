from .schemas import Detection, RiskLevel


DANGEROUS_CLASSES = {"car", "motorcycle", "bicycle", "bus", "truck"}
OBSTACLE_CLASSES = {
    "person",
    "chair",
    "couch",
    "dining table",
    "bed",
    "backpack",
    "suitcase",
    "dog",
    "bottle",
}
IMPORTANT_CLASSES = DANGEROUS_CLASSES | OBSTACLE_CLASSES


def analyze_risks(detections: list[Detection]) -> tuple[list[Detection], RiskLevel]:
    analyzed = []
    for detection in detections:
        score = 0
        if detection.class_name in DANGEROUS_CLASSES:
            score += 4
        elif detection.class_name in OBSTACLE_CLASSES:
            score += 2
        if detection.position == "center":
            score += 2
        if detection.area_ratio >= 0.18:
            score += 2
        elif detection.area_ratio >= 0.08:
            score += 1
        if detection.confidence >= 0.70:
            score += 1

        detection.risk_score = score
        detection.risk_level = risk_level_for_score(score)
        analyzed.append(detection)

    overall = max(
        (detection.risk_level for detection in analyzed),
        key=risk_rank,
        default=RiskLevel.NO_RISK,
    )
    return analyzed, overall


def choose_primary_risk(detections: list[Detection]) -> Detection | None:
    important = [item for item in detections if item.class_name in IMPORTANT_CLASSES]
    if not important:
        return None
    return max(
        important,
        key=lambda item: (
            item.risk_score,
            item.position == "center",
            item.area_ratio,
            item.confidence,
        ),
    )


def has_overlapping_important_objects(
    detections: list[Detection],
    iou_threshold: float = 0.40,
) -> bool:
    important = [item for item in detections if item.class_name in IMPORTANT_CLASSES]
    for index, first in enumerate(important):
        for second in important[index + 1 :]:
            if calculate_iou(first.bounding_box, second.bounding_box) >= iou_threshold:
                return True
    return False


def calculate_iou(first: list[float], second: list[float]) -> float:
    x_left = max(first[0], second[0])
    y_top = max(first[1], second[1])
    x_right = min(first[2], second[2])
    y_bottom = min(first[3], second[3])
    intersection = max(0.0, x_right - x_left) * max(0.0, y_bottom - y_top)
    first_area = max(0.0, first[2] - first[0]) * max(0.0, first[3] - first[1])
    second_area = max(0.0, second[2] - second[0]) * max(0.0, second[3] - second[1])
    union = first_area + second_area - intersection
    return intersection / union if union else 0.0


def risk_level_for_score(score: int) -> RiskLevel:
    if score >= 7:
        return RiskLevel.HIGH
    if score >= 5:
        return RiskLevel.MODERATE
    if score >= 3:
        return RiskLevel.LOW
    return RiskLevel.NO_RISK


def risk_rank(level: RiskLevel) -> int:
    return {
        RiskLevel.NO_RISK: 0,
        RiskLevel.LOW: 1,
        RiskLevel.MODERATE: 2,
        RiskLevel.HIGH: 3,
    }[level]
