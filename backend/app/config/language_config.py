class LanguageConfig:
    """Multi-language configuration for voice commands"""
    
    # Supported languages
    SUPPORTED_LANGUAGES = ["en", "vi"]
    DEFAULT_LANGUAGE = "en"
    

    NAVIGATION_TRIGGERS = {
        "en": [
            "switch to", "go to", "open", "activate", "change to", "navigate to",
            "show me", "i want to use", "let's use", "start"
        ],
        "vi": [
            "chuyển sang", "đi tới", "mở", "kích hoạt", "đổi sang", "điều hướng tới",
            "cho tôi xem", "tôi muốn dùng", "hãy dùng", "bắt đầu"
        ]
    }
    
    
    FEATURE_NAMES = {
        "Text": {
            "en": ["text", "reading", "read aloud", "narrate", "document"],
            "vi": ["văn bản", "đọc", "đọc to", "kể", "tài liệu"]
        },
        "Currency": {
            "en": ["currency", "money", "exchange", "cash"],
            "vi": ["tiền tệ", "tiền", "trao đổi", "ngoại tệ", "tiền mặt"]
        },
        "Object": {
            "en": ["object", "thing", "item identification", "find"],
            "vi": ["vật thể", "đồ vật", "nhận diện vật", "tìm"]
        },
        "Product": {
            "en": ["product", "barcode", "logo", "brand"],
            "vi": ["sản phẩm", "mã vạch", "logo", "nhãn hiệu"]
        },
        "Distance": {
            "en": ["distance", "measurement", "how far", "range"],
            "vi": ["khoảng cách", "đo", "bao xa", "phạm vi"]
        },
        "Face": {
            "en": ["face", "person", "recognition", "who is this"],
            "vi": ["khuôn mặt", "người", "nhận diện", "ai đây"]
        },
        "Music": {
            "en": ["music", "song", "track", "audio", "listen"],
            "vi": ["nhạc", "bài hát", "âm thanh", "nghe"]
        },
        "News": {
            "en": ["news", "articles", "headlines", "summary"],
            "vi": ["tin tức", "bài báo", "tiêu đề", "tóm tắt"]
        },
        "Chatbot": {
            "en": ["chat", "talk", "ask", "question", "assistant"],
            "vi": ["trò chuyện", "nói chuyện", "hỏi", "câu hỏi", "trợ lý"]
        },
        "Help": {
            "en": ["help", "support", "guide", "assist"],
            "vi": ["giúp đỡ", "hỗ trợ", "hướng dẫn", "trợ giúp"]
        },
        "Capture": {
            "en": ["camera", "picture", "photo", "capture", "take"],
            "vi": ["máy ảnh", "chụp", "chụp ảnh", "hình", "ảnh"]
        },
        "Play": {
            "en": ["play", "begin", "start playback", "launch"],
            "vi": ["phát", "bắt đầu", "chơi", "khởi động"]
        },
        "Stop": {
            "en": ["stop", "pause", "halt", "end", "cancel"],
            "vi": ["dừng", "tạm dừng", "ngừng", "kết thúc", "hủy"]
        },
        "Detect": {
            "en": ["detect", "scan", "recognize surroundings"],
            "vi": ["phát hiện", "quét", "nhận diện xung quanh"]
        }
    }
    
    
    @classmethod
    def get_all_triggers(cls):
        """
        Get all navigation triggers from all supported languages
        
        Returns:
            list: Combined list of all triggers
        """
        triggers = []
        for lang in cls.SUPPORTED_LANGUAGES:
            triggers.extend(cls.NAVIGATION_TRIGGERS.get(lang, []))
        return triggers
    
    @classmethod
    def get_all_aliases(cls, feature):
        """
        Get all aliases for a specific feature from all languages
        
        Args:
            feature (str): Feature name (e.g., "Object", "Music")
            
        Returns:
            list: Combined list of all aliases for the feature
        """
        aliases = []
        if feature in cls.FEATURE_NAMES:
            for lang in cls.SUPPORTED_LANGUAGES:
                aliases.extend(cls.FEATURE_NAMES[feature].get(lang, []))
        return aliases
    
    @classmethod
    def get_feature_names_dict(cls):
        """
        Get merged dictionary of all features with all language aliases
        
        Returns:
            dict: Dictionary mapping feature names to all their aliases
        """
        result = {}
        for feature in cls.FEATURE_NAMES:
            result[feature] = cls.get_all_aliases(feature)
        return result
    
    @classmethod
    def add_language(cls, lang_code, triggers, feature_translations):
        """
        Dynamically add a new language (for future extensibility)
        
        Args:
            lang_code (str): Language code (e.g., "fr", "ja")
            triggers (list): Navigation triggers for the language
            feature_translations (dict): Feature name translations
        """
        if lang_code not in cls.SUPPORTED_LANGUAGES:
            cls.SUPPORTED_LANGUAGES.append(lang_code)
        
        cls.NAVIGATION_TRIGGERS[lang_code] = triggers
        
        for feature, translations in feature_translations.items():
            if feature in cls.FEATURE_NAMES:
                cls.FEATURE_NAMES[feature][lang_code] = translations