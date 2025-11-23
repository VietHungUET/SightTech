import WebCam from "../components/WebCam.jsx";
import ImageDetectionOptions from "../components/ImageDetectionOptions.jsx";
import "./ImageDetection.css"
import {Button} from "@mui/material";
import React, {useCallback, useEffect, useRef, useState} from "react";
import userAPI from "../utils/userAPI.jsx";
import {dataURLtoBlob, speech} from "../utils/utils.jsx";

export default function ImageDetection() {
    const webcamRef = useRef(null);
    const [detectionType, setDetectionType] = useState("Object");
    const [command, setCommand] = useState("");
    const [reply, setReply] = useState("");

    const introduction = "This is the Image Detection mode, " +
        "you are currently in object detection option and can switch to text, currency or barcode detection options"
    useEffect(() => {
        speech(introduction);
    }, [])

    const capture = useCallback(async () => {
        const imageSrc = webcamRef.current.getScreenshot();

        if (!imageSrc) {
            return;
        }

        speech("Screenshot captured, processing")

        const blob = dataURLtoBlob(imageSrc);
        const file = new File([blob], "screenshot.jpg", { type: blob.type });
        const imageData = new FormData();
        imageData.append("file", file);

        console.log(detectionType, imageData);

        switch (detectionType) {
            case "Object":
                break;

            case "Text":
                try {
                    const textResult = await userAPI.postDocumentRecognition(imageData);
                    if (!textResult) {
                        speech("Failed to recognize text data.");
                    }
                    //console.log(result.data.text);
                    setTimeout(() => {speech("The text detected is" + textResult.data.text)}, 1000);
                    setReply(textResult.data.text);
                } catch (error) {
                    speech("Error occurred when recognizing image data.");
                }
                break;

            case "Currency":
                try {
                    const currencyResult = await userAPI.postCurrencyDetection(imageData);
                    if (!currencyResult) {
                        speech("Failed to recognize currency.");
                    }
                    setTimeout(() => {speech(currencyResult.data.text)}, 1000)
                    setReply(currencyResult.data.text);
                } catch (error) {
                    speech("Error occurred when recognizing image data.")
                }
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
