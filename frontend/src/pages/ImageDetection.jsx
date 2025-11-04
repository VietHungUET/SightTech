import WebCam from "../components/WebCam.jsx";
import ImageDetectionOptions from "../components/ImageDetectionOptions.jsx";
import "./ImageDetection.css"

export default function ImageDetection() {
    return (
        <div className="image-detection-container">
            <ImageDetectionOptions/>
            <WebCam></WebCam>
            <div className="command-box"></div>
            <div className="reply-box"></div>
        </div>

    )
}
