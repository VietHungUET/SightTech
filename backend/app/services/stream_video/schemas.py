from enum import Enum

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    NO_RISK = "no_risk"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


class FrameQuality(BaseModel):
    valid: bool
    reason: str | None = None
    warning: str | None = None
    blur_score: float
    brightness: float
    speech_output: str = ""


class Detection(BaseModel):
    class_name: str
    confidence: float
    bounding_box: list[float]
    position: str
    area_ratio: float
    risk_score: int = 0
    risk_level: RiskLevel = RiskLevel.NO_RISK


class GeminiDecision(BaseModel):
    use_gemini: bool
    reasons: list[str] = Field(default_factory=list)


class PipelineResponse(BaseModel):
    type: str = "description"
    status: str
    text: str = ""
    speech_output: str = ""
    risk_level: RiskLevel = RiskLevel.NO_RISK
    change_ratio: float | None = None
    gemini_used: bool = False
    gemini_reasons: list[str] = Field(default_factory=list)
    detections: list[Detection] = Field(default_factory=list)
    frame_quality: FrameQuality | None = None
    local_detector_error: str | None = None
