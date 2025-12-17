import WebCam from "../components/WebCam.jsx";
import ProductInfoCard from "../components/ProductInfoCard.jsx";
import "./ImageDetection.css";
import { IconButton, Tooltip } from "@mui/material";
import {
  KeyboardVoice,
  PhotoCamera,
  StopCircle,
  CameraAlt,
  Article,
  MonetizationOn,
  QrCodeScanner,
  PlayArrow,
  Stop
} from "@mui/icons-material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import userAPI, { API_BASE_URL, WS_BASE_URL } from "../utils/userAPI.jsx";
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

  const isProcessingRef = useRef(false);
  const isVoiceActiveRef = useRef(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const frameIntervalRef = useRef(null);

  // Initialize detection type from URL parameter
  const initialType = mode && modeToType[mode.toLowerCase()] ? modeToType[mode.toLowerCase()] : "Object";
  const [detectionType, setDetectionType] = useState(initialType);
  const [reply, setReply] = useState("");
  const [productInfo, setProductInfo] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [realtimeDescription, setRealtimeDescription] = useState("");

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
  }, [mode, detectionType]);

  // Send frames to backend via WebSocket
  const sendFrameToBackend = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const webcam = webcamRef.current;
    const imageSrc = webcam?.getScreenshot();

    if (!imageSrc) {
      console.warn("[Real-time] Could not capture frame");
      return;
    }

    try {
      // Send base64 image to backend
      // Extract base64 data (remove data:image/jpeg;base64, prefix)
      const base64Data = imageSrc.split(',')[1];

      wsRef.current.send(JSON.stringify({
        type: "frame",
        data: base64Data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error("[Real-time] Failed to send frame:", error);
    }
  }, []);

  // WebSocket connection for real-time object detection
  const connectWebSocket = useCallback(() => {
    if (detectionType !== "Object" || !isRealtimeActive) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      console.log("[WebSocket] Connecting to real-time description service...");
      const ws = new WebSocket(`${WS_BASE_URL}/ws/realtime-description`);

      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully");
        setRealtimeDescription("Real-time description active. Analyzing scene...");

        // Start sending frames every 3 seconds
        frameIntervalRef.current = setInterval(() => {
          sendFrameToBackend();
        }, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "description") {
            const description = data.text || data.description;
            console.log("[WebSocket] Received description:", description);
            setRealtimeDescription(description);
            setReply(description);
            // Speak the description every time
            speech(description);
          } else if (data.type === "error") {
            console.error("[WebSocket] Error:", data.message);
            setRealtimeDescription(`Error: ${data.message}`);
          } else if (data.type === "status") {
            console.log("[WebSocket] Status:", data.message);
          }
        } catch (err) {
          console.error("[WebSocket] Failed to parse message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Connection error:", error);
        setRealtimeDescription("Connection error occurred");
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Connection closed:", event.code, event.reason);
        wsRef.current = null;

        // Stop sending frames
        if (frameIntervalRef.current) {
          clearInterval(frameIntervalRef.current);
          frameIntervalRef.current = null;
        }

        // Show disconnection message only if it was unexpected
        if (event.code !== 1000 && isRealtimeActive) {
          setRealtimeDescription("Connection lost. Please restart real-time mode.");
          setIsRealtimeActive(false);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
      setRealtimeDescription("Failed to connect to service");
      setIsRealtimeActive(false);
    }
  }, [detectionType, isRealtimeActive, sendFrameToBackend]);

  // Start real-time description
  const startRealtimeDescription = useCallback(async () => {
    try {
      setIsRealtimeActive(true);
      setRealtimeDescription("Starting real-time description...");
      speech("Starting real-time scene description");

      // Connect WebSocket (no need to start backend camera)
      connectWebSocket();
    } catch (error) {
      console.error("[Real-time] Failed to start:", error);
      speech("Failed to start real-time description");
      setRealtimeDescription("Failed to start service");
      setIsRealtimeActive(false);
    }
  }, [connectWebSocket]);

  // Stop real-time description
  const stopRealtimeDescription = useCallback(async () => {
    try {
      setIsRealtimeActive(false);
      speech("Stopping real-time description");

      // Stop sending frames FIRST
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }

      // Clear reconnect timeout (if any)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Close WebSocket with normal closure code
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "User stopped real-time mode");
        wsRef.current = null;
      }

      setRealtimeDescription("");
      setReply("");
    } catch (error) {
      console.error("[Real-time] Failed to stop:", error);
    }
  }, []);

  // Toggle real-time description
  const handleRealtimeToggle = useCallback(() => {
    if (isRealtimeActive) {
      stopRealtimeDescription();
    } else {
      startRealtimeDescription();
    }
  }, [isRealtimeActive, startRealtimeDescription, stopRealtimeDescription]);

  // Connect WebSocket when real-time becomes active
  useEffect(() => {
    if (isRealtimeActive && detectionType === "Object") {
      connectWebSocket();
    } else {
      // Clean up when deactivating
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    }

    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isRealtimeActive, detectionType, connectWebSocket]);

  // Stop real-time when switching away from Object mode
  useEffect(() => {
    if (detectionType !== "Object" && isRealtimeActive) {
      stopRealtimeDescription();
    }
  }, [detectionType, isRealtimeActive, stopRealtimeDescription]);

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

          let speechContent = "";

          if (data.status === "success" && data.product) {
            const product = data.product;

            // Format nutrition data for display
            const formattedProduct = { ...product };
            if (product.nutrition) {
              const n = product.nutrition;
              const formattedNutrition = {};
              if (n.energy_kcal) formattedNutrition["Energy"] = `${parseFloat(n.energy_kcal).toFixed(1)} kcal/100g`;
              if (n.proteins) formattedNutrition["Protein"] = `${parseFloat(n.proteins).toFixed(1)} g/100g`;
              if (n.carbohydrates) formattedNutrition["Carbs"] = `${parseFloat(n.carbohydrates).toFixed(1)} g/100g`;
              if (n.fat) formattedNutrition["Fat"] = `${parseFloat(n.fat).toFixed(1)} g/100g`;

              // Add any other fields that might be present
              Object.keys(n).forEach(key => {
                if (!['energy_kcal', 'proteins', 'carbohydrates', 'fat'].includes(key)) {
                  formattedNutrition[key] = n[key];
                }
              });
              formattedProduct.nutrition = formattedNutrition;
            }

            setProductInfo(formattedProduct);
            setReply(""); // Clear text reply as we show the card

            if (product.brand) {
              speechContent = `This is ${product.name} by ${product.brand}.`;
            } else {
              speechContent = `This is ${product.name}.`;
            }

            if (product.nutrition) {
              const n = product.nutrition;
              speechContent += ` Nutrition facts: Energy ${parseFloat(n.energy_kcal || 0).toFixed(0)} kilocalories, Protein ${parseFloat(n.proteins || 0).toFixed(1)} grams, Carbs ${parseFloat(n.carbohydrates || 0).toFixed(1)} grams, Fat ${parseFloat(n.fat || 0).toFixed(1)} grams per 100 grams.`;
            }
          } else if (data.status === "partial") {
            const msg = "Barcode detected but product not found in database.";
            setReply(msg);
            setProductInfo(null);
            speechContent = msg;
          } else {
            const msg = "No barcode detected. Please try again with better lighting.";
            setReply(msg);
            setProductInfo(null);
            speechContent = msg;
          }

          speech(speechContent);
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
    setRealtimeDescription("");
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
        console.warn("BarcodeDetector API not supported - real-time detection disabled, Snapshot still works.");
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

  const replyMessage = realtimeDescription || reply || (isProcessing ? "Processing..." : "Ready when you are.");



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
            <div className="btn-wrapper">
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
            </div>

            {/* Real-time toggle button (Object mode only) */}
            {detectionType === "Object" && (
              <div className="btn-wrapper">
                <Tooltip title={isRealtimeActive ? "Stop Real-time" : "Start Real-time"} arrow>
                  <IconButton
                    className={`action-icon-btn realtime-btn ${isRealtimeActive ? 'active' : ''}`}
                    onClick={handleRealtimeToggle}
                    aria-label={isRealtimeActive ? "Stop real-time description" : "Start real-time description"}
                    aria-pressed={isRealtimeActive}
                    size="large"
                  >
                    {isRealtimeActive ? <Stop /> : <PlayArrow />}
                  </IconButton>
                </Tooltip>
                <span className="btn-label">Real-time</span>
              </div>
            )}

            <div className="btn-wrapper">
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
          </div>
        </section>

        {/* Output Section */}
        <aside
          className="output-section"
          aria-label="Detection results"
        >
          <div className="output-header">
            <span className="output-title">Results</span>
            <span className="mode-badge">
              {detectionType}
              {detectionType === "Object" && isRealtimeActive && " (Live)"}
            </span>
          </div>
          <output
            id="detection-response"
            className="output-content"
            role="status"
            aria-live="assertive"
            aria-atomic="true"
          >
            {replyMessage}
            {productInfo && (
              <div className="product-info-section">
                <ProductInfoCard product={productInfo} />
              </div>
            )}
          </output>
        </aside>
      </div>
    </main>
  );
}