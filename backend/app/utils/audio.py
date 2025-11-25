
from collections import OrderedDict
# from sentence_transformers import SentenceTransformer, util
from ..config.language_config import LanguageConfig
from difflib import SequenceMatcher

# embedder = SentenceTransformer('all-MiniLM-L6-v2')
_embedder = None

def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer
        _embedder = SentenceTransformer('all-MiniLM-L6-v2')
    return _embedder

# Initial unordered feature labels (prioritizing more distinct features first)
raw_feature_labels = OrderedDict({
    "News": [
        "article", "read", "news", "read article", "summary", "latest news", "news article", "current events", 
        "headlines", "news report", "summary of article", "find", "give", "search", "look for", "locate", "seek", "discover", "identify"
    ],
    "Chatbot": [
        "chat", "talk", "tell", "conversation", "ask", "question", "chatbot", "ask a question", 
        "speak to", "let's talk", "chat with", "conversation with assistant", "what"
    ],
    "Text": [
        "text", "document", "page", "story", "paragraph", "content", 
        "read aloud", "narrate", "text to speech"
    ],
    "Currency": [
        "money", "bill", "coin", "cash", "cost", "amount", "price", "total", "currency", 
        "value", "convert currency", "exchange rate"
    ],
    "Object": [
        "object", "describe", "thing", "what is this", "identify", "scan", 
        "detection", "look for", "object recognition"
    ],
    "Product": [
        "product", "brand", "logo", "item", "product name", "identify product", "check product", 
        "product details", "product information"
    ],
    "Distance": [
        "distance", "range", "how far", "measure", "long", "distance to", "how far is", 
        "how much is the distance", "measure distance", "range of"
    ],
    "Face": [
        "face", "who is this", "person", "identify person", "recognize face", "face recognition", 
        "who is the person", "show me the face"
    ],
    "Music": [
        "music", "track", "what's playing", "music track", "listen", "audio"
    ],
    "Play": [
        "play", "begin", "launch", "initiate", "start playback", "begin function", 
        "start process", "launch task", "begin operation"
    ],
    "Stop": [
        "stop", "pause", "halt", "end", "pause function", "halt process", "cancel", 
        "end task", "stop operation"
    ],
    "Detect": [
        "detect", "recognize", "scan surroundings", "recognize object", "detect object", "scan area", 
        "identify items",
    ],
    "Help": [
        "help", "assist", "guide", "support", "help me", "assist me", "I need help", 
        "provide assistance", "help with", "assist in", "guide me"
    ],
    "Capture": [
        "capture", "take a picture", "snap", "photo", "image", "snapshot", "take"
    ],
})

# Deduplicate keywords across features
used_keywords = set()
deduped_feature_labels = {}

for feature, keywords in raw_feature_labels.items():
    unique_keywords = []
    for keyword in keywords:
        lower_keyword = keyword.lower()
        if lower_keyword not in used_keywords:
            unique_keywords.append(keyword)
            used_keywords.add(lower_keyword)
    deduped_feature_labels[feature] = unique_keywords

FEATURE_LABELS = deduped_feature_labels



NAVIGATION_TRIGGERS = LanguageConfig.get_all_triggers()

FEATURE_NAMES = LanguageConfig.get_feature_names_dict()

FEATURE_KEYWORDS_FOR_SEMANTIC_MATCH = deduped_feature_labels 

# === ACTION COMMANDS ===
ACTION_COMMANDS = {
    "en": {
        "play": "Play",
        "stop": "Stop",
        "pause": "Stop",
        "track": "Track",
        "detect": "Detect",
        "capture": "Capture",
        "take": "Capture",
        "snap": "Capture",
        "read": "Read",
        "convert": "Convert",
        "find": "Find",
        "search": "Find",
        "locate": "Find"
    },
    "vi": {
        "phát": "Play",
        "dừng": "Stop",
        "tạm dừng": "Stop",
        "theo dõi": "Track",
        "phát hiện": "Detect",
        "chụp": "Capture",
        "đọc": "Read",
        "chuyển đổi": "Convert",
        "tìm": "Find",
        "tìm kiếm": "Find"
    }
}

def get_all_action_commands():
    """Get all action commands from all languages"""
    commands = {}
    for lang_dict in ACTION_COMMANDS.values():
        commands.update(lang_dict)
    return commands

ALL_ACTION_COMMANDS = get_all_action_commands()

# --- Helper function to find navigation intent ---
def find_navigation_intent(text):
    text_lower = text.lower()
    for trigger in NAVIGATION_TRIGGERS:
        trigger_lower = trigger.lower() + " " 
        if text_lower.startswith(trigger_lower):
            # Extract what comes after the trigger
            potential_feature_phrase = text_lower[len(trigger_lower):].strip()
            # Check if the rest matches a feature name/alias
            for feature_key, aliases in FEATURE_NAMES.items():
                for alias in aliases:
                    if potential_feature_phrase.startswith(alias.lower()):
                         # Found a navigation command!
                        return {
                            "intent": "navigate",
                            "target_feature": feature_key,
                            "confidence": 0.95 # High confidence for explicit match
                        }
            pass # Continue checking other triggers

    for feature_key, aliases in FEATURE_NAMES.items():
        for alias in aliases:
            if text_lower == alias.lower():
                 return {
                    "intent": "navigate",
                    "target_feature": feature_key,
                    "confidence": 0.75 # Lower confidence for implicit navigation
                }

    return None # No clear navigation intent found

# --- Helper function for fuzzy string matching ---
def fuzzy_match_word(word, candidates, threshold=0.75):
    """
    Tìm từ gần giống nhất trong danh sách candidates
    
    Args:
        word: Từ cần match (vd: "fi", "trak")
        candidates: Danh sách các từ chuẩn
        threshold: Ngưỡng similarity (0.0-1.0)
    
    Returns:
        (matched_word, confidence) hoặc (None, 0)
    """
    best_match = None
    best_ratio = 0
    
    for candidate in candidates:
        ratio = SequenceMatcher(None, word.lower(), candidate.lower()).ratio()
        if ratio > best_ratio and ratio >= threshold:
            best_ratio = ratio
            best_match = candidate
    
    return best_match, best_ratio

# --- Helper function to find action intent ---
def find_action_intent(text):
    """
    Detect action commands like Play, Stop, Track, Find, etc.
    Hỗ trợ fuzzy matching cho trường hợp phát âm không chuẩn
    
    Args:
        text: User command text
    
    Returns:
        {
            "intent": "action",
            "action_verb": "Play",
            "target_feature": "Music" (nếu có),
            "confidence": 0.85
        }
        hoặc None nếu không phải action
    """
    text_lower = text.lower().strip()
    words = text_lower.split()
    
    # Check if first word is an action verb (EXACT MATCH)
    first_word = words[0] if words else ""
    
    if first_word in ALL_ACTION_COMMANDS:
        action_verb = ALL_ACTION_COMMANDS[first_word]
        
        # Extract target if any (e.g., "play music" → target="music")
        target_phrase = " ".join(words[1:]) if len(words) > 1 else None
        
        # Try to match target to a feature
        target_feature = None
        if target_phrase:
            for feature_key, aliases in FEATURE_NAMES.items():
                for alias in aliases:
                    if target_phrase.startswith(alias.lower()):
                        target_feature = feature_key
                        break
                if target_feature:
                    break
        
        return {
            "intent": "action",
            "action_verb": action_verb,
            "target_feature": target_feature,
            "original_text": text,
            "confidence": 0.85
        }
    
    # FUZZY MATCH: Check if first word is similar to an action verb
    # Ví dụ: "fi" → "find", "trak" → "track"
    matched_word, match_confidence = fuzzy_match_word(
        first_word, 
        ALL_ACTION_COMMANDS.keys(),
        threshold=0.5  
    )
    
    if matched_word:
        action_verb = ALL_ACTION_COMMANDS[matched_word]
        
        # Extract target
        target_phrase = " ".join(words[1:]) if len(words) > 1 else None
        target_feature = None
        
        if target_phrase:
            for feature_key, aliases in FEATURE_NAMES.items():
                for alias in aliases:
                    if target_phrase.startswith(alias.lower()):
                        target_feature = feature_key
                        break
                if target_feature:
                    break
        
        # Confidence giảm xuống vì là fuzzy match
        confidence = 0.75 * match_confidence  # Nhân với match confidence
        
        return {
            "intent": "action",
            "action_verb": action_verb,
            "target_feature": target_feature,
            "original_text": text,
            "confidence": round(confidence, 2)
        }
    
    # Check for action verb anywhere in the phrase (lower confidence)
    for word in words:
        if word in ALL_ACTION_COMMANDS:
            action_verb = ALL_ACTION_COMMANDS[word]
            
            return {
                "intent": "action",
                "action_verb": action_verb,
                "target_feature": None,  # Cần semantic routing
                "original_text": text,
                "confidence": 0.65  # Lower confidence
            }
    
    return None

# --- Helper function for Semantic Query Routing ---
def route_query_semantically(query_text, embedder, feature_keywords):
    from sentence_transformers import util
    query_embed = embedder.encode(query_text, convert_to_tensor=True)
    best_match_feature, best_score = None, -1

    # Match against the *keywords* associated with each feature
    for feature_key, keywords in feature_keywords.items():
        # Maybe average embeddings of keywords, or check against each?
        # Checking against each is simpler for now
        feature_avg_score = 0
        if not keywords: continue # Skip features with no keywords

        for keyword in keywords:
            keyword_embed = embedder.encode(keyword, convert_to_tensor=True)
            score = util.cos_sim(query_embed, keyword_embed).item()
            feature_avg_score += score
            # Optional: Keep track of the best *single* keyword match score too

        feature_avg_score /= len(keywords) # Average score for the feature

        if feature_avg_score > best_score:
            best_match_feature, best_score = feature_key, feature_avg_score

    print(f"Best match feature: {best_match_feature}, Score: {best_score}")
    # Add a threshold - don't route if confidence is too low
    CONFIDENCE_THRESHOLD = 0.1 # Tune this value
    if best_score < CONFIDENCE_THRESHOLD:
        # If below threshold, maybe it's a general chatbot query?
        # Or an unknown intent. Defaulting to Chatbot might be safe.
        return {
            "intent": "query",
            "target_feature": "Chatbot", # Default fallback
            "query": query_text,
            "confidence": round(best_score, 3),
            "routing_fallback": True
        }

    return {
        "intent": "query",
        "target_feature": best_match_feature,
        "query": query_text,
        "confidence": round(best_score, 3),
        "routing_fallback": False
    }