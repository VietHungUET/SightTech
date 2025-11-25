import base64
import logging
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import cv2
import numpy as np
import requests

try:
    from pyzbar.pyzbar import ZBarSymbol, decode as zbar_decode
    BARCODE_IMPORT_ERROR: Optional[Exception] = None
except (ImportError, OSError, FileNotFoundError) as exc:  # pragma: no cover - depends on runtime env
    zbar_decode = None
    ZBarSymbol = None
    BARCODE_IMPORT_ERROR = exc

logger = logging.getLogger(__name__)

UNKNOWN_VALUE = "Unknown"


@dataclass
class BarcodeDetection:
    code: str
    symbology: str
    polygon: List[Dict[str, int]]


class BarcodeProcessingError(Exception):
    """Raised when an image cannot be processed for barcode scanning."""


class BarcodeScannerService:
    def __init__(self, session: Optional[requests.Session] = None) -> None:
        if zbar_decode is None:
            message = (
                "Barcode decoding requires pyzbar with the native zbar library installed. "
                "Please install libzbar (e.g. 'sudo apt install libzbar0' on Debian/Ubuntu or download "
                "the Windows DLL) and ensure it is available on the system path."
            )
            logger.error(message)
            raise RuntimeError(message) from BARCODE_IMPORT_ERROR

        self._session = session or requests.Session()
        # Hỗ trợ tất cả các loại barcode và QR code phổ biến
        self._symbols = [
            ZBarSymbol.QRCODE,      # QR Code
            ZBarSymbol.EAN13,       # Mã vạch sản phẩm quốc tế
            ZBarSymbol.EAN8,        # Mã vạch sản phẩm ngắn
            ZBarSymbol.CODE128,     # Mã vạch đa năng
            ZBarSymbol.CODE39,      # Mã vạch công nghiệp
            ZBarSymbol.UPCA,        # Mã vạch UPC-A
            ZBarSymbol.UPCE,        # Mã vạch UPC-E
            ZBarSymbol.CODE93,      # Mã vạch CODE93
            ZBarSymbol.CODABAR,     # Mã vạch y tế/logistics
            ZBarSymbol.I25,         # Interleaved 2 of 5
            ZBarSymbol.DATABAR,     # GS1 DataBar
            ZBarSymbol.DATABAR_EXP, # GS1 DataBar Expanded
        ]

    def scan_base64(self, base64_image: str, trigger: str = "snapshot") -> Dict[str, object]:
        try:
            image_bytes = base64.b64decode(base64_image)
        except (ValueError, TypeError) as exc:  # pragma: no cover - defensive
            raise BarcodeProcessingError("Invalid base64 payload provided.") from exc

        return self.scan_bytes(image_bytes, trigger=trigger)

    def scan_bytes(self, image_bytes: bytes, trigger: str = "snapshot") -> Dict[str, object]:
        frame = self._decode_image_bytes(image_bytes)
        
        # --- DEBUG: Save captured frame to disk ---
        import time
        import os
        debug_dir = "debug_captures"
        os.makedirs(debug_dir, exist_ok=True)
        timestamp = int(time.time() * 1000)
        filename = f"{debug_dir}/capture_{timestamp}.jpg"
        cv2.imwrite(filename, frame)
        logger.info(f"Saved debug capture to {filename}")

        detections = self._decode_barcodes(frame)
        detection_payload = [self._asdict_detection(item) for item in detections]

        if not detections:
            message = "No barcode detected in the frame."
            logger.info(message)
            return {
                "status": "no_barcode",
                "message": message,
                "barcode": None,
                "product": None,
                "speech_text": "I could not detect a barcode. Try adjusting the angle or lighting.",
                "trigger": trigger,
                "detections": detection_payload,
            }

        for detection in detections:
            product = self._fetch_product_info(detection.code)
            if not product:
                continue

            speech_text = self._compose_speech(product)
            success_message = f"Identified {product['name']} (barcode {detection.code})."

            return {
                "status": "success",
                "message": success_message,
                "barcode": detection.code,
                "product": product,
                "speech_text": speech_text,
                "trigger": trigger,
                "detections": detection_payload,
            }

        first_detection = detections[0]
        not_found_message = (
            f"Barcode {first_detection.code} detected, but no product information was found via OpenFoodFacts."
        )
        logger.info(not_found_message)
        return {
            "status": "not_found",
            "message": not_found_message,
            "barcode": first_detection.code,
            "product": None,
            "speech_text": (
                f"I found barcode {first_detection.code}, but the product is not listed in the OpenFoodFacts database yet."
            ),
            "trigger": trigger,
            "detections": detection_payload,
        }

    def _fetch_product_info(self, barcode: str) -> Optional[Dict[str, Any]]:
        # url = f"https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
        url = f"https://world.openfoodfacts.net/api/v2/product/{barcode}.json"

        try:
            response = self._session.get(url, timeout=8)
        except requests.RequestException as exc:
            logger.warning("Failed to reach OpenFoodFacts for %s: %s", barcode, exc)
            return None

        if response.status_code != 200:
            logger.info("OpenFoodFacts returned status %s for barcode %s", response.status_code, barcode)
            return None

        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("Invalid JSON from OpenFoodFacts for %s: %s", barcode, exc)
            return None

        if payload.get("status") != 1:
            logger.info("OpenFoodFacts has no entry for barcode %s", barcode)
            return None

        product = payload.get("product") or {}
        return self._format_product_result(product, barcode)

    def _decode_image_bytes(self, image_bytes: bytes) -> np.ndarray:
        frame_array = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = cv2.imdecode(frame_array, cv2.IMREAD_COLOR)
        if frame is None:
            raise BarcodeProcessingError("Invalid image data: unable to decode frame.")
        return frame

    def _decode_barcodes(self, frame: np.ndarray) -> List[BarcodeDetection]:
        """
        Hàm decode barcode hoàn chỉnh:
        - Thử mọi flip/rotate
        - Tự động detect + warp vùng barcode
        - Áp dụng toàn bộ pipeline tăng cường hiện có
        """

        # ------------------------------------------------------------
        # 1) TRY BASIC TRANSFORMS (rất quan trọng cho ảnh webcam)
        # ------------------------------------------------------------
        transforms = [
            ("orig", lambda x: x),
            ("flip_h", lambda x: cv2.flip(x, 1)),
            ("flip_v", lambda x: cv2.flip(x, 0)),
            ("rot_90", lambda x: cv2.rotate(x, cv2.ROTATE_90_CLOCKWISE)),
            ("rot_180", lambda x: cv2.rotate(x, cv2.ROTATE_180)),
            ("rot_270", lambda x: cv2.rotate(x, cv2.ROTATE_90_COUNTERCLOCKWISE)),
        ]

        for name, tf in transforms:
            timg = tf(frame)
            decoded = self._perform_decode(timg)
            if decoded:
                logger.info(f"[BARCODE] Detected after transform {name}: {[d.code for d in decoded]}")
                return decoded

        # ------------------------------------------------------------
        # 2) TRY TO EXTRACT + WARP BARCODE REGION
        # ------------------------------------------------------------
        warp = self._extract_and_warp_barcode(frame)
        if warp is not None:
            # tăng kích thước
            warp = cv2.resize(warp, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)

            decoded = self._perform_decode(warp)
            if decoded:
                logger.info(f"[BARCODE] Detected on warped ROI: {[d.code for d in decoded]}")
                return decoded

            # thử preprocess + decode
            enhanced = self._preprocess(warp)
            decoded = self._perform_decode(enhanced)
            if decoded:
                logger.info(f"[BARCODE] Detected after preprocess(warp): {[d.code for d in decoded]}")
                return decoded

        # ------------------------------------------------------------
        # 3) ORIGINAL FULL PIPELINE (như code của bạn)
        # ------------------------------------------------------------

        # 3.1 grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        decoded = self._perform_decode(gray)
        if decoded:
            logger.info(f"Detected barcode on grayscale frame: {[d.code for d in decoded]}")
            return decoded

        # 3.2 preprocess
        enhanced = self._preprocess(frame)
        decoded = self._perform_decode(enhanced)
        if decoded:
            logger.info(f"Detected barcode after preprocessing: {[d.code for d in decoded]}")
            return decoded

        # 3.3 sharpen
        sharpened = self._sharpen(enhanced)
        decoded = self._perform_decode(sharpened)
        if decoded:
            logger.info(f"Detected barcode after sharpening: {[d.code for d in decoded]}")
            return decoded

        # 3.4 adaptive threshold
        adaptive = self._adaptive_threshold(enhanced)
        decoded = self._perform_decode(adaptive)
        if decoded:
            logger.info(f"Detected barcode after adaptive threshold: {[d.code for d in decoded]}")
            return decoded

        # 3.5 Otsu
        binary = self._binary_threshold(enhanced)
        decoded = self._perform_decode(binary)
        if decoded:
            logger.info(f"Detected barcode after binary threshold: {[d.code for d in decoded]}")
            return decoded

        # 3.6 morphological
        morphed = self._morphological_operations(enhanced)
        decoded = self._perform_decode(morphed)
        if decoded:
            logger.info(f"Detected barcode after morphological ops: {[d.code for d in decoded]}")
            return decoded

        # 3.7 high contrast
        high_contrast = self._increase_contrast(enhanced)
        decoded = self._perform_decode(high_contrast)
        if decoded:
            logger.info(f"Detected barcode after high contrast: {[d.code for d in decoded]}")
            return decoded

        # 3.8 resize up
        resized_up = cv2.resize(frame, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        enhanced_up = self._preprocess(resized_up)
        decoded = self._perform_decode(enhanced_up)
        if decoded:
            logger.info(f"Detected barcode after scaling up: {[d.code for d in decoded]}")
            return decoded

        # 3.9 resize down
        resized_down = cv2.resize(frame, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
        enhanced_down = self._preprocess(resized_down)
        decoded = self._perform_decode(enhanced_down)
        if decoded:
            logger.info(f"Detected barcode after scaling down: {[d.code for d in decoded]}")
            return decoded

        # 3.10 invert
        inverted = cv2.bitwise_not(enhanced)
        decoded = self._perform_decode(inverted)
        if decoded:
            logger.info(f"Detected barcode after invert: {[d.code for d in decoded]}")
            return decoded

        logger.info("[BARCODE] No barcode detected after all methods")
        return []

    def _decode_barcodes_2(self, frame: np.ndarray) -> List[str]:
        decoded_objects = zbar_decode(frame)
        barcodes = [obj.data.decode("utf-8") for obj in decoded_objects]
        print(f"Simple decode results: {barcodes}")
        return barcodes

    def _perform_decode(self, frame: np.ndarray) -> List[BarcodeDetection]:
        raw_results = zbar_decode(frame, symbols=self._symbols)
        detections: List[BarcodeDetection] = []

        for item in raw_results:
            try:
                code = item.data.decode("utf-8").strip()
            except UnicodeDecodeError:
                code = item.data.decode("latin-1").strip()

            polygon = [
                {"x": point.x, "y": point.y}
                for point in getattr(item, "polygon", [])
            ]

            detections.append(
                BarcodeDetection(
                    code=code,
                    symbology=item.type,
                    polygon=polygon,
                )
            )

        return detections

    def _preprocess(self, frame: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        equalised = clahe.apply(gray)
        blurred = cv2.GaussianBlur(equalised, (5, 5), 0)
        return blurred
    
    def _extract_and_warp_barcode(self, img: np.ndarray) -> Optional[np.ndarray]:
        """
        Tự động tìm vùng barcode bằng Sobel gradient theo X,
        sau đó warp vùng đó thành hình chữ nhật thẳng.
        """

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 1) nhấn mạnh gradient theo chiều X (barcode có vạch dọc)
        gradX = cv2.Sobel(gray, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3)
        gradX = cv2.convertScaleAbs(gradX)

        # 2) làm mượt + threshold
        blurred = cv2.GaussianBlur(gradX, (9, 9), 0)
        _, thresh = cv2.threshold(
            blurred, 0, 255,
            cv2.THRESH_BINARY | cv2.THRESH_OTSU
        )

        # 3) morphological close để nối các vạch
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (21, 7))
        closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        closed = cv2.erode(closed, None, iterations=3)
        closed = cv2.dilate(closed, None, iterations=3)

        # 4) tìm contour lớn nhất
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        c = max(contours, key=cv2.contourArea)
        rect = cv2.minAreaRect(c)
        box = cv2.boxPoints(rect)
        box = np.array(box, dtype="float32")

        # 5) compute kích thước warp
        (tl, tr, br, bl) = box
        widthA = np.linalg.norm(br - bl)
        widthB = np.linalg.norm(tr - tl)
        maxWidth = int(max(widthA, widthB))

        heightA = np.linalg.norm(tr - br)
        heightB = np.linalg.norm(tl - bl)
        maxHeight = int(max(heightA, heightB))

        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")

        # 6) Warp perspective
        M = cv2.getPerspectiveTransform(box, dst)
        warp = cv2.warpPerspective(img, M, (maxWidth, maxHeight))

        # chỉnh orientation: barcode thường cao hơn rộng
        if warp.shape[0] < warp.shape[1]:
            warp = cv2.rotate(warp, cv2.ROTATE_90_CLOCKWISE)

        return warp


    def _sharpen(self, frame: np.ndarray) -> np.ndarray:
        kernel = np.array(
            [[0, -1, 0], [-1, 5, -1], [0, -1, 0]],
            dtype=np.float32,
        )
        return cv2.filter2D(frame, -1, kernel)
    
    def _adaptive_threshold(self, frame: np.ndarray) -> np.ndarray:
        """Adaptive thresholding - tốt cho ảnh có độ sáng không đồng đều"""
        if len(frame.shape) == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        return cv2.adaptiveThreshold(
            frame, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
    
    def _binary_threshold(self, frame: np.ndarray) -> np.ndarray:
        """Binary thresholding với Otsu's method"""
        if len(frame.shape) == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(frame, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return binary
    
    def _morphological_operations(self, frame: np.ndarray) -> np.ndarray:
        """Morphological operations để làm sạch noise và tăng cường barcode"""
        if len(frame.shape) == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Closing operation để đóng các khoảng trống nhỏ
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        closed = cv2.morphologyEx(frame, cv2.MORPH_CLOSE, kernel)
        
        # Opening operation để loại bỏ noise
        opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel)
        return opened
    
    def _increase_contrast(self, frame: np.ndarray) -> np.ndarray:
        """Tăng độ tương phản mạnh hơn"""
        if len(frame.shape) == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Sử dụng CLAHE với clipLimit cao hơn
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        return clahe.apply(frame)

    @staticmethod
    def _clean_text(value: Any) -> Optional[str]:
        if value is None:
            return None

        if isinstance(value, (list, tuple, set)):
            iterable: Iterable[Any] = value
            value = ", ".join(str(item) for item in iterable if item)

        value_str = str(value).strip()
        if not value_str:
            return None

        if value_str.lower() in {"unknown", "not specified", "n/a"}:
            return None

        return value_str

    @classmethod
    def _format_nutrition(cls, nutriments: Dict[str, Any]) -> Dict[str, str]:
        mapping = {
            "energy-kcal_100g": ("energy_kcal", "kcal"),
            "fat_100g": ("fat", "g"),
            "saturated-fat_100g": ("saturated_fat", "g"),
            "carbohydrates_100g": ("carbohydrates", "g"),
            "sugars_100g": ("sugars", "g"),
            "proteins_100g": ("proteins", "g"),
            "salt_100g": ("salt", "g"),
            "sodium_100g": ("sodium", "g"),
        }

        formatted: Dict[str, str] = {}

        for source_key, (target_key, unit) in mapping.items():
            raw_value = nutriments.get(source_key)
            if raw_value in (None, "", "unknown"):
                continue

            try:
                numeric = float(raw_value)
                if numeric.is_integer():
                    numeric = int(numeric)
                value = f"{numeric} {unit}/100g" if unit else str(numeric)
            except (ValueError, TypeError):  # pragma: no cover - defensive
                value = str(raw_value)

            cleaned_value = cls._clean_text(value)
            if cleaned_value:
                formatted[target_key] = cleaned_value

        return formatted

    def _format_product_result(self, product: Dict[str, Any], barcode: str) -> Dict[str, Any]:
        nutriments = product.get("nutriments", {})
        nutrition = self._format_nutrition(nutriments)

        result: Dict[str, Any] = {
            "barcode": barcode,
            "name": self._clean_text(product.get("product_name") or product.get("generic_name")) or UNKNOWN_VALUE,
            "brand": self._clean_text(product.get("brands")),
            "type": self._clean_text(product.get("product_type")),
            "category": self._clean_text(product.get("categories")),
            "quantity": self._clean_text(product.get("quantity")),
            "labels": self._clean_text(product.get("labels")),
            "nutri_score": self._clean_text(product.get("nutriscore_grade")),
            "description": self._clean_text(product.get("generic_name") or product.get("generic_name_en")),
            "ingredients": self._clean_text(product.get("ingredients_text")),
            "allergens": self._clean_text(product.get("allergens")),
            "image_url": self._clean_text(product.get("image_url")),
            "nutrition": nutrition,
        }

        return {key: value for key, value in result.items() if value not in (None, "", [])}

    def _compose_speech(self, product: Dict[str, Any]) -> str:
        parts: List[str] = []
        name = self._clean_text(product.get("name"))
        brand = self._clean_text(product.get("brand"))
        if name and brand:
            parts.append(f"This is {name} by {brand}.")
        elif name:
            parts.append(f"This is {name}.")

        quantity = self._clean_text(product.get("quantity"))
        if quantity:
            parts.append(f"Pack size {quantity}.")

        category = self._clean_text(product.get("category"))
        if category:
            parts.append(f"Category: {category}.")

        description = self._clean_text(product.get("description"))
        if description:
            parts.append(description)

        allergens = self._clean_text(product.get("allergens"))
        if allergens:
            parts.append(f"Allergens: {allergens}.")

        nutrition = product.get("nutrition")
        if isinstance(nutrition, dict) and nutrition:
            key_points = ", ".join(
                f"{key.replace('_', ' ')} {value}" for key, value in list(nutrition.items())[:3]
            )
            parts.append(f"Key nutrition facts: {key_points}.")

        labels = self._clean_text(product.get("labels"))
        if labels:
            parts.append(f"Labels: {labels}.")

        nutri_score = self._clean_text(product.get("nutri_score"))
        if nutri_score:
            parts.append(f"Nutri-Score grade {nutri_score.upper()}.")

        return " ".join(parts) or "Product information retrieved from OpenFoodFacts."

    def _asdict_detection(self, detection: BarcodeDetection) -> Dict[str, object]:
        return {
            "code": detection.code,
            "symbology": detection.symbology,
            "polygon": detection.polygon,
        }


__all__ = [
    "BarcodeScannerService",
    "BarcodeProcessingError",
]
