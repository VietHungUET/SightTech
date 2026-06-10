import os
from dotenv import load_dotenv

load_dotenv()

import base64
import cv2
import logging
from fastapi import FastAPI, Form,File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fpdf import FPDF
import numpy as np
import openai
from pydantic import BaseModel, Json
from sympy import content

# from app.article_reading.pipeline import execute_pipeline
from app.services.question_answering.pipeline import ask_general_question
from app.utils.audio import FEATURE_KEYWORDS_FOR_SEMANTIC_MATCH, FEATURE_LABELS, FEATURE_NAMES, find_navigation_intent, find_action_intent, route_query_semantically, get_embedder
from app.utils.deepgram import transcribe_audio
from .utils.formatter import create_pdf, create_pdf_async, format_article_audio_response, format_response_distance_estimate_with_openai, format_response_product_recognition_with_openai, format_audio_response
# from .currency_detection.yolov8.YOLOv8 import YOLOv8
from .config import config
# from .text_recognition.provider.ocr.ocr import OcrRecognition
import sys
from fastapi.responses import FileResponse
from tempfile import NamedTemporaryFile
# from .product_recognition.pipeline import BarcodeProcessor
# from deepface import DeepFace
import time
#from app.services.image_captioning.provider.gemini.gemini import gen_img_description
import asyncio
# from .distance_estimate.stream_video_distance import calculate_focal_length_stream, calculate_distance_from_image
# from .face_detection.detectMongo import find_existing_face, process_frame, save_embedding_to_db, connect_mongodb, calculate_focal_length
import json
import mimetypes
#from app.services.image_captioning.provider.gpt4.gpt4 import OpenAIProvider
from fastapi import FastAPI, UploadFile, File
from sentence_transformers import SentenceTransformer, util
import tempfile
import requests
from collections import OrderedDict
from .services.all_task.pipeline import get_llm_response
from .services.barcode_scanning import BarcodeProcessingError, BarcodeScannerService
from .services.music_detection.pipeline import execute_music_detection
from .services.text_recognition import ImageQualityError, TextRecognitionError, TextRecognitionService
from .services.voice_command import (
    ConversationStoreError,
    HybridIntentClassifier,
    RedisConversationStore,
    VoiceCommandRouter,
    build_default_action_registry,
)
from .utils.formatter import format_audio_response
from .websocket_manager import manager
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _gemini_document_ocr(image_bytes: bytes) -> str:
    return get_llm_response(
        query="Extract text from this image.",
        task="text_recognition",
        base64_image=base64.b64encode(image_bytes).decode("utf-8"),
    )


text_recognition_service = TextRecognitionService(fallback_ocr=_gemini_document_ocr)


def _understand_document(instruction: str, document_text: str) -> str:
    return get_llm_response(
        query=f"{instruction}\n\nDocument text:\n{document_text}",
        task="document_understanding",
    )


def _classify_voice_command(prompt: str) -> str:
    return get_llm_response(query=prompt, task="voice_command_routing")


def _read_news(query: str) -> list:
    from app.services.article_reading.pipeline import execute_pipeline

    return execute_pipeline(query)


voice_conversation_store = RedisConversationStore(
    redis_url=config.REDIS_URL,
    ttl_seconds=config.VOICE_SESSION_TTL_SECONDS,
    max_turns=config.VOICE_SESSION_MAX_TURNS,
)
voice_action_registry = build_default_action_registry(
    recognize_document=text_recognition_service.recognize,
    process_document=_understand_document,
    answer_question=ask_general_question,
    read_news=_read_news,
)
voice_command_router = VoiceCommandRouter(
    store=voice_conversation_store,
    classifier=HybridIntentClassifier(llm_classifier=_classify_voice_command),
    actions=voice_action_registry,
)

try:
    barcode_scanner = BarcodeScannerService()
except RuntimeError as exc:
    logger.warning("Barcode scanner unavailable: %s", exc)
    barcode_scanner = None

start = time.time()
# ocr = OcrRecognition()
# currency_detection_model_path = "./models/best8.onnx"
# currency_detector = YOLOv8(currency_detection_model_path, conf_thres=0.2, iou_thres=0.3)
# barcode_processor = BarcodeProcessor()
# distance_estimation_model_path = "./models/yolov8m.onnx"
print(f"All Models loaded in {time.time() - start:.2f} seconds", file=sys.stderr)

app = FastAPI()

# Import WebSocket handlers for real-time description
from app.services.stream_video.websocket_server import (
    websocket_realtime_description,
    start_realtime_description,
    stop_realtime_description,
    get_description_status,
    stream_descriptions_to_clients
)

# Import WebSocket handlers for outdoor navigation
from app.services.outdoor_navigation.websocket_server import (
    websocket_outdoor_navigation,
    start_outdoor_navigation,
    stop_outdoor_navigation,
    get_navigation_status,
    stream_navigation_to_clients
)

# Start background task for streaming descriptions
@app.on_event("startup")
async def startup_event():
    """Start background tasks when FastAPI starts"""
    asyncio.create_task(stream_descriptions_to_clients())
    asyncio.create_task(stream_navigation_to_clients())
    print("[STARTUP] WebSocket streaming tasks started")

# Configure CORS for WebSocket
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define allowed origins (frontend URLs)

@app.get("/")
async def read_root():
    return {"Hello": "World"}

@app.post("/document_recognition")
async def document_recognition_hybrid(
    file: UploadFile = File(...),
    mode: str = Form("read"),
    question: str | None = Form(None),
):
    try:
        image_data = await file.read()
        result = await asyncio.to_thread(text_recognition_service.recognize, image_data)

        normalized_mode = mode.strip().lower()
        if normalized_mode in {"understand", "summarize", "explain"}:
            instruction = question or (
                "Summarize this document."
                if normalized_mode == "summarize"
                else "Explain this document clearly."
            )
            result["understanding"] = await asyncio.to_thread(
                get_llm_response,
                f"{instruction}\n\nDocument text:\n{result['text']}",
                "document_understanding",
            )

        return JSONResponse(content=result)
    except ImageQualityError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "status": "retry_required",
                "text": "",
                "detail": str(exc),
                "feedback": str(exc),
                "quality": exc.quality,
            },
        )
    except TextRecognitionError as exc:
        logger.error("Document recognition failed: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected document recognition error")
        raise HTTPException(status_code=500, detail="Internal server error") from exc


@app.post("/document_recognition_legacy", include_in_schema=False)
async def document_recognition(file: UploadFile = File(...)):
    try:
        start = time.time()
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")

        result = get_llm_response(
            query="Extract text from this image.",
            task="text_recognition",
            base64_image=base64_image,
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate text response")

        return JSONResponse(content={
            "status": "success",
            "text": result,
        })

    except Exception as e:
        print(f"Lỗi xảy ra: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/fetching_news")
async def fetching_news(news_query: str = Form(...)):
    try:
        if not news_query:
            raise HTTPException(status_code=400, detail="News query is required")
        
        # Import here to avoid circular imports if any
        from app.services.article_reading.pipeline import execute_pipeline
        articles = execute_pipeline(news_query)
        
        if not articles:
            raise HTTPException(status_code=404, detail="No articles found")
            
        return {"articles": [article.to_dict() for article in articles]}
    except Exception as e:
        print(f"Error in fetching_news: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Currency Detection Endpoint
from app.services.currency_detection.pipeline import detect_currency

@app.post("/currency_detection")
async def currency_detection(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        result = detect_currency(contents)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
            
        # Return JSON with total money and detections
        return {
            "total_money": result["total_money"],
            "detections": result["detections"],
            "message": f"Detected {result['total_money']:,} VND"
        }
    except Exception as e:
        print(f"Error in currency detection: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/image_captioning")
async def image_captioning(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")

        caption = get_llm_response(
            query="Extract text from this image.",
            task="image_captioning",
            base64_image=base64_image,
        )

        if not caption:
            raise HTTPException(status_code=500, detail="Failed to generate caption")

        return JSONResponse(content={
            "status": "success",
            "text": caption,
        })

    except Exception as e:
        print(f"Error:", e)
        raise HTTPException(status_code=500, detail="Internal server error")


    

@app.post("/product_recognition")
async def product_recognition(file: UploadFile = File(...)):
    try:
        start = time.time()
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")

        result = get_llm_response(
            query="Extract product information from this image.",
            task="product_recognition",
            base64_image=base64_image,
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate text response")

        return JSONResponse(content={
            "status": "success",
            "text": result,
        })

    except Exception as e:
        print(f"Lỗi xảy ra: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/barcode/scan")
async def barcode_scan(
    trigger: str = Form("snapshot"),
    file: UploadFile = File(...),
):
    if barcode_scanner is None:
        raise HTTPException(
            status_code=503,
            detail="Barcode scanning service is not available on this server.",
        )

    image_bytes = await file.read()

    try:
        result = barcode_scanner.scan_bytes(image_bytes, trigger=trigger)
    except BarcodeProcessingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    speech_text = result.get("speech_text")
    audio_url = None

    if speech_text:
        audio_path = format_audio_response(speech_text, "general_question_answering")
        if audio_path:
            audio_url = f"/download_audio?audio_path={audio_path}"

    payload = {**result, "audio_url": audio_url}
    return JSONResponse(content=payload)



# image_path = "./app/dis.jpg"  

# calculate_focal_length_stream(image_path)

# @app.post("/distance_estimate")
# async def calculate_distance(transcribe: str,file: UploadFile = File(...)):
#     image_data = await file.read()
#     base64_image = base64.b64encode(image_data).decode("utf-8")
#     np_arr = np.frombuffer(image_data, np.uint8)
#     image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
#     if image is None:
#         raise HTTPException(status_code=400, detail="Invalid image file")
    
#     results = calculate_distance_from_image(image_data)
#     print(results)
#     if results is None:
#         raise HTTPException(status_code=400, detail="Không thể xử lý ảnh.")
#     results = format_response_distance_estimate_with_openai(results, transcribe, base64_image)
#     print(results)
#     return JSONResponse(content={
#         "description" : results
#     })

@app.post("/distance_estimate_v2")
async def distance_estimate(file: UploadFile = File(...)):
    try:
        start = time.time()
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")

        result = get_llm_response(
            query="Extract navigational information from this image.",
            task="distance_estimation",
            base64_image=base64_image,
        )

        if not result:
            raise HTTPException(status_code=500, detail="Failed to generate text response")

        return JSONResponse(content={
            "status": "success",
            "text": result,
        })

    except Exception as e:
        print(f"Lỗi xảy ra: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/music_detection")
async def music_detection(file: UploadFile = File(...)):
    temp_path = None
    
    try:
        # Lưu file tạm
        with NamedTemporaryFile(delete=False, suffix=".webm") as temp:
            content = await file.read()
            temp.write(content)
            temp_path = temp.name
        
        result = execute_music_detection(
            audio_file_path=temp_path,
            audd_api_key=config.AUDD_API_KEY,
            openai_api_key=config.OPENAI_API_KEY
        )
        
        if not result['success']:
            raise HTTPException(
                status_code=500, 
                detail=result.get('error', 'Unknown error')
            )
        
        audio_path = format_audio_response(
            result, 
            "music_recognition"
        )
        
        if not audio_path:
            raise HTTPException(
                status_code=500, 
                detail="Failed to generate audio response"
            )
        
        # Thêm audio_path vào result
        result['audio_path'] = audio_path
        
        logger.info(f"Music detection successful: {result.get('type')}")
        
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in music detection endpoint: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Internal server error: {str(e)}"
        )
    finally:
        # Cleanup temp file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception as e:
                logger.warning(f"Could not delete temp file: {e}")


# collection = connect_mongodb()
# if collection is None:
#     raise HTTPException(status_code=500, detail="Database connection failed")
# calculate_focal_length(image_path)

# @app.post("/face_detection/register")
# async def register(
#     name: str,
#     hometown: str,
#     relationship: str,
#     date_of_birth: str,
#     file: UploadFile = File(...)
# ):
#     image_data = await file.read()
#     np_arr = np.frombuffer(image_data, np.uint8)
#     image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
#     if image is None:
#         raise HTTPException(status_code=400, detail="Invalid image file")

#     try:
#         embedding = DeepFace.represent(image, enforce_detection=False)[0]['embedding']
        
#         save_embedding_to_db(
#             collection, 
#             name, 
#             np.array(embedding), 
#             hometown=hometown,
#             relationship=relationship,
#             date_of_birth=date_of_birth
#         )

#         print(JSONResponse(content={
#             "message": f"Registration successful for {name}",
#             "hometown": hometown,
#             "relationship": relationship,
#             "date_of_birth": date_of_birth
#         }))
        
#         return JSONResponse(content= {
#             "description": f"Đã đăng kí thành công nhận diện khuôn mặt đối với {name} với thông tin như sau: Quê quán: {hometown}, Mối quan hệ với người dùng {relationship}, ngày tháng năm sinh: {date_of_birth}"
#         })
        
#     except Exception as e:
#         print(e)
#         raise HTTPException(status_code=500, detail="Failed to process registration")


# # Recognition Endpoint
# @app.post("/face_detection/recognize")
# async def recognize(file: UploadFile = File(...)):
#     image_data = await file.read()
#     np_arr = np.frombuffer(image_data, np.uint8)
#     image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
#     if image is None:
#         raise HTTPException(status_code=400, detail="Invalid image file")

#     # Generate the embedding
#     try:
#         embedding = DeepFace.represent(image, enforce_detection=False)[0]['embedding']
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {e}")

#     try:
#         # Process the frame to get response data
#         response_data = process_frame(image, collection)
#         if "error" in response_data:
#             raise HTTPException(status_code=500, detail=response_data['error'])
        
#         if response_data:
#             data = response_data[0]
#             recognized_name = data.get('Name', 'Unknown')
            
#             # Find existing face and retrieve additional details
#             face_match = find_existing_face(collection, np.array(embedding))
#             if face_match:
#                 matched_name, similarity_score = face_match
#                 matched_face = collection.find_one({"name": matched_name})
                
#                 hometown = matched_face.get("hometown", "Unknown")
#                 relationship = matched_face.get("relationship", "Unknown")
#                 date_of_birth = matched_face.get("date_of_birth", "Unknown")
#                 result =  {
#                     "message": "Recognition successful",
#                     "name": recognized_name,
#                     "matched_name": matched_name,
#                     "similarity_score": similarity_score.item(),
#                     "age": data.get('Age'),
#                     "gender": data.get('Gender'),
#                     "emotion": data.get('Emotion'),
#                     "race": data.get('Race'),
#                     "distance": data.get('Distance').item(),
#                     "hometown": hometown,
#                     "relationship": relationship,
#                     "date_of_birth": date_of_birth
#                 }
#                 print(result)
#                 return JSONResponse(content= {
#                     "description": f"Nhận diện thành công. Đây là {recognized_name}, cách bạn khoảng {data.get('Distance').item()} inch, quê quán: {hometown}, mối quan h��� với bạn là {relationship}"
#                 })
#         else:
#             raise HTTPException(status_code=404, detail="Face not recognized")
#     except Exception as e:
#         print(f"Error in recognition endpoint: {e}")
#         raise HTTPException(status_code=404, detail="Failed to process recognition")

@app.post("/transcribe_audio_simple")
async def transcribe_audio_simple(file: UploadFile = File(...)):
    """
    Endpoint đơn giản chỉ transcribe audio, không phân tích intent.
    Dùng cho onboarding hoặc các trường hợp chỉ cần transcript thuần.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        transcript_result = transcribe_audio(tmp_path)
        os.remove(tmp_path)
        
        # Kiểm tra error
        if "error" in transcript_result:
            return {
                "transcript": "",
                "success": False,
                "error": transcript_result["error"]
            }
        
        return {
            "transcript": transcript_result["transcript"],
            "success": True
        }
        
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        
        return {
            "transcript": "",
            "success": False,
            "error": str(e)
        }

@app.post("/transcribe_audio_v2")
async def process_voice_command(
    file: UploadFile = File(...),
    image: UploadFile | None = File(None),
    current_feature: str | None = None,
    session_id: str = "default",
):
    """
    Processes voice input, distinguishing navigation commands from feature queries.

    Args:
        file: The uploaded audio file (.webm format expected).
        current_feature: The key/name of the feature currently active in the UI (optional).
                         Helps disambiguate queries. e.g., "News", "Text".

    Returns:
        A dictionary containing the transcription, recognized intent ('navigate' or 'query'),
        target feature, confidence score, and original query text if applicable.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        transcript_result = transcribe_audio(tmp_path)
        logger.info(f"Transcription result: {transcript_result}")

        if not transcript_result or "transcript" not in transcript_result:
             raise HTTPException(status_code=500, detail="Transcription failed.")

        transcript_text = transcript_result.get("transcript", "").strip()

        if not transcript_text:
             raise HTTPException(status_code=400, detail="Empty transcript received.")

        image_bytes = await image.read() if image else None
        routed = await asyncio.to_thread(
            voice_command_router.handle,
            transcript_text,
            session_id,
            {"image_bytes": image_bytes} if image_bytes else {},
        )
        return {
            **routed.model_dump(mode="json"),
            "transcript": transcript_result,
            "query": transcript_text,
            "intent": routed.route.operation.value,
            "command": routed.route.domain.value,
            "target_feature": routed.route.domain.value,
            "confidence": routed.route.confidence,
        }

    except ConversationStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as e:
        print(f"❌ Error processing voice command: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process audio: {str(e)}")
    finally:
        import os
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
             os.unlink(tmp_path)

from typing import Annotated

class NewsQuery(BaseModel):
    news_query: str

class ChatbotQuery(BaseModel):
    message: str


class VoiceCommandQuery(BaseModel):
    text: str
    session_id: str


@app.post("/voice-command/text")
@app.post("/voice-command", include_in_schema=False)
async def route_text_voice_command(request: VoiceCommandQuery):
    """Route a text command through the same backend pipeline used after ASR."""
    try:
        response = await asyncio.to_thread(
            voice_command_router.handle,
            request.text,
            request.session_id,
        )
        return response.model_dump(mode="json")
    except ConversationStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/voice-command/audio")
async def route_audio_voice_command(
    audio: UploadFile = File(...),
    image: UploadFile | None = File(None),
    session_id: str = Form(...),
):
    """Run ASR, route the command, execute it, and persist conversation context."""
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(await audio.read())
            temp_path = temp.name
        transcript_result = await asyncio.to_thread(transcribe_audio, temp_path)
        if not transcript_result or transcript_result.get("error"):
            raise HTTPException(status_code=503, detail="Transcription failed.")
        transcript = transcript_result.get("transcript", "").strip()
        if not transcript:
            raise HTTPException(status_code=400, detail="Empty transcript received.")
        image_bytes = await image.read() if image else None
        response = await asyncio.to_thread(
            voice_command_router.handle,
            transcript,
            session_id,
            {"image_bytes": image_bytes} if image_bytes else {},
        )
        return {**response.model_dump(mode="json"), "asr": transcript_result}
    except ConversationStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)

@app.post("/fetching_news")
async def fetching_news(news_query: str = Form(...)):
    try:
        if not news_query:
            raise HTTPException(status_code=400, detail="News query is required")
        
        # Import here to avoid circular imports if any
        from app.services.article_reading.pipeline import execute_pipeline
        articles = execute_pipeline(news_query)
        
        if not articles:
            raise HTTPException(status_code=404, detail="No articles found")
            
        return {"articles": [article.to_dict() for article in articles]}
    except Exception as e:
        print(f"Error in fetching_news: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Currency Detection Endpoint
from app.services.currency_detection.pipeline import detect_currency

@app.post("/currency_detection")
async def currency_detection(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        result = detect_currency(contents)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
            
        # Return JSON with total money and detections
        return {
            "total_money": result["total_money"],
            "detections": result["detections"],
            "message": f"Detected {result['total_money']:,} VND"
        }
    except Exception as e:
        print(f"Error in currency detection endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/general_question_answering")
async def general_qa(message: str = Form(...)):
    try:
        # 1. LLM trả lời
        answer = get_llm_response(
            query=message,
            task="general_question_answering",
            base64_image=None
        )

        if not answer:
            raise HTTPException(status_code=500, detail="LLM did not return a response")

        # 2. Chuyển text → speech (mp3 file)
        audio_path = format_audio_response(answer, "general_question_answering")

        if not audio_path:
            raise HTTPException(status_code=500, detail="Failed to generate audio response")

        # 3. Trả reply + link audio cho FE
        return JSONResponse(
            content={
                "reply": answer,
                "audio_url": f"/download_audio?audio_path={audio_path}"
            },
            status_code=200
        )

    except Exception as e:
        print("Error:", e)
        raise HTTPException(status_code=500, detail="Internal server error")



@app.websocket("/ws/realtime-description")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time scene description.
    Frontend connects here to receive continuous descriptions.
    """
    await websocket_realtime_description(websocket)


@app.post("/realtime-description/start")
async def start_description():
    """Start real-time description service"""
    return await start_realtime_description()


@app.post("/realtime-description/stop")
async def stop_description():
    """Stop real-time description service"""
    return await stop_realtime_description()


@app.get("/realtime-description/status")
async def description_status():
    """Get status of real-time description service"""
    return await get_description_status()


# ============================================================================
# Outdoor Navigation WebSocket Endpoints
# ============================================================================

@app.websocket("/ws/outdoor-navigation")
async def outdoor_navigation_ws(websocket: WebSocket):
    """
    WebSocket endpoint for outdoor navigation.
    Frontend connects here to receive continuous navigation guidance.
    """
    await websocket_outdoor_navigation(websocket)


@app.post("/outdoor-navigation/start")
async def start_navigation(use_camera: bool = True, video_path: str = None):
    """Start outdoor navigation service"""
    return await start_outdoor_navigation(use_camera, video_path)


@app.post("/outdoor-navigation/stop")
async def stop_navigation():
    """Stop outdoor navigation service"""
    return await stop_outdoor_navigation()


@app.get("/outdoor-navigation/status")
async def navigation_status():
    """Get status of outdoor navigation service"""
    return await get_navigation_status()


# ============================================================================

@app.get("/download_audio")
async def download_audio(audio_path: str):
    return FileResponse(audio_path, media_type="audio/mpeg", filename="document.mp3")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT, reload=True)
