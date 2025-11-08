"""
Audio Analyzer
Phân tích và mô tả âm thanh không phải nhạc bằng OpenAI Whisper + GPT
"""
import logging
from typing import Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

class AudioAnalyzer:
    """Phân tích âm thanh sử dụng OpenAI Whisper và GPT"""
    
    def __init__(self, openai_api_key: str):
        """
        Initialize Audio Analyzer
        
        Args:
            openai_api_key: OpenAI API key
        """
        if not openai_api_key:
            raise ValueError("OpenAI API key is required")
        self.client = OpenAI(api_key=openai_api_key)
    
    def describe_audio(self, audio_file_path: str) -> str:
        """
        Mô tả âm thanh lạ (không phải nhạc) bằng Whisper + GPT
        
        Args:
            audio_file_path: Đường dẫn đến file audio
            
        Returns:
            Mô tả về âm thanh
        """
        try:
            logger.info("Analyzing audio with OpenAI...")
            
            # Bước 1: Transcribe audio với Whisper
            transcript = self._transcribe_audio(audio_file_path)
            
            if not transcript:
                return "I could not analyze this audio clearly."
            
            # Bước 2: Phân tích với GPT
            description = self._analyze_with_gpt(transcript)
            
            return description
            
        except Exception as e:
            logger.error(f"Error describing audio: {e}")
            return "Unable to describe this audio."
    
    def _transcribe_audio(self, audio_file_path: str) -> Optional[str]:
        """
        Transcribe audio thành text bằng Whisper
        
        Args:
            audio_file_path: Đường dẫn file audio
            
        Returns:
            Transcribed text hoặc None nếu lỗi
        """
        try:
            logger.info("Transcribing audio with Whisper...")
            
            with open(audio_file_path, 'rb') as audio_file:
                transcript = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="en"  # Auto-detect nếu không set
                )
            
            logger.info(f"Transcription: {transcript.text[:100]}...")
            return transcript.text
            
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return None
    
    def _analyze_with_gpt(self, transcript: str) -> str:
        """
        Phân tích transcript với GPT để mô tả âm thanh
        
        Args:
            transcript: Text từ audio
            
        Returns:
            Mô tả âm thanh
        """
        try:
            logger.info("Analyzing audio content with GPT...")
            
            system_prompt = """You are an expert audio analyst for visually impaired users.
Your task is to describe what sounds, speech, or audio content you hear based on the transcription.

Provide:
- Type of sound (speech, ambient noise, nature sounds, etc.)
- Content description (what is being said or what the sound is)
- Context if possible (setting, mood, purpose)

Be concise, clear, and helpful for someone who cannot see."""

            completion = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user", 
                        "content": f"Analyze this audio transcription and describe what it contains: {transcript}"
                    }
                ],
                max_tokens=150,
                temperature=0.7
            )
            
            description = completion.choices[0].message.content.strip()
            logger.info("GPT analysis complete")
            
            return description
            
        except Exception as e:
            logger.error(f"GPT analysis error: {e}")
            return f"This audio contains: {transcript[:200]}"