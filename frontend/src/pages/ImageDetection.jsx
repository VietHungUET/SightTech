import WebCam from "../components/WebCam.jsx";
import ImageDetectionOptions from "../components/ImageDetectionOptions.jsx";
import ProductInfoCard from "../components/ProductInfoCard.jsx";
import "./ImageDetection.css";
import { Button } from "@mui/material";
import { KeyboardVoice, PhotoCamera, StopCircle } from "@mui/icons-material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import userAPI, { API_BASE_URL } from "../utils/userAPI.jsx";
import { dataURLtoBlob, speech } from "../utils/utils.jsx";

export default function ImageDetection() {
    const webcamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const canvasRef = useRef(null);
    const lastScannedTime = useRef(0);
    const isProcessingRef = useRef(false);

    const [detectionType, setDetectionType] = useState("Object");
    const [reply, setReply] = useState("");
    const [productInfo, setProductInfo] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const capture = useCallback(async (triggerSource = "manual") => {
        if (isProcessing) {
            speech("A previous request is still processing. Please wait a moment.");
            return;
        }

        const webcam = webcamRef.current;
        const imageSrc = webcam?.getScreenshot();

        if (!imageSrc) {
            speech("Unable to capture image from the camera. Please try again.");
            return;
        }

        setIsProcessing(true);
        setReply("");
        if (triggerSource !== "auto") {
            if (detectionType === "Barcode") {
                speech("Screenshot captured, processing the barcode.");
            } else {
                speech("Screenshot captured, processing.");
            }
        }

        const blob = dataURLtoBlob(imageSrc);
        const file = new File([blob], "screenshot.jpg", { type: blob.type });
        const formData = new FormData();
        formData.append("file", file);

        try {
            switch (detectionType) {
                case "Text": {
                    const textResult = await userAPI.postDocumentRecognition(formData);
                    const text = textResult?.data?.text;
                    if (!text) {
                        speech("Failed to recognize text from the image.");
                        setReply("Unable to detect text.");
                        break;
                    }
                    speech(`The detected text is ${text}`);
                    setReply(text);
                    setProductInfo(null);
                    break;
                }
                case "Currency": {
                    const currencyResult = await userAPI.postCurrencyDetection(formData);
                    const description = currencyResult?.data?.text;
                    if (!description) {
                        speech("Failed to recognize currency information.");
                        setReply("Unable to detect currency.");
                        break;
                    }
                    speech(description);
                    setReply(description);
                    setProductInfo(null);
                    break;
                }
                case "Barcode": {
                    formData.append("trigger", triggerSource === "voice" ? "voice-command" : "snapshot");
                    const barcodeResult = await userAPI.postBarcodeScan(formData);
                    const data = barcodeResult?.data ?? {};
                    const speechText = data.speech_text || data.message || "Barcode scan completed.";
                    setReply(data.message || speechText);
                    setProductInfo(data.product || null);

                    if (data.audio_url) {
                        const audio = new Audio(`${API_BASE_URL}${data.audio_url}`);
                        audio.play().catch(() => {
                            speech(speechText);
                        });
                    } else {
                        speech(speechText);
                    }
                    break;
                }
                default: {
                    speech("Object detection is not implemented yet.");
                    setReply("Object detection is not implemented yet.");
                    setProductInfo(null);
                    break;
                }
            }
        } catch (error) {
            console.error("Capture error", error);
            speech("An error occurred while processing the image.");
            setReply("An error occurred. Please try again.");
            setProductInfo(null);
        } finally {
            setIsProcessing(false);
        }
    }, [detectionType, isProcessing]);

    useEffect(() => {
        const introduction = (
            "This is the Image Detection mode. You are currently in object detection and can switch to text, " +
            "currency, or barcode detection options."
        );
        speech(introduction);
    }, []);

    useEffect(() => {
        setReply("");
        setProductInfo(null);
    }, [detectionType]);

    useEffect(() => {
        isProcessingRef.current = isProcessing;
    }, [isProcessing]);

    useEffect(() => {
        let animationFrameId;
        let barcodeDetector;

        const detect = async () => {
            if (detectionType !== "Barcode") return;

            if (webcamRef.current && webcamRef.current.video && canvasRef.current) {
                const video = webcamRef.current.video;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext("2d");

                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;

                    try {
                        const barcodes = await barcodeDetector.detect(video);
                        ctx.clearRect(0, 0, canvas.width, canvas.height);

                        if (barcodes.length > 0) {
                            barcodes.forEach(barcode => {
                                const { x, y, width, height } = barcode.boundingBox;
                                ctx.strokeStyle = "red";
                                ctx.lineWidth = 4;
                                ctx.strokeRect(x, y, width, height);
                            });

                            const now = Date.now();
                            if (!isProcessingRef.current && (now - lastScannedTime.current > 3000)) {
                                lastScannedTime.current = now;
                                capture("auto");
                            }
                        }
                    } catch (err) {
                        console.error("Barcode detection failed:", err);
                    }
                }
            }
            animationFrameId = requestAnimationFrame(detect);
        };

        if (detectionType === "Barcode") {
            if ("BarcodeDetector" in window) {
                barcodeDetector = new window.BarcodeDetector({
                    formats: ["qr_code", "ean_13", "ean_8", "code_128", "upc_a", "upc_e"]
                });
                detect();
            } else {
                console.warn("BarcodeDetector is not supported in this browser.");
                speech("Barcode detection is not supported in this browser.");
            }
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext("2d");
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
        };
    }, [detectionType, capture]);



    const processVoiceCommand = useCallback(async (commandData) => {
        if (!commandData) {
            speech("I could not understand the command.");
            return;
        }

        const transcriptText = commandData?.transcript?.transcript;
        if (transcriptText) {
            setReply(transcriptText);
        }

        if (commandData.intent === "action" && commandData.command === "Capture") {
            speech("Capture command received.");
            await capture("voice");
            return;
        }

        if (transcriptText) {
            speech(`You said: ${transcriptText}.`);
        } else {
            speech("Command received but no actionable task was detected.");
        }
    }, [capture]);

    const sendAudioCommand = useCallback(async (audioBlob) => {
        const formData = new FormData();
        const featureKey = detectionType === "Barcode" ? "Product" : detectionType;
        formData.append("file", audioBlob, "command.webm");
        formData.append("current_feature", featureKey);

        try {
            const response = await userAPI.postVoiceCommand(formData);
            await processVoiceCommand(response.data);
        } catch (error) {
            console.error("Voice command error", error);
            speech("Sorry, I was not able to process that voice command.");
        }
    }, [detectionType, processVoiceCommand]);

    const stopRecording = useCallback(() => {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }
        setIsRecording(false);
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            audioChunksRef.current = [];

            recorder.addEventListener("dataavailable", (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            });

            recorder.addEventListener("stop", async () => {
                stream.getTracks().forEach((track) => track.stop());
                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                audioChunksRef.current = [];

                if (audioBlob.size > 0) {
                    await sendAudioCommand(audioBlob);
                }
            });

            recorder.start();
            mediaRecorderRef.current = recorder;
            setIsRecording(true);
            speech("Listening for the command. Say take snapshot to capture the current frame.");
        } catch (error) {
            console.error("Microphone access error", error);
            speech("Unable to access the microphone. Please check permissions.");
        }
    }, [sendAudioCommand]);

    const handleVoiceToggle = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    return (
        <div className="image-detection-container">
            <aside className="options-panel">
                <ImageDetectionOptions setDetectionType={setDetectionType} />
            </aside>

            <section className="preview-panel">
                <div className="controls-panel">
                    <Button
                        variant="contained"
                        onClick={() => capture("manual")}
                        startIcon={<PhotoCamera />}
                        disabled={isProcessing}
                    >
                        {isProcessing ? "Processing..." : "Take Screenshot"}
                    </Button>
                    <Button
                        variant={isRecording ? "contained" : "outlined"}
                        color={isRecording ? "error" : "primary"}
                        onClick={handleVoiceToggle}
                        startIcon={isRecording ? <StopCircle /> : <KeyboardVoice />}
                    >
                        {isRecording ? "Stop Listening" : "Voice Command"}
                    </Button>
                    {isRecording && <span className="voice-status">Listening...</span>}
                </div>
                <div className="camera-wrapper">
                    <WebCam ref={webcamRef}>
                        <canvas ref={canvasRef} className="overlay-canvas" />
                    </WebCam>
                </div>
            </section>

            <section className="feedback-panel">
                <div className="reply-box" aria-live="polite">
                    {reply || (isProcessing ? "Processing..." : "Ready when you are.")}
                </div>
                {productInfo && <ProductInfoCard product={productInfo} />}
            </section>
        </div>
    );
}
