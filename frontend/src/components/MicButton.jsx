import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import MicIcon from "@mui/icons-material/Mic";
import { speech } from "../utils/utils.jsx";
import "./MicButton.css";

const MicButton = ({ onIntroComplete = false }) => {
  const navigate = useNavigate();
  const [isListening, setIsListening] = useState(false);
  const [statusText, setStatusText] = useState("Say a command...");

  const recognitionRef = useRef(null);
  const isMountedRef = useRef(true);

  // Initialize SpeechRecognition once
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition API is not supported in this browser.");
      setStatusText("Voice commands not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.isActive = false;

    recognition.onstart = () => {
      recognition.isActive = true;
      setIsListening(true);
      setStatusText("Listening...");
    };

    recognition.onresult = (event) => {
      const transcriptRaw =
        event.results[event.results.length - 1][0].transcript.trim();
      const transcript = transcriptRaw.toLowerCase();
      console.log("Home voice command received:", transcriptRaw);

      let handled = false;

      // Navigation commands (same style as ImageDetection)
      if (
        transcript.includes("switch to") ||
        transcript.includes("open") ||
        transcript.includes("go to") ||
        transcript.includes("i want to use")
      ) {
        if (transcript.includes("object")) {
          speech("Navigating to Object Detection");
          navigate("/image/object");
          handled = true;
        } else if (
          transcript.includes("currency") ||
          transcript.includes("money")
        ) {
          speech("Navigating to Currency Detection");
          navigate("/image/currency");
          handled = true;
        } else if (
          transcript.includes("barcode") ||
          transcript.includes("product")
        ) {
          speech("Navigating to Barcode Scanning");
          navigate("/image/barcode");
          handled = true;
        } else if (
          transcript.includes("text") ||
          transcript.includes("document")
        ) {
          speech("Navigating to Text Recognition");
          navigate("/image/text");
          handled = true;
        } else if (transcript.includes("news")) {
          speech("Navigating to News");
          navigate("/news");
          handled = true;
        } else if (
          transcript.includes("chatbot") ||
          transcript.includes("chat bot") ||
          transcript.includes("chat")
        ) {
          speech("Navigating to Chatbot");
          navigate("/chatbot");
          handled = true;
        } else if (
          transcript.includes("navigation") ||
          transcript.includes("navigate")
        ) {
          speech("Navigating to Outdoor Navigation");
          navigate("/navigation");
          handled = true;
        } else if (transcript.includes("music")) {
          speech("Navigating to Music Detection");
          navigate("/music");
          handled = true;
        } else if (
          transcript.includes("home") ||
          transcript.includes("homepage") ||
          transcript.includes("main menu") ||
          transcript.includes("main screen")
        ) {
          speech("You are already on the Home page");
          handled = true;
        }
      }

      if (!handled) {
        setStatusText(`Heard: "${transcriptRaw}"`);
        speech(
          "Sorry, I didn't understand. Try saying: Open Object Detection oror Go to News"
        );
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error (Home):", event.error);
      recognition.isActive = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log("Home voice recognition ended");
      recognition.isActive = false;
      setIsListening(false);
      if (isMountedRef.current) {
        setStatusText("Say a command...");
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isMountedRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onstart = null;
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {
          console.log("Error stopping Home recognition:", e);
        }
      }
    };
  }, [navigate]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || recognitionRef.current.isActive) return;

    try {
      // Stop any ongoing TTS (intro, etc.) before listening
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      recognitionRef.current.start();
    } catch (e) {
      console.error("Failed to start Home voice recognition:", e);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !recognitionRef.current.isActive) return;
    try {
      recognitionRef.current.stop();
    } catch (e) {
      console.error("Failed to stop Home voice recognition:", e);
    }
  }, []);

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Auto-start after intro is complete (if desired)
  useEffect(() => {
    if (!onIntroComplete) return;

    const timer = setTimeout(() => {
      startListening();
    }, 2000);

    return () => clearTimeout(timer);
  }, [onIntroComplete, startListening]);

  // Space key toggles mic; also cancels any current TTS
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTypingElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isTypingElement) return;

      if (event.code === "Space" || event.key === " ") {
        event.preventDefault();
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        handleMicClick();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleMicClick]);

  return (
    <div className="mic-container">
      <div className={`mic-glow ${isListening ? "active" : ""}`}></div>
      
      <button 
        className={`mic-button ${isListening ? "listening" : ""}`}
        onClick={handleMicClick}
        aria-label={isListening ? "Stop listening" : "Start voice command"}
      >
        <MicIcon className="mic-icon" />
      </button>

      <div className="waveform-container">
        {/* Simple 5-bar animation based on listening state */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div 
            key={i}
            className="waveform-bar"
            style={{ 
              height: `${isListening ? 28 : 8}px`,
              opacity: isListening ? 1 : 0.3,
            }}
          />
        ))}
      </div>

      <p className="mic-status">{statusText}</p>
    </div>
  );
};

export default MicButton;
