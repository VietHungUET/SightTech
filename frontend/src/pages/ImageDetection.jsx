import WebCam from "../components/WebCam.jsx";
import "./ImageDetection.css";
import { IconButton, Tooltip } from "@mui/material";
import {
  KeyboardVoice,
  PhotoCamera,
  StopCircle,
  CameraAlt,
  Article,
  MonetizationOn,
  QrCodeScanner
} from "@mui/icons-material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import userAPI, { API_BASE_URL } from "../utils/userAPI.jsx";
import { dataURLtoBlob, speech } from "../utils/utils.jsx";

// Map URL mode to detection type
const modeToType = {
  object: "Object",
  text: "Text",
  currency: "Currency",
  barcode: "Barcode"
};

const typeToMode = {
  Object: "object",
  Text: "text",
  Currency: "currency",
  Barcode: "barcode"
};

export default function ImageDetection() {
  const { mode } = useParams();
  const navigate = useNavigate();

  const webcamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const lastScannedTime = useRef(0);
  const isProcessingRef = useRef(false);
  const isVoiceActiveRef = useRef(false);

  // Initialize detection type from URL parameter
  const initialType = mode && modeToType[mode.toLowerCase()] ? modeToType[mode.toLowerCase()] : "Object";
  const [detectionType, setDetectionType] = useState(initialType);
  const [reply, setReply] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync detection type with URL parameter
  useEffect(() => {
    if (mode && modeToType[mode.toLowerCase()]) {
      const newType = modeToType[mode.toLowerCase()];
      if (newType !== detectionType) {
        setDetectionType(newType);
        setReply("");
        speech(`Switched to ${newType} detection`);
      }
    }
  }, [mode]);

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
        speech("Screenshot captured. Processing barcode.");
      } else {
        speech("Screenshot captured. Processing now.");
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
            speech("No text detected.");
            setReply("No text detected.");
            break;
          }
          speech(`Detected text: ${text}`);
          setReply(text);
          break;
        }
        case "Currency": {
          try {
            const currencyResult = await userAPI.postCurrencyDetection(formData);
            const totalMoney = currencyResult?.data?.total_money;
            const detectionsList = currencyResult?.data?.detections || [];

            let detailedMessage = "";

            if (totalMoney === 0 || detectionsList.length === 0) {
              detailedMessage = "No currency detected. Try better lighting or adjust the banknote.";
            } else {
              const counts = {};
              detectionsList.forEach((d) => {
                const denom = d.class;
                counts[denom] = (counts[denom] || 0) + 1;
              });

              const denomParts = [];
              Object.keys(counts)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .forEach((denom) => {
                  const count = counts[denom];
                  const formattedDenom = parseInt(denom).toLocaleString();
                  if (count === 1) {
                    denomParts.push(`one ${formattedDenom} VND banknote`);
                  } else {
                    denomParts.push(`${count} ${formattedDenom} VND banknotes`);
                  }
                });

              detailedMessage = `Detected: ${denomParts.join(", ")}. Total: ${totalMoney.toLocaleString()} VND.`;
            }

            speech(detailedMessage);
            setReply(detailedMessage);
          } catch (error) {
            console.error("Currency detection error:", error);
            const errorMsg = error.response?.data?.detail || "Currency detection failed. Please check your internet connection.";
            speech(errorMsg);
            setReply(errorMsg);
          }
          break;
        }
        case "Barcode": {
          formData.append("trigger", triggerSource === "voice" ? "voice-command" : "snapshot");
          const barcodeResult = await userAPI.postBarcodeScan(formData);
          const data = barcodeResult?.data ?? {};
          const speechText = data.speech_text || data.message || "Barcode scan completed.";
          setReply(data.message || speechText);

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
        case "Object": {
          try {
            const captionResult = await userAPI.postImageCaptioning(formData);
            const data = captionResult?.data ?? {};
            const caption = data.text || "No description available.";
            setReply(caption);
            speech(caption);
          } catch (error) {
            console.error("Object detection error:", error);
            const errorMsg = error.response?.data?.detail || "Object detection failed. Please try again.";
            speech(errorMsg);
            setReply(errorMsg);
          }
          break;
        }
        default: {
          speech("This detection mode is not implemented yet.");
          setReply("This detection mode is not implemented yet.");
          break;
        }
      }
    } catch (error) {
      console.error("Capture error", error);
      speech("An error occurred while processing the image.");
      setReply("An error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [detectionType, isProcessing]);

  useEffect(() => {
    speech("Image detection ready. Use the list to switch modes or give a voice command.");
  }, []);

  useEffect(() => {
    setReply("");
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
    isVoiceActiveRef.current = false;
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      isVoiceActiveRef.current = true;
      setIsRecording(true);
      await speech("Listening for command. Say 'Take snapshot' to capture the current frame.");

      if (!isVoiceActiveRef.current) return;

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
    } catch (error) {
      console.error("Microphone access error", error);
      speech("Unable to access the microphone. Please check permissions.");
      setIsRecording(false);
      isVoiceActiveRef.current = false;
    }
  }, [sendAudioCommand]);

  const handleVoiceToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const replyMessage = reply || (isProcessing ? "Processing..." : "Ready when you are.");

  return (
    <main
      className="image-detection-container"
      aria-label="Image detection workspace"
    >
      {/* Main Content Area */}
      <div className="main-content">
        {/* Camera Section */}
        <section
          className="camera-section"
          aria-label="Camera preview and controls"
        >
          {/* Mode indicator */}
          <div className="current-mode-indicator">
            <span className="mode-icon-display">
              {detectionType === "Object" && <CameraAlt />}
              {detectionType === "Text" && <Article />}
              {detectionType === "Currency" && <MonetizationOn />}
              {detectionType === "Barcode" && <QrCodeScanner />}
            </span>
            <span className="mode-text">{detectionType} Detection</span>
          </div>

          <div className="camera-wrapper" role="presentation">
            <WebCam ref={webcamRef}>
              <canvas ref={canvasRef} className="overlay-canvas" />
            </WebCam>
          </div>

          {/* Action Buttons Below Camera */}
          <div
            className="controls-panel"
            role="group"
            aria-label="Image capture controls"
          >
            <Tooltip title={isProcessing ? "Processing..." : "Take Snapshot"} arrow>
              <span>
                <IconButton
                  className={`action-icon-btn capture-btn ${isProcessing ? 'processing' : ''}`}
                  onClick={() => capture("manual")}
                  disabled={isProcessing}
                  aria-label={isProcessing ? "Processing image, please wait" : "Take snapshot"}
                  aria-busy={isProcessing}
                  size="large"
                >
                  <PhotoCamera />
                </IconButton>
              </span>
            </Tooltip>
            <span className="btn-label">Snapshot</span>

            <Tooltip title={isRecording ? "Stop Listening" : "Voice Command"} arrow>
              <IconButton
                className={`action-icon-btn voice-btn ${isRecording ? 'active' : ''}`}
                onClick={handleVoiceToggle}
                aria-label={isRecording ? "Stop listening" : "Start voice command"}
                aria-pressed={isRecording}
                size="large"
              >
                {isRecording ? <StopCircle /> : <KeyboardVoice />}
              </IconButton>
            </Tooltip>
            <span className="btn-label">Voice</span>
          </div>
        </section>

        {/* Output Section */}
        <aside
          className="output-section"
          aria-label="Detection results"
        >
          <div className="output-header">
            <span className="output-title">Results</span>
            <span className="mode-badge">{detectionType}</span>
          </div>
          <output
            id="detection-response"
            className="output-content"
            role="status"
            aria-live="assertive"
            aria-atomic="true"
          >
            {replyMessage}
          </output>
        </aside>
      </div>
    </main>
  );
}