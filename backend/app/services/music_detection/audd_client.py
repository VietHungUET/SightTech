import requests
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

class AuddClient:
    
    BASE_URL = "https://api.audd.io/"
    
    def __init__(self, api_key: str):
        """
        Initialize Audd client
        
        Args:
            api_key: Audd.io API key (free: 50 requests/day)
        """
        if not api_key:
            raise ValueError("Audd.io API key is required")
        self.api_key = api_key
    
    def recognize_song(self, audio_file_path: str, timeout: int = 30) -> Optional[Dict[str, Any]]:
        """
        Nhận diện bài hát từ file audio
        
        Args:
            audio_file_path: Đường dẫn đến file audio
            timeout: Timeout cho request (seconds)
            
        Returns:
            Dict chứa thông tin bài hát hoặc None nếu lỗi
        """
        try:
            logger.info(f"Recognizing music from: {audio_file_path}")
            
            with open(audio_file_path, 'rb') as audio_file:
                files = {'file': audio_file}
                data = {
                    'api_token': self.api_key,
                    'return': 'spotify' 
                }
                
                response = requests.post(
                    self.BASE_URL, 
                    data=data, 
                    files=files, 
                    timeout=timeout
                )
                response.raise_for_status()
                
                result = response.json()
                logger.info(f"Audd.io response status: {result.get('status')}")
                
                return self._parse_response(result)
                
        except requests.Timeout:
            logger.error("Audd.io API request timeout")
            return None
        except requests.RequestException as e:
            logger.error(f"Audd.io API error: {e}")
            return None
        except FileNotFoundError:
            logger.error(f"Audio file not found: {audio_file_path}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return None
    
    def _parse_response(self, result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Parse response từ Audd.io API"""
        
        if result.get('status') != 'success':
            logger.warning("Audd.io returned non-success status")
            return {'found': False, 'message': 'Music recognition failed'}
        
        song_data = result.get('result')
        
        if not song_data:
            logger.info("No song found in audio")
            return {'found': False, 'message': 'Could not identify the music'}
        
    
        title = song_data.get('title', 'Unknown Title')
        artist = song_data.get('artist', 'Unknown Artist')
        
        spotify = song_data.get('spotify', {})
        
        parsed_data = {
            'found': True,
            'title': title,
            'artist': artist,
            'album': song_data.get('album', 'Unknown Album'),
            'release_date': song_data.get('release_date', 'Unknown'),
            'label': song_data.get('label'),
        }
        
        if spotify:
            parsed_data['spotify'] = {
                'url': spotify.get('external_urls', {}).get('spotify'),
                'uri': spotify.get('uri'),
                'track_id': spotify.get('id'),
                'preview_url': spotify.get('preview_url'),  # 30s preview
                'album_name': spotify.get('album', {}).get('name'),
                'album_url': spotify.get('album', {}).get('external_urls', {}).get('spotify'),
                'artwork': self._get_artwork(spotify),
                'artist_name': spotify.get('artists', [{}])[0].get('name') if spotify.get('artists') else artist,
                'artist_url': spotify.get('artists', [{}])[0].get('external_urls', {}).get('spotify') if spotify.get('artists') else None,
                'duration_ms': spotify.get('duration_ms'),
                'explicit': spotify.get('explicit', False),
                'popularity': spotify.get('popularity', 0),
                'embed_url': f"https://open.spotify.com/embed/track/{spotify.get('id')}" if spotify.get('id') else None
            }
        
        
        return parsed_data
    
    def _get_artwork(self, spotify: Dict) -> Optional[Dict[str, str]]:
        """Extract album artwork URLs"""
        try:
            images = spotify.get('album', {}).get('images', [])
            if not images:
                return None
            
            return {
                'large': images[0].get('url') if len(images) > 0 else None,
                'medium': images[1].get('url') if len(images) > 1 else None,
                'small': images[2].get('url') if len(images) > 2 else None
            }
        except Exception:
            return None
    
   