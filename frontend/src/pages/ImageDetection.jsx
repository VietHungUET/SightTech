import WebCam from "../components/WebCam.jsx";
import "./ImageDetection.css";
import { IconButton, Tooltip, Chip } from "@mui/material";
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
  const canvasRef = useRef(null);
  const lastScannedTime = useRef(0);
  const isProcessingRef = useRef(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const recognitionRef = useRef(null);
  const isMountedRef = useRef(true);
  const restartTimeoutRef = useRef(null);
  const isSpeakingRef = useRef(false);

  // Initialize detection type from URL parameter
  const initialType = mode && modeToType[mode.toLowerCase()] ? modeToType[mode.toLowerCase()] : "Object";
  const [detectionType, setDetectionType] = useState(initialType);
  const [reply, setReply] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [realtimeDescription, setRealtimeDescription] = useState("");
  const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false);

  // Voice Recognition Helper Functions
  const startVoiceRecognition = useCallback(() => {
    if (!recognitionRef.current || recognitionRef.current.isActive || !isMountedRef.current || isSpeakingRef.current) return;

    try {
      recognitionRef.current.start();
      recognitionRef.current.isActive = true;
      setIsVoiceCommandActive(true);
      console.log('Voice recognition started');
    } catch (e) {
      if (e.name === 'InvalidStateError') {
        recognitionRef.current.isActive = true;
        setIsVoiceCommandActive(true);
      }
    }
  }, []);

  const stopVoiceRecognition = useCallback(() => {
    if (!recognitionRef.current || !recognitionRef.current.isActive) return;

    try {
      recognitionRef.current.stop();
      recognitionRef.current.isActive = false;
      setIsVoiceCommandActive(false);
    } catch (e) {
      console.error('Failed to stop voice recognition:', e);
    }
  }, []);

  const speakWithPause = useCallback(async (text) => {
    isSpeakingRef.current = true;
    stopVoiceRecognition();

    try {
      await speech(text);
    } catch (error) {
      console.error('Speech error:', error);
    } finally {
      setTimeout(() => {
        isSpeakingRef.current = false;
        if (isMountedRef.current) {
          startVoiceRecognition();
        }
      }, 500);
    }
  }, [startVoiceRecognition, stopVoiceRecognition]);

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
          
          let displayText = "";
          let speechContent = "";
          
          if (data.status === "success" && data.product) {
            const product = data.product;
            const lines = [];
            
            if (product.brand) {
              lines.push(`${product.name} - ${product.brand}`);
              speechContent = `This is ${product.name} by ${product.brand}.`;
            } else {
              lines.push(product.name);
              speechContent = `This is ${product.name}.`;
            }
            
            if (product.type) {
              lines.push(`Type: ${product.type}`);
            }
            
            if (product.nutrition) {
              lines.push("");
              lines.push("Nutrition Facts:");
              const n = product.nutrition;
              if (n.energy_kcal) lines.push(`Energy: ${parseFloat(n.energy_kcal).toFixed(1)} kcal/100g`);
              if (n.proteins) lines.push(`Protein: ${parseFloat(n.proteins).toFixed(1)} g/100g`);
              if (n.carbohydrates) lines.push(`Carbs: ${parseFloat(n.carbohydrates).toFixed(1)} g/100g`);
              if (n.fat) lines.push(`Fat: ${parseFloat(n.fat).toFixed(1)} g/100g`);
              
              speechContent += ` Nutrition facts: Energy ${parseFloat(n.energy_kcal || 0).toFixed(0)} kilocalories, Protein ${parseFloat(n.proteins || 0).toFixed(1)} grams, Carbs ${parseFloat(n.carbohydrates || 0).toFixed(1)} grams, Fat ${parseFloat(n.fat || 0).toFixed(1)} grams per 100 grams.`;
            }
            
            displayText = lines.join("\n");
          } else if (data.status === "partial") {
            displayText = "Barcode detected but product not found in database.";
            speechContent = displayText;
          } else {
            displayText = "No barcode detected. Please try again with better lighting.";
            speechContent = displayText;
          }
          
          setReply(displayText);
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

  // Initialize Voice Recognition on mount
  useEffect(() => {
    isMountedRef.current = true;
    const introduction = `Image detection ready. Current mode: ${detectionType}. Say 'take snapshot' to capture, or 'switch to' followed by object, currency, barcode, or text to change modes.`;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.isActive = false;

      recognition.onresult = (event) => {
        if (isSpeakingRef.current) {
          console.log('Ignoring voice command while speaking');
          return;
        }

        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        console.log('Voice command received:', transcript);

        let commandRecognized = false;

        // Capture commands
        if (transcript.includes('take snapshot') || 
            transcript.includes('capture') || 
            transcript.includes('take picture') ||
            transcript.includes('take photo') ||
            transcript.includes('snap')) {
          console.log('Capture command detected');
          if (!isProcessingRef.current) {
            speakWithPause('Taking snapshot');
            capture("voice");
          }
          commandRecognized = true;
        }
        // Switch mode commands
        else if (transcript.includes('switch to') || transcript.includes('open') || transcript.includes('go to') || transcript.includes('i want to use')) {
          if (transcript.includes('object')) {
            navigate('/image/object');
            commandRecognized = true;
          } else if (transcript.includes('currency') || transcript.includes('money')) {
            navigate('/image/currency');
            commandRecognized = true;
          } else if (transcript.includes('barcode') || transcript.includes('product')) {
            navigate('/image/barcode');
            commandRecognized = true;
          } else if (transcript.includes('text') || transcript.includes('document')) {
            navigate('/image/text');
            commandRecognized = true;
          } else if (transcript.includes('news')) {
            navigate('/news');
            commandRecognized = true;
          } else if (transcript.includes('chatbot') || transcript.includes('chat bot') || transcript.includes('chat')) {
            navigate('/chatbot');
            commandRecognized = true;
          } else if (transcript.includes('navigation') || transcript.includes('navigate')) {
            navigate('/navigation');
            commandRecognized = true;
          } else if (transcript.includes('music')) {
            navigate('/music');
            commandRecognized = true;
          }
        }
        // Real-time control (Object mode only)
        else if (detectionType === "Object") {
          // Start real-time commands
          if ((transcript.includes('start') || 
               transcript.includes('play') || 
               transcript.includes('begin') || 
               transcript.includes('launch') || 
               transcript.includes('activate') || 
               transcript.includes('turn on') || 
               transcript.includes('enable')) && 
              (transcript.includes('real') || 
               transcript.includes('live') || 
               transcript.includes('realtime') || 
               transcript.includes('real-time') || 
               transcript.includes('real time') || 
               transcript.includes('continuous') || 
               transcript.includes('stream'))) {
            console.log('Start real-time command detected');
            if (!isRealtimeActive) {
              speakWithPause('Starting real-time description');
              handleRealtimeToggle();
            }
            commandRecognized = true;
          } 
          // Stop real-time commands
          else if ((transcript.includes('stop') || 
                    transcript.includes('pause') || 
                    transcript.includes('end') || 
                    transcript.includes('halt') || 
                    transcript.includes('deactivate') || 
                    transcript.includes('turn off') || 
                    transcript.includes('disable') || 
                    transcript.includes('cancel')) && 
                   (transcript.includes('real') || 
                    transcript.includes('live') || 
                    transcript.includes('realtime') || 
                    transcript.includes('real-time') || 
                    transcript.includes('real time') || 
                    transcript.includes('continuous') || 
                    transcript.includes('stream'))) {
            console.log('Stop real-time command detected');
            if (isRealtimeActive) {
              speakWithPause('Stopping real-time description');
              handleRealtimeToggle();
            }
            commandRecognized = true;
          }
        }

        // If no command was recognized
        if (!commandRecognized) {
          console.log('Command not recognized:', transcript);
          speakWithPause("Sorry, I don't understand");
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        recognition.isActive = false;
        setIsVoiceCommandActive(false);

        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }

        if (event.error === 'aborted' || event.error === 'audio-capture' || !isMountedRef.current) {
          return;
        }

        restartTimeoutRef.current = setTimeout(() => {
          if (!recognition.isActive && isMountedRef.current) {
            startVoiceRecognition();
          }
        }, 1000);
      };

      recognition.onend = () => {
        console.log('Voice recognition ended');
        recognition.isActive = false;
        setIsVoiceCommandActive(false);

        if (restartTimeoutRef.current) {
          clearTimeout(restartTimeoutRef.current);
        }

        if (!isMountedRef.current) {
          return;
        }

        restartTimeoutRef.current = setTimeout(() => {
          if (!recognition.isActive && isMountedRef.current) {
            startVoiceRecognition();
          }
        }, 5000);
      };

      recognition.onstart = () => {
        recognition.isActive = true;
        setIsVoiceCommandActive(true);
      };

      recognitionRef.current = recognition;

      // Start voice recognition after a longer delay to avoid picking up system speech
      setTimeout(() => {
        isSpeakingRef.current = false;
        startVoiceRecognition();
      }, 3000);
    } else {
      // No speech when SpeechRecognition not supported
    }

    return () => {
      console.log('Component unmounting, cleaning up...');
      isMountedRef.current = false;

      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onstart = null;
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {
          console.log('Error stopping recognition:', e);
        }
      }

      setIsVoiceCommandActive(false);
    };
  }, [detectionType, startVoiceRecognition, speakWithPause, navigate, isRealtimeActive, handleRealtimeToggle, capture]);

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
              <Tooltip title={isVoiceCommandActive ? "Voice recognition active" : "Click to start voice recognition"} arrow>
                <IconButton
                  className={`action-icon-btn voice-btn ${isVoiceCommandActive ? 'active' : ''}`}
                  disabled={isVoiceCommandActive}
                  onClick={() => {
                    if (!isVoiceCommandActive) {
                      // Clear any pending restart timeout
                      if (restartTimeoutRef.current) {
                        clearTimeout(restartTimeoutRef.current);
                        restartTimeoutRef.current = null;
                      }
                      // Start voice recognition immediately
                      startVoiceRecognition();
                    }
                  }}
                  aria-label={isVoiceCommandActive ? "Voice command active" : "Click to activate voice command"}
                  size="large"
                >
                  {isVoiceCommandActive ? <StopCircle /> : <KeyboardVoice />}
                </IconButton>
              </Tooltip>
              <span className="btn-label">
                {isProcessing ? "Processing" : (isVoiceCommandActive ? "Listening" : "Voice")}
              </span>
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
          </output>
        </aside>
      </div>
    </main>
  );
}