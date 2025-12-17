"""
Outdoor Navigation Service
Provides sidewalk position detection and turn classification for navigation assistance.
"""

from app.services.outdoor_navigation.sidewalk_classification import (
    SidewalkClassification,
    CLASSES as SIDEWALK_CLASSES
)
from app.services.outdoor_navigation.turn_classification import (
    TurnClassification,
    LABELS as TURN_LABELS
)
from app.services.outdoor_navigation.pipeline import OutdoorNavigationPipeline
from app.services.outdoor_navigation.websocket_server import (
    websocket_outdoor_navigation,
    start_outdoor_navigation,
    stop_outdoor_navigation,
    get_navigation_status,
    stream_navigation_to_clients
)

__all__ = [
    # Core classes
    "SidewalkClassification",
    "TurnClassification",
    "OutdoorNavigationPipeline",
    
    # Constants
    "SIDEWALK_CLASSES",
    "TURN_LABELS",
    
    # WebSocket handlers
    "websocket_outdoor_navigation",
    "start_outdoor_navigation",
    "stop_outdoor_navigation",
    "get_navigation_status",
    "stream_navigation_to_clients",
]
