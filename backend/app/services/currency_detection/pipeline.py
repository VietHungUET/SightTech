import base64
import json
import os
import requests

def detect_currency(image_bytes):
    """
    Detect currency in an image byte stream using Gemini API (direct HTTP)
    
    Args:
        image_bytes: Raw bytes of the image
        
    Returns:
        dict: Detection results including total money and detected items
    """
    try:
        # Check API key
        gemini_api_key = os.getenv("GOOGLE_API_KEY")
        if not gemini_api_key:
            return {"error": "GOOGLE_API_KEY is missing in environment variables"}

        # Encode image to base64
        base64_image = base64.b64encode(image_bytes).decode("utf-8")
        
        # Prepare Gemini API request - using thinking model for better accuracy
        api_url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-pro:generateContent?key={gemini_api_key}"
        )
        
        # Construct detailed prompt with visual descriptions to avoid confusion
        prompt_text = (
            "You are an expert at identifying Vietnamese polymer banknotes. Analyze this image carefully.\n\n"
            "IMPORTANT: Pay close attention to the COLOR and PORTRAIT to distinguish denominations:\n\n"
            "Vietnamese Currency Visual Guide:\n"
            "- 500 VND: GREEN plastic note, very small, portrait of Hồ Chí Minh\n"
            "- 1,000 VND: GREEN-GRAY, SMALL, portrait of Hồ Chí Minh\n"
            "- 2,000 VND: BLUE-PURPLE, portrait of Hồ Chí Minh\n"
            "- 5,000 VND: PURPLE/VIOLET, portrait of Hồ Chí Minh\n"
            "- 10,000 VND: BROWN/TAN, portrait of Hồ Chí Minh\n"
            "- 20,000 VND: BLUE (light blue/cyan), portrait of Hồ Chí Minh, shows ONE PILLAR PAGODA\n"
            "- 50,000 VND: PINK/MAGENTA, portrait of Hồ Chí Minh, shows HUỆ CITY\n"
            "- 100,000 VND: GREEN (bright green), portrait of Hồ Chí Minh\n"
            "- 200,000 VND: BROWN/ORANGE-BROWN, portrait of Hồ Chí Minh\n"
            "- 500,000 VND: YELLOW/GOLDEN, portrait of Hồ Chí Minh\n\n"
            "CRITICAL: 20,000 VND is BLUE and shows One Pillar Pagoda. 50,000 VND is PINK/MAGENTA and shows Huế. "
            "If you see BLUE, it's 20,000. If you see PINK/MAGENTA, it's 50,000.\n\n"
            "Examine the image and identify ALL Vietnamese currency notes visible.\n"
            "Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:\n"
            '{\n'
            '  "total_money": <sum of all detected notes>,\n'
            '  "detections": [\n'
            '    {"class": "<denomination>", "confidence": <0.0-1.0>, "color": "<observed color>"}\n'
            '  ]\n'
            '}\n\n'
            "Rules:\n"
            "1. 'class' must be one of: '500', '1000', '2000', '5000', '10000', '20000', '50000', '100000', '200000', '500000'\n"
            "2. 'confidence' should reflect how certain you are (0.0 to 1.0)\n"
            "3. 'color' should describe the primary color you observe\n"
            "4. If NO currency is visible, return: {\"total_money\": 0, \"detections\": []}\n"
            "5. Sum all detected notes for 'total_money'\n"
            "6. Be very careful distinguishing 20,000 (BLUE) from 50,000 (PINK)"
        )
        
        # Prepare payload
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt_text},
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": base64_image
                        }
                    }
                ]
            }],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.0,
                "max_output_tokens": 8192,  # Increased to accommodate thinking tokens
            },
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
            ],
        }
        
        # Make the API call
        response = requests.post(
            api_url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        response.raise_for_status()
        api_json = response.json()
        
        print(f"DEBUG: Gemini API response: {api_json}")
        
        # Check if the API blocked or had issues
        if not api_json.get("candidates"):
            feedback = api_json.get("promptFeedback", {})
            return {
                "error": f"Gemini blocked/incomplete. Reason: {feedback.get('blockReason', 'Unknown')}",
                "details": api_json
            }
        
        candidate = api_json["candidates"][0]
        finish_reason = candidate.get("finishReason")
        
        # Handle MAX_TOKENS - retry with simpler prompt or return partial result
        if finish_reason == "MAX_TOKENS":
            print(f"WARNING: Hit MAX_TOKENS limit. Thoughts used: {api_json.get('usageMetadata', {}).get('thoughtsTokenCount', 0)}")
            return {
                "error": "The AI used too many thinking tokens. Please try again.",
                "total_money": 0,
                "detections": []
            }
        
        if finish_reason != "STOP":
            return {
                "error": f"Gemini stopped unexpectedly. Reason: {finish_reason}",
                "details": api_json
            }
        
        # Extract the generated text
        gen_text = api_json["candidates"][0]["content"]["parts"][0]["text"]
        gen_text = gen_text.strip().lstrip("```json").rstrip("```").strip()
        
        print(f"DEBUG: Raw Gemini response text: {gen_text}")
        
        # Parse JSON
        try:
            result = json.loads(gen_text)
            
            # Ensure structure matches what frontend expects
            if "total_money" not in result:
                result["total_money"] = 0
            if "detections" not in result:
                result["detections"] = []
                
            return result
            
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON from Gemini: {gen_text}")
            return {
                "total_money": 0,
                "detections": [],
                "error": f"JSON parse error: {e}",
                "raw_response": gen_text
            }
            
    except requests.exceptions.RequestException as e:
        print(f"HTTP error calling Gemini API: {e}")
        import traceback
        traceback.print_exc()
        return {"error": f"HTTP error: {str(e)}"}
        
    except Exception as e:
        print(f"Error in Gemini currency detection: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
