import {useCallback, useEffect, useRef, useState} from "react";
import MicNoneIcon from "@mui/icons-material/MicNone";
import {speech} from "../utils/utils.jsx";
import userAPI from "../utils/userAPI.jsx";
import "./Home.css";

const INTRO_MESSAGE =
  "Hello and welcome to SightTech! SightTech is an AI-powered application designed to assist visually impaired users with various tasks including object detection, currency recognition, music identification, and more. Would you like me to walk you through the main features? Please say yes or no.";

const GUIDE_MESSAGE =
  "Great! Here is your SightTech tour. First, open Image Detection to point your camera and hear real-time descriptions of objects, scenes, or text. Inside that workspace you can also switch to Currency Detection to recognize Vietnamese banknotes and hear their values, or Barcode mode to identify packaged products. Next, head to Music Detection so SightTech can listen for a few seconds and speak back the song title, artist, and album. The Chatbot is always ready for questions, while the News area summarizes and reads important articles aloud. At any moment you can press the Voice Command buttons in each feature to control SightTech hands-free.";

const ENJOY_MESSAGE =
  "Alright! Feel free to explore SightTech on your own. Select any feature from the navigation bar whenever you're ready, and tap the guide button or use your voice if you would like assistance later.";

const YES_KEYWORDS = [
  "yes",
  "yeah",
  "yep",
  "sure",
  "please",
  "guide",
  "có",
  "co",
  "oke",
  "ok",
  "đồng ý",
  "dong y",
];

const NO_KEYWORDS = ["no", "nope", "nah", "later", "không", "khong", "maybe"];

export default function Home() {
  const [statusText, setStatusText] = useState("Introducing SightTech...");
  const [userChoice, setUserChoice] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [micError, setMicError] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    speech(INTRO_MESSAGE);

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const updateSpeech = useCallback((message, status) => {
    if (status) {
      setStatusText(status);
    }
    speech(message);
  }, []);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  const handleChoice = useCallback(
    (decision) => {
      stopListening();
      setUserChoice(decision);
      if (decision === "yes") {
        updateSpeech(GUIDE_MESSAGE, "Sharing the onboarding guide.");
      } else {
        updateSpeech(ENJOY_MESSAGE, "Enjoy exploring SightTech!");
      }
    },
    [stopListening, updateSpeech],
  );

  const interpretTranscript = useCallback(
    (text) => {
      const normalized = text?.trim() ?? "";
      setTranscript(normalized);
      if (!normalized) {
        setStatusText("I could not catch that. Please try again.");
        speech("I did not catch that. Could you say yes or no?");
        return;
      }

      const lowered = normalized.toLowerCase();
      if (YES_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
        handleChoice("yes");
        return;
      }

      if (NO_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
        handleChoice("no");
        return;
      }

      setStatusText(`I heard "${normalized}", but I need a clear yes or no.`);
      speech("I heard you, but I still need a clear yes or no.");
    },
    [handleChoice],
  );

  const sendForTranscription = useCallback(
    async (audioBlob) => {
      const formData = new FormData();
      formData.append("file", audioBlob, "onboarding-response.webm");
      try {
        const response = await userAPI.transcribeOnboarding(formData);
        interpretTranscript(response.data?.transcript || "");
      } catch (error) {
        console.error("Transcription error", error);
        setStatusText("Unable to process the recording.");
        speech("I could not process that recording. Please try again.");
      }
    },
    [interpretTranscript],
  );

  const startListening = useCallback(async () => {
    try {
      setMicError(false);
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, {mimeType: "audio/webm"});
      audioChunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        const audioBlob = new Blob(audioChunksRef.current, {type: "audio/webm"});
        audioChunksRef.current = [];
        setIsListening(false);

        if (audioBlob.size > 0) {
          await sendForTranscription(audioBlob);
        } else {
          setStatusText("No audio detected. Try speaking again.");
          speech("I did not detect any audio. Please try again.");
        }
      });

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
      setStatusText("Listening for a yes or no...");
      speech(
        "I'm listening. Please say yes if you want guidance or no if you'd like to explore alone.",
      );
    } catch (error) {
      console.error("Microphone access error", error);
      setStatusText("Unable to access the microphone.");
      speech("I could not access your microphone. Please check permissions.");
      stopListening();
      setMicError(true);
    }
  }, [sendForTranscription, stopListening]);

  useEffect(() => {
    if (!userChoice && !isListening && !micError) {
      const timer = setTimeout(() => {
        startListening();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isListening, userChoice, micError, startListening]);

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="hero-content">
          <p className="hero-eyebrow">Welcome to SightTech</p>
          <h1>
            <span>Illuminating Your World with AI</span>
          </h1>
          <p className="hero-description">
            SightTech is an AI-powered application designed to assist visually
            impaired users with real-time object detection, currency recognition,
            music identification, article summaries, and more. Let&apos;s get you
            started.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="choice-button primary"
              onClick={() => handleChoice("yes")}
            >
              Yes, guide me
            </button>
            <button
              type="button"
              className="choice-button secondary"
              onClick={() => handleChoice("no")}
            >
              No, I&apos;ll explore
            </button>
          </div>
          <p className="hero-note">
            Prefer speaking? I&apos;m already listening—just say “yes” or “no”.
          </p>
          <div className="status-pill" aria-live="polite">
            <span
              className={`status-indicator ${
                userChoice === "yes"
                  ? "positive"
                  : userChoice === "no"
                    ? "neutral"
                    : ""
              }`}
            />
            {statusText}
          </div>

          <div
            className={`listening-indicator ${isListening ? "active" : ""}`}
            aria-live="polite"
          >
            <div className="listening-icon">
              <span className="listening-ring ring-outer" />
              <span className="listening-ring ring-middle" />
              <span className="listening-ring ring-inner" />
              <span className="listening-core">
                <MicNoneIcon fontSize="large" />
              </span>
            </div>
            <p className="listening-text">
              {isListening
                ? "Listening for your answer..."
                : transcript
                  ? `I heard: "${transcript}".`
                  : micError
                    ? "Microphone unavailable. Please check permissions."
                    : "I’ll listen again in a moment."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
