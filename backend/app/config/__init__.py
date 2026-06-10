import os

from dotenv import load_dotenv

load_dotenv()


class Config(object):

    def __init__(self):
        self.HOST = os.getenv('HOST')
        self.PORT = os.getenv('PORT')
        self.MONGODB_URI = os.getenv('MONGODB_URI')
        self.DB_NAME = os.getenv('DB_NAME')
        self.DB_COLLECTION = os.getenv('DB_COLLECTION')
        self.DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY')
        self.OPENAI_API_KEY = os.getenv('OPENAI_API_KEY','abcxyz')
        self.GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
        self.AUDD_API_KEY = os.getenv('AUDD_API_KEY')
        self.REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
        self.VOICE_SESSION_TTL_SECONDS = int(os.getenv('VOICE_SESSION_TTL_SECONDS', '1800'))
        self.VOICE_SESSION_MAX_TURNS = int(os.getenv('VOICE_SESSION_MAX_TURNS', '10'))
        self.REALTIME_MIN_BRIGHTNESS = float(os.getenv('REALTIME_MIN_BRIGHTNESS', '45'))
        self.REALTIME_MIN_BLUR_SCORE = float(os.getenv('REALTIME_MIN_BLUR_SCORE', '60'))
        self.REALTIME_CHANGE_THRESHOLD = float(os.getenv('REALTIME_CHANGE_THRESHOLD', '0.08'))
        self.REALTIME_STRONG_CHANGE_THRESHOLD = float(os.getenv('REALTIME_STRONG_CHANGE_THRESHOLD', '0.15'))
        self.REALTIME_YOLO_CONFIDENCE = float(os.getenv('REALTIME_YOLO_CONFIDENCE', '0.40'))
        self.REALTIME_MANY_OBJECTS_THRESHOLD = int(os.getenv('REALTIME_MANY_OBJECTS_THRESHOLD', '3'))
        self.REALTIME_OVERLAP_IOU_THRESHOLD = float(os.getenv('REALTIME_OVERLAP_IOU_THRESHOLD', '0.40'))
        self.REALTIME_GEMINI_COOLDOWN_SECONDS = float(os.getenv('REALTIME_GEMINI_COOLDOWN_SECONDS', '5'))
        self.YOLO_MODEL_PATH = os.getenv('YOLO_MODEL_PATH', 'yolo11n.pt')
        self.REALTIME_DEBUG_LOGS = os.getenv('REALTIME_DEBUG_LOGS', 'true').lower() in {'1', 'true', 'yes', 'on'}
        # self.VOICE_RSS = os.getenv('Voice_RSS')

config = Config()
