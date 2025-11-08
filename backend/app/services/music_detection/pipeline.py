"""
Music Detection Pipeline - KHÔNG DÙNG FORMATTER
"""
import logging
from typing import Dict, Any, Optional
from .audd_client import AuddClient
from .audio_analyzer import AudioAnalyzer

logger = logging.getLogger(__name__)

class MusicDetectionPipeline:
    """Pipeline xử lý nhận diện nhạc"""
    
    def __init__(self, audd_api_key: str, openai_api_key: str):
        self.audd_client = AuddClient(audd_api_key)
        self.audio_analyzer = AudioAnalyzer(openai_api_key)
    
    def process(self, audio_file_path: str) -> Dict[str, Any]:
        """Xử lý nhận diện nhạc hoặc mô tả âm thanh"""
        try:
            logger.info(f"Starting music detection for: {audio_file_path}")
            
            # Bước 1: Thử nhận diện nhạc
            music_result = self.audd_client.recognize_song(audio_file_path)
            
            if music_result is None:
                # Service error
                return {
                    'success': False,
                    'error': 'Music recognition service unavailable',
                    'description': "I'm sorry, I encountered an error while trying to identify this audio."
                }
            
            # Bước 2: Xử lý kết quả
            if music_result['found']:
                # Tìm thấy bài hát - FORMAT TEXT NGAY ĐÂY
                return self._handle_music_found(music_result)
            else:
                # Không tìm thấy - mô tả âm thanh
                return self._handle_music_not_found(audio_file_path)
                
        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            return {
                'success': False,
                'error': str(e),
                'description': "I'm sorry, I encountered an error while trying to identify this audio."
            }
    
    def _handle_music_found(self, music_info: Dict[str, Any]) -> Dict[str, Any]:
        """Xử lý khi tìm thấy bài hát"""
        logger.info(f"Music found: {music_info.get('title')} by {music_info.get('artist')}")
        
        return {
            'success': True,
            'type': 'music',
            'music_info': music_info
        }
    
    def _handle_music_not_found(self, audio_file_path: str) -> Dict[str, Any]:
        """Xử lý khi không tìm thấy bài hát"""
        logger.info("Music not found, analyzing audio content...")
        
        audio_description = self.audio_analyzer.describe_audio(audio_file_path)
        
       
        description = self.audio_analyzer.describe_audio(audio_file_path)
        
        return {
            'success': True,
            'type': 'audio_description',
            'description': description
        }
    
def execute_music_detection(audio_file_path: str, audd_api_key: str, openai_api_key: str) -> Dict[str, Any]:
    pipeline = MusicDetectionPipeline(audd_api_key, openai_api_key)
    return pipeline.process(audio_file_path)