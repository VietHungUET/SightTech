import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MicIcon from "@mui/icons-material/Mic";
import userAPI from "../utils/userAPI";
import { speech, isSpeaking } from "../utils/utils.jsx";
import "./MicButton.css";

// VAD Constants
const CYCLE_DURATION = 6000; // 5 seconds recording cycle
const DECIBEL_THRESHOLD = 10; // Minimum decibel to detect sound (noise rejection)
const SPEECH_MIN_DURATION = 500; // Minimum 500ms for valid speech
const TTS_DEBOUNCE_DELAY = 1000; // Wait 1.5s after TTS before resuming cycles

// Route mapping for navigation
// Keys MUST match backend's FEATURE_NAMES keys (Object, Currency, Music, etc.)
const ROUTE_MAP = {
  Object: "/image/object",
  Currency: "/image/currency",
  News: "/news",
  Chatbot: "/chatbot",
  Music: "/music",
  Text: "/image/text",
  Product: "/image/barcode", // Barcode scanning (Product recognition)
  Distance: "/image/object", // Distance estimation (use object detection)
  Face: "/image/object", // Face recognition (use object detection)
};

const FEATURE_SPEECH = {
  Object: "Navigating to Object Detection",
  Currency: "Navigating to Currency Detection",
  News: "Navigating to News",
  Chatbot: "Navigating to Chatbot",
  Music: "Navigating to Music Detection",
  Text: "Navigating to Text Recognition",
  Product: "Navigating to Barcode Scanning",
  Distance: "Navigating to Distance Estimation",
  Face: "Navigating to Face Recognition",
};

const MicButton = ({ onIntroComplete = false }) => {
  const navigate = useNavigate();
  const [isListening, setIsListening] = useState(false);
  const [audioLevels, setAudioLevels] = useState([0, 0, 0, 0, 0]);
  const [statusText, setStatusText] = useState("Say a command...");
  const [currentDecibel, setCurrentDecibel] = useState(0);
  
  // Audio refs
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  
  // VAD Refs
  const animationFrameRef = useRef(null);
  const cycleIntervalRef = useRef(null);
  const speechStartTimeRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const maxDecibelRef = useRef(0);
  const isActiveRef = useRef(false);
  const errorResetTimeoutRef = useRef(null);
  const consecutiveSilenceFramesRef = useRef(0); // Track consecutive silent frames
  const isTTSSpeakingRef = useRef(false); // Track if TTS is currently speaking
  const ttsDebounceTimeoutRef = useRef(null); // Debounce after TTS ends

  // Helper function to set status with auto-reset for errors
  const setStatusWithReset = useCallback((text, isError = false) => {
    if (errorResetTimeoutRef.current) {
      clearTimeout(errorResetTimeoutRef.current);
    }
    
    setStatusText(text);
    
    if (isError) {
      errorResetTimeoutRef.current = setTimeout(() => {
        if (isActiveRef.current) {
          setStatusText("Listening...");
        } else {
          setStatusText("Say a command...");
        }
      }, 10000);
    }
  }, []);

  // Calculate decibel level from audio data
  const calculateDecibel = useCallback((dataArray) => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = dataArray[i] - 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(100, rms * 10);
  }, []);

  // VAD Analysis - runs every frame (~60fps)
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isActiveRef.current) return;

    // Get time domain data for decibel calculation
    const timeDomainData = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(timeDomainData);

    // Calculate decibel level
    const decibelLevel = calculateDecibel(timeDomainData);
    setCurrentDecibel(decibelLevel);

    // Track max decibel in current cycle
    if (decibelLevel > maxDecibelRef.current) {
      maxDecibelRef.current = decibelLevel;
    }

    // VAD Logic: Detect speech with hysteresis (more stable)
    if (decibelLevel > DECIBEL_THRESHOLD) {
      consecutiveSilenceFramesRef.current = 0; // Reset silence counter
      
      if (!speechStartTimeRef.current) {
        speechStartTimeRef.current = Date.now();
        console.log("🎤 Speech start detected, dB:", decibelLevel.toFixed(2));
      } else if (Date.now() - speechStartTimeRef.current > SPEECH_MIN_DURATION) {
        if (!speechDetectedRef.current) {
          speechDetectedRef.current = true;
          console.log("✅ Speech confirmed! Duration:", Date.now() - speechStartTimeRef.current, "ms");
        }
      }
    } else {
      // Only reset after 3 consecutive silent frames (more stable)
      consecutiveSilenceFramesRef.current++;
      
      if (consecutiveSilenceFramesRef.current >= 3) {
        if (speechStartTimeRef.current) {
          console.log("🔇 Speech ended (below threshold for 3 frames)");
        }
        speechStartTimeRef.current = null;
        consecutiveSilenceFramesRef.current = 0;
      }
    }

    // Get frequency data for visualization
    const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(freqData);

    // Calculate levels for 5 bars
    const levels = [];
    const segmentSize = Math.floor(freqData.length / 5);
    for (let i = 0; i < 5; i++) {
      const start = i * segmentSize;
      const end = start + segmentSize;
      const segment = freqData.slice(start, end);
      const avg = segment.reduce((a, b) => a + b, 0) / segment.length;
      levels.push(avg / 255);
    }
    setAudioLevels(levels);

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [calculateDecibel]);

  // Process voice command
  const processVoiceCommand = useCallback(async (audioBlob) => {
    setStatusText("Processing...");
    
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");

      const response = await userAPI.postVoiceCommand(formData);
      const data = response.data;

      console.log("🎯 Voice command response:", data);

      const transcriptText = data.transcript?.transcript || "";
      
      if (!transcriptText) {
        setStatusWithReset("No speech detected", true);
        return;
      }

      setStatusText(`Heard: "${transcriptText}"`);

      // Homepage only handles NAVIGATION intent
      // Response: { intent: "navigate", command: "ObjectDetection", ... }
      if (data.intent === "navigate" && data.command) {
        const targetFeature = data.command; // e.g., "ObjectDetection", "News", "MusicDetection"
        const route = ROUTE_MAP[targetFeature];
        const speechText = FEATURE_SPEECH[targetFeature];
        
        if (route) {
          console.log(`✅ Navigate: ${targetFeature} → ${route}`);
          
          // Pause recording during TTS to prevent feedback
          isTTSSpeakingRef.current = true;
          
          speech(speechText || `Navigating to ${targetFeature}`);
          
          // Resume after navigation
          setTimeout(() => {
            navigate(route);
            // TTS will finish, allow debounce before resuming
            if (ttsDebounceTimeoutRef.current) {
              clearTimeout(ttsDebounceTimeoutRef.current);
            }
            ttsDebounceTimeoutRef.current = setTimeout(() => {
              isTTSSpeakingRef.current = false;
              console.log("🔊 TTS finished, resuming cycles");
            }, TTS_DEBOUNCE_DELAY);
          }, 1500);
          return;
        } else {
          console.warn(`⚠️ Unknown feature: ${targetFeature}`);
        }
      }

      // Not a navigation command
      console.log("❌ Not a navigation command");
      setStatusWithReset("Try: 'Open Object Detection' or 'Go to News'", true);
      
      // Pause during error TTS
      isTTSSpeakingRef.current = true;
      speech("Please say a navigation command like 'Open Object Detection' or 'Go to News'.");
      
      // Resume after error message
      if (ttsDebounceTimeoutRef.current) {
        clearTimeout(ttsDebounceTimeoutRef.current);
      }
      ttsDebounceTimeoutRef.current = setTimeout(() => {
        isTTSSpeakingRef.current = false;
        console.log("🔊 Error TTS finished, resuming cycles");
      }, TTS_DEBOUNCE_DELAY);

    } catch (error) {
      console.error("❌ Error processing voice command:", error);
      setStatusWithReset("Error processing command", true);
    }
  }, [navigate, setStatusWithReset]);

  // Start a new recording cycle
  const startNewCycle = useCallback(() => {
    if (!streamRef.current || !isActiveRef.current) return;

    // Reset VAD state for new cycle
    speechStartTimeRef.current = null;
    speechDetectedRef.current = false;
    maxDecibelRef.current = 0;
    chunksRef.current = [];
    consecutiveSilenceFramesRef.current = 0;

    // Create new MediaRecorder
    mediaRecorderRef.current = new MediaRecorder(streamRef.current, {
      mimeType: "audio/webm"
    });

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
        console.log("📊 Audio chunk received:", e.data.size, "bytes, total chunks:", chunksRef.current.length);
      }
    };

    // Start recording with timeslice to ensure data is collected
    mediaRecorderRef.current.start(1000); // Collect data every 1 second
    console.log("🔴 New recording cycle started at", new Date().toLocaleTimeString());
  }, []);

  // End cycle and check conditions
  const endCycleAndCheck = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      console.log("⚠️ MediaRecorder is inactive, skipping cycle check");
      return;
    }

    // Check conditions before sending
    const shouldSend =
      speechDetectedRef.current &&
      maxDecibelRef.current > DECIBEL_THRESHOLD &&
      !isSpeaking() &&
      isActiveRef.current &&
      chunksRef.current.length > 0;

    console.log("🔍 Cycle end check:", {
      speechDetected: speechDetectedRef.current,
      maxDecibel: maxDecibelRef.current.toFixed(2),
      threshold: DECIBEL_THRESHOLD,
      isSpeaking: isSpeaking(),
      isActive: isActiveRef.current,
      hasChunks: chunksRef.current.length > 0,
      chunkCount: chunksRef.current.length,
      shouldSend: shouldSend ? "✅ YES" : "❌ NO"
    });

    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        if (shouldSend) {
          console.log("📤 Sending audio to server...");
          const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
          console.log("📦 Audio blob size:", audioBlob.size, "bytes");
          await processVoiceCommand(audioBlob);
        } else {
          console.log("⏭️ Cycle skipped - conditions not met");
        }
        resolve();
      };

      mediaRecorderRef.current.stop();
    });
  }, [processVoiceCommand]);

  // Main cycle loop
  const runCycleLoop = useCallback(async () => {
    if (!isActiveRef.current) return;

    // Skip cycle if TTS is speaking (prevent feedback loop)
    if (isTTSSpeakingRef.current) {
      console.log("⏸️ Cycle paused - TTS is speaking");
      return;
    }

    await endCycleAndCheck();

    // Restart if still active and TTS not speaking
    if (isActiveRef.current && !isTTSSpeakingRef.current) {
      startNewCycle();
    }
  }, [endCycleAndCheck, startNewCycle]);

  // Initialize and start cyclic recording
  const startListening = useCallback(async () => {
    if (isActiveRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      isActiveRef.current = true;
      setIsListening(true);
      setStatusText("Listening...");

      // Start VAD analysis
      analyzeAudio();

      // Start first cycle
      startNewCycle();

      // Setup cycle interval
      cycleIntervalRef.current = setInterval(runCycleLoop, CYCLE_DURATION);

      console.log("Cyclic recording system started");
    } catch (error) {
      console.error("Error starting listening:", error);
      setStatusWithReset("Microphone access denied", true);
      speech("Microphone access denied. Please allow microphone access.");
    }
  }, [analyzeAudio, startNewCycle, runCycleLoop, setStatusWithReset]);

  // Stop all recording
  const stopListening = useCallback(() => {
    console.log("Stopping listening system");

    isActiveRef.current = false;
    setIsListening(false);
    setAudioLevels([0, 0, 0, 0, 0]);
    setCurrentDecibel(0);

    if (cycleIntervalRef.current) {
      clearInterval(cycleIntervalRef.current);
      cycleIntervalRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setStatusText("Say a command...");
  }, []);

  // Auto-start when mounted
  useEffect(() => {
    if (!onIntroComplete) return;

    const startTimer = setTimeout(() => {
      startListening();
    }, 2000);

    return () => {
      clearTimeout(startTimer);
    };
  }, [onIntroComplete, startListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      if (errorResetTimeoutRef.current) {
        clearTimeout(errorResetTimeoutRef.current);
      }
      if (ttsDebounceTimeoutRef.current) {
        clearTimeout(ttsDebounceTimeoutRef.current);
      }
    };
  }, [stopListening]);

  // Manual mic click handler
  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="mic-container">
      {/* Glow effect behind mic */}
      <div className={`mic-glow ${isListening ? 'active' : ''}`}></div>
      
      {/* Main mic button */}
      <button 
        className={`mic-button ${isListening ? 'listening' : ''}`}
        onClick={handleMicClick}
        aria-label={isListening ? "Stop listening" : "Start voice command"}
      >
        <MicIcon className="mic-icon" />
      </button>

      {/* Audio waveform visualization */}
      <div className="waveform-container">
        {audioLevels.map((level, index) => (
          <div 
            key={index}
            className="waveform-bar"
            style={{ 
              height: `${Math.max(4, level * 40)}px`,
              opacity: isListening ? 1 : 0.3
            }}
          />
        ))}
      </div>

      {/* Status text */}
      <p className={`mic-status ${statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('denied') ? 'error' : ''}`}>
        {statusText}
      </p>
    </div>
  );
};

export default MicButton;
