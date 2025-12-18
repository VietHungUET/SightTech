import React, { useCallback, useEffect, useRef, useState } from "react";
import { IconButton, Tooltip } from "@mui/material";
import { KeyboardVoice, StopCircle, Explore, PlayArrow, Stop } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

import WebCam from "../components/WebCam.jsx";
import TurnArrow from "../components/TurnArrow.jsx";
import { speech } from "../utils/utils.jsx";
import "./OutdoorNavigation.css";

const WS_BASE_URL = "ws://localhost:8000";

// Toggle between webcam and test video - comment/uncomment to switch
// const USE_TEST_VIDEO = false;
const USE_TEST_VIDEO = true; // Uncomment this line and comment above to use test video

export default function OutdoorNavigation() {
  const navigate = useNavigate();
  const lastSpokenGuidanceRef = useRef("");
  const navigationStartTimeRef = useRef(null);
  const webcamRef = useRef(null);
  const wsRef = useRef(null);
  const recognitionRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const noSpeechTimeoutRef = useRef(null);
  const hasReceivedResultRef = useRef(false);
  const frameSendIntervalRef = useRef(null);
  const videoRef = useRef(null);

  const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [navigationData, setNavigationData] = useState({
    sidewalk: null,
    turn: null,
    guidance: "Ready to navigate"
  });
  const [wsStatus, setWsStatus] = useState("disconnected");

  const startSendingFrames = useCallback((ws) => {
    if (frameSendIntervalRef.current) {
      clearInterval(frameSendIntervalRef.current);
    }

    frameSendIntervalRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN && !isProcessing) {
        let imageSrc = null;
        
        if (USE_TEST_VIDEO && videoRef.current) {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);
          imageSrc = canvas.toDataURL('image/jpeg', 0.8);
        } else if (webcamRef.current) {
          imageSrc = webcamRef.current.getScreenshot();
        }
        
        if (imageSrc) {
          const base64Data = imageSrc.split(',')[1] || imageSrc;
          setIsProcessing(true);
          ws.send(JSON.stringify({
            type: "frame",
            data: base64Data,
            timestamp: Date.now()
          }));
        }
      }
    }, 200); // 5 FPS for better responsiveness
  }, [isProcessing]);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE_URL}/ws/outdoor-navigation`);

    ws.onopen = () => {
      setWsStatus("connected");
      setIsNavigating(true);
      navigationStartTimeRef.current = Date.now(); // Track navigation start time
      setNavigationData({ sidewalk: null, turn: null, guidance: "Navigation active. Analyzing environment..." });
      speech("Navigation system connected");
      startSendingFrames(ws);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "navigation_update") {
          setIsProcessing(false);
          setNavigationData({ sidewalk: data.sidewalk, turn: data.turn, guidance: data.guidance });
          
          if (data.guidance && data.guidance !== lastSpokenGuidanceRef.current) {
            // Skip speech for "Caution: No sidewalk detected" in first 5 seconds
            const timeSinceStart = Date.now() - (navigationStartTimeRef.current || 0);
            const shouldSkip = timeSinceStart < 5000 && 
                             data.guidance.toLowerCase().includes("caution: no sidewalk detected");
            
            if (!shouldSkip) {
              speech(data.guidance);
              lastSpokenGuidanceRef.current = data.guidance;
            }
          }
        } else if (data.type === "status" || data.type === "error") {
          setIsProcessing(false);
          if (data.type === "error") {
            setNavigationData(prev => ({ ...prev, guidance: `Error: ${data.message}` }));
          }
        }
      } catch (error) {
        setIsProcessing(false);
      }
    };

    ws.onerror = () => {
      setWsStatus("error");
      setNavigationData({ sidewalk: null, turn: null, guidance: "Connection error occurred" });
      speech("Navigation connection error");
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      if (frameSendIntervalRef.current) {
        clearInterval(frameSendIntervalRef.current);
        frameSendIntervalRef.current = null;
      }
      
      if (event.code !== 1000 && isNavigating) {
        setWsStatus("error");
        setNavigationData({ sidewalk: null, turn: null, guidance: "Connection lost. Please restart." });
        setIsNavigating(false);
      } else {
        setWsStatus("disconnected");
        setIsNavigating(false);
      }
    };

    wsRef.current = ws;
  }, [isNavigating, startSendingFrames]);

  const disconnectWebSocket = useCallback(() => {
    if (frameSendIntervalRef.current) {
      clearInterval(frameSendIntervalRef.current);
      frameSendIntervalRef.current = null;
    }
    setIsProcessing(false);
    navigationStartTimeRef.current = null; // Reset start time
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, "User stopped navigation");
      wsRef.current = null;
    }
    
    setWsStatus("disconnected");
    setIsNavigating(false);
    setNavigationData({ sidewalk: null, turn: null, guidance: "Navigation stopped" });
    speech("Navigation stopped");
  }, []);

  const startNavigation = useCallback(() => {
    if (wsStatus !== "connected") connectWebSocket();
    speech("Starting navigation");
  }, [wsStatus, connectWebSocket]);

  const stopNavigation = useCallback(() => {
    disconnectWebSocket();
  }, [disconnectWebSocket]);

  // Voice command (push-to-talk) using SpeechRecognition
  const stopVoiceRecognition = useCallback(() => {
    if (noSpeechTimeoutRef.current) {
      clearTimeout(noSpeechTimeoutRef.current);
      noSpeechTimeoutRef.current = null;
    }

    if (!recognitionRef.current || !recognitionRef.current.isActive) return;

    try {
      recognitionRef.current.stop();
      recognitionRef.current.isActive = false;
      setIsVoiceCommandActive(false);
      console.log("OutdoorNavigation voice recognition stopped");
    } catch (e) {
      console.error("Failed to stop voice recognition:", e);
    }
  }, []);

  const startVoiceRecognition = useCallback(() => {
    if (!recognitionRef.current || recognitionRef.current.isActive || !isMountedRef.current) {
      return;
    }

    try {
      // Stop any ongoing speech guidance so mic can listen
      window.speechSynthesis?.cancel();

      hasReceivedResultRef.current = false;

      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
      }

      recognitionRef.current.start();
      recognitionRef.current.isActive = true;
      setIsVoiceCommandActive(true);
      speech("Listening for commandss");
      console.log("OutdoorNavigation voice recognition started ");

      // Auto-stop if user doesn't say anything within 5 seconds
      noSpeechTimeoutRef.current = setTimeout(() => {
        if (!hasReceivedResultRef.current && recognitionRef.current?.isActive) {
          console.log("No speech detected, stopping OutdoorNavigation mic");
          stopVoiceRecognition();
        }
      }, 5000);
    } catch (e) {
      if (e.name === "InvalidStateError") {
        recognitionRef.current.isActive = true;
        setIsVoiceCommandActive(true);
      } else {
        console.error("Failed to start voice recognition:", e);
      }
    }
  }, [stopVoiceRecognition]);

  const toggleVoiceCommand = useCallback(() => {
    if (isVoiceCommandActive) {
      stopVoiceRecognition();
    } else {
      startVoiceRecognition();
    }
  }, [isVoiceCommandActive, startVoiceRecognition, stopVoiceRecognition]);

  const handleNavigationToggle = useCallback(() => {
    isNavigating ? stopNavigation() : startNavigation();
  }, [isNavigating, startNavigation, stopNavigation]);

  // Initialize SpeechRecognition and voice commands
  useEffect(() => {
    isMountedRef.current = true;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.isActive = false;

      recognition.onstart = () => {
        recognition.isActive = true;
        setIsVoiceCommandActive(true);
      };

      recognition.onresult = (event) => {
        hasReceivedResultRef.current = true;

        const transcriptRaw = event.results[event.results.length - 1][0].transcript.trim();
        const transcript = transcriptRaw.toLowerCase();
        console.log("OutdoorNavigation voice command received:", transcriptRaw);

        let handled = false;

        // Navigation controls
        if (
          transcript.includes("start navigation") ||
          transcript.includes("begin navigation") ||
          transcript.includes("start guiding") ||
          transcript.includes("start guidance") ||
          transcript.includes("start navigate")
        ) {
          if (!isNavigating) {
            startNavigation();
          }
          handled = true;
        } else if (
          transcript.includes("stop navigation") ||
          transcript.includes("end navigation") ||
          transcript.includes("stop guiding") ||
          transcript.includes("stop guidance") ||
          transcript.includes("stop navigate")
        ) {
          if (isNavigating) {
            stopNavigation();
          }
          handled = true;
        }

        // Cross-feature navigation (same set as Image Detection)
        if (
          transcript.includes("switch to") ||
          transcript.includes("open") ||
          transcript.includes("go to") ||
          transcript.includes("i want to use")
        ) {
          if (transcript.includes("object")) {
            navigate("/image/object");
            handled = true;
          } else if (transcript.includes("currency") || transcript.includes("money")) {
            navigate("/image/currency");
            handled = true;
          } else if (transcript.includes("barcode") || transcript.includes("product")) {
            navigate("/image/barcode");
            handled = true;
          } else if (transcript.includes("text") || transcript.includes("document")) {
            navigate("/image/text");
            handled = true;
          } else if (transcript.includes("news")) {
            navigate("/news");
            handled = true;
          } else if (transcript.includes("chatbot") || transcript.includes("chat bot") || transcript.includes("chat")) {
            navigate("/chatbot");
            handled = true;
          } else if (transcript.includes("navigation") || transcript.includes("navigate")) {
            navigate("/navigation");
            handled = true;
          } else if (transcript.includes("music")) {
            navigate("/music");
            handled = true;
          } else if (
            transcript.includes("home") ||
            transcript.includes("homepage") ||
            transcript.includes("main menu") ||
            transcript.includes("main screen")
          ) {
            navigate("/");
            handled = true;
          }
        }

        if (!handled) {
          speech("Sorry, I don't understand");
        }

        // After one command, stop mic (push-to-talk)
        stopVoiceRecognition();
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error (OutdoorNavigation):", event.error);
        recognition.isActive = false;
        setIsVoiceCommandActive(false);
      };

      recognition.onend = () => {
        console.log("OutdoorNavigation voice recognition ended");
        recognition.isActive = false;
        setIsVoiceCommandActive(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.warn("SpeechRecognition API is not supported in this browser.");
    }

    return () => {
      console.log("OutdoorNavigation unmounting, cleaning up voice recognition");
      isMountedRef.current = false;

      if (noSpeechTimeoutRef.current) {
        clearTimeout(noSpeechTimeoutRef.current);
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
          console.log("Error stopping OutdoorNavigation recognition:", e);
        }
      }

      setIsVoiceCommandActive(false);
    };
  }, [navigate, startNavigation, stopNavigation, stopVoiceRecognition]);
  useEffect(() => {
    speech("Outdoor navigation ready. Space to start.");
    return () => {
      disconnectWebSocket();
      window.speechSynthesis?.cancel();
    };
  }, [disconnectWebSocket]);

  useEffect(() => {
    if (USE_TEST_VIDEO && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Space key toggles voice command (push-to-talk), ignore when typing
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== "Space" && event.key !== " ") return;

      const target = event.target;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;

      event.preventDefault();
      // Khi bấm Space, dừng mọi TTS hiện tại rồi bật/tắt mic
      window.speechSynthesis?.cancel();
      toggleVoiceCommand();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleVoiceCommand]);

  const getPositionColor = () => {
    if (navigationData.sidewalk === 'Middle of Sidewalk') return '#32CD32';
    if (navigationData.sidewalk === 'Nothing Detected') return '#ff6b6b';
    return '#FFA500';
  };

  const getTurnColor = () => navigationData.turn === 'No Turn' ? '#32CD32' : '#1976d2';

  return (
    <main className="outdoor-navigation-container" aria-label="Outdoor navigation workspace">
      <div className="main-content">
        <section className="camera-section" aria-label="Navigation camera preview and controls">
          <div className="current-mode-indicator">
            <span className="mode-icon-display"><Explore /></span>
            <span className="mode-text">Outdoor Navigation</span>
            <span className={`status-badge ${wsStatus}`}>{wsStatus}</span>
          </div>

          <div className="camera-wrapper navigation-camera">
            {USE_TEST_VIDEO ? (
              <div className="video-container">
                <video ref={videoRef} src="/TurnSidewalk.mp4" loop muted playsInline className="test-video" />
              </div>
            ) : (
              <WebCam ref={webcamRef} />
            )}

            {/* Turn Arrow Overlay */}
            {isNavigating && navigationData.turn && (
              <div className="turn-arrow-overlay">
                {navigationData.turn === 'Left Turn' && (
                  <TurnArrow type="turnLeft" color="#1976d2" heading={0} tilt={65} size="normal" />
                )}
                {navigationData.turn === 'Right Turn' && (
                  <TurnArrow type="turnRight" color="#1976d2" heading={0} tilt={65} size="normal" />
                )}
                {navigationData.turn === 'No Turn' && navigationData.sidewalk === 'Middle of Sidewalk' && (
                  <TurnArrow type="straight" color="#32CD32" heading={0} tilt={65} size="normal" />
                )}
              </div>
            )}

            {/* Shift Arrow Overlays */}
            {isNavigating && navigationData.sidewalk === 'Left of Sidewalk' && (
              <div className="shift-arrow-overlay shift-left">
                <TurnArrow type="shiftRight" color="#FFA500" heading={0} tilt={60} size="small" />
              </div>
            )}
            {isNavigating && navigationData.sidewalk === 'Right of Sidewalk' && (
              <div className="shift-arrow-overlay shift-right">
                <TurnArrow type="shiftLeft" color="#FFA500" heading={0} tilt={60} size="small" />
              </div>
            )}
          </div>

          <div className="controls-panel" role="group" aria-label="Navigation controls">
            <div className="btn-wrapper">
              <Tooltip title={isNavigating ? "Stop Navigation" : "Start Navigation"} arrow>
                <IconButton
                  className={`action-icon-btn navigation-btn ${isNavigating ? 'active' : ''}`}
                  onClick={handleNavigationToggle}
                  disabled={wsStatus === "error"}
                  size="large"
                >
                  {isNavigating ? <Stop /> : <PlayArrow />}
                </IconButton>
              </Tooltip>
              <span className="btn-label">{isNavigating ? "Stop" : "Navigate"}</span>
            </div>

            <div className="btn-wrapper">
              <Tooltip title={isVoiceCommandActive ? "Stop Listening" : "Voice Command"} arrow>
                <IconButton
                  className={`action-icon-btn voice-btn ${isVoiceCommandActive ? 'active' : ''}`}
                  onClick={toggleVoiceCommand}
                  size="large"
                >
                  {isVoiceCommandActive ? <StopCircle /> : <KeyboardVoice />}
                </IconButton>
              </Tooltip>
              <span className="btn-label">Voice</span>
            </div>
          </div>
        </section>

        <aside className="output-section" aria-label="Navigation guidance">
          <div className="output-header">
            <span className="output-title">Navigation</span>
            <span className="mode-badge">{isNavigating ? "Active" : "Ready"}</span>
          </div>
          
          {isNavigating && (
            <div className="navigation-info">
              <div className="info-row">
                <span className="info-label">Position:</span>
                <span className="info-value" style={{ fontWeight: 'bold', color: getPositionColor() }}>
                  {navigationData.sidewalk || "Detecting..."}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Turn:</span>
                <span className="info-value" style={{ fontWeight: 'bold', color: getTurnColor() }}>
                  {navigationData.turn || "No Turn"}
                </span>
              </div>
            </div>
          )}

          <output id="navigation-guidance" className="output-content" role="status" aria-live="assertive">
            {navigationData.guidance}
          </output>
        </aside>
      </div>
    </main>
  );
}
