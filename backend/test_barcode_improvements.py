"""
Script để test các cải tiến trong barcode/QR code detection
"""
import sys
import base64
from pathlib import Path

# Thêm đường dẫn để import modules
sys.path.insert(0, str(Path(__file__).parent))

from app.services.barcode_scanning import BarcodeScannerService

def test_barcode_scanner():
    """Test barcode scanner với ảnh mẫu"""
    scanner = BarcodeScannerService()
    
    # Nếu bạn có ảnh test, thay thế đường dẫn này
    test_image_path = "debug_captures/capture_1763958767374.jpg"
    
    if Path(test_image_path).exists():
        with open(test_image_path, "rb") as f:
            image_bytes = f.read()
            base64_image = base64.b64encode(image_bytes).decode("utf-8")
        
        result = scanner.scan_base64(base64_image)
        
        print("=" * 60)
        print("BARCODE SCAN RESULT")
        print("=" * 60)
        print(f"Status: {result['status']}")
        print(f"Message: {result['message']}")
        print(f"Barcode: {result['barcode']}")
        print(f"Detections: {result['detections']}")
        if result['product']:
            print("\nProduct Info:")
            for key, value in result['product'].items():
                print(f"  {key}: {value}")
        print("=" * 60)
    else:
        print(f"Test image not found: {test_image_path}")

if __name__ == "__main__":
    test_barcode_scanner()
