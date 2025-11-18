import WebCam from "../components/WebCam.jsx";
import ImageDetectionOptions from "../components/ImageDetectionOptions.jsx";
import "./ImageDetection.css"
import {Button} from "@mui/material";
import React, {useCallback, useRef, useState} from "react";
import userAPI from "../utils/userAPI.jsx";
import {dataURLtoBlob} from "../utils/utils.jsx";

export default function ImageDetection() {
    const webcamRef = useRef(null);
    const [detectionType, setDetectionType] = useState("Object");
    const [command, setCommand] = useState("");
    const [reply, setReply] = useState("");

    const capture = useCallback(async () => {
        const imageSrc = webcamRef.current.getScreenshot();

        if (!imageSrc) {
            return;
        }

        const blob = dataURLtoBlob(imageSrc);
        const file = new File([blob], "screenshot.jpg", { type: blob.type });
        const imageData = new FormData();
        imageData.append("file", file);

        console.log(detectionType);

        switch (detectionType) {
            case "Object":
                break;

            case "Text":
                const result = await userAPI.postDocumentRecognition(imageData);
                console.log(result.data.text);
                setReply(result.data.text);
                break;

            case "Currency":
                break;

            case "Barcode":
                break;

            default:
                break;
        }

    }, [detectionType]);

    return (
        <div className="image-detection-container">
            <ImageDetectionOptions setDetectionType={setDetectionType} />
            <Button variant="contained"
                onClick={capture}>
                Take Screenshot
            </Button>
            <WebCam ref={webcamRef}></WebCam>
            <div className="command-box"></div>
            <div className="reply-box">{reply}</div>
        </div>
    )
}
