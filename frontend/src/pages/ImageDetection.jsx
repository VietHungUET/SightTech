import WebCam from "../components/WebCam.jsx";
import ImageDetectionOptions from "../components/ImageDetectionOptions.jsx";
<<<<<<< HEAD
import "./ImageDetection.css";
import React, { useCallback, useRef, useState, useEffect } from "react";
import {
  Button,
  Card,
  CardContent,
  Typography,
  Container,
  Box,
  CircularProgress,
  IconButton,
  Divider,
  Paper,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import StopIcon from "@mui/icons-material/Stop";
import MoneyIcon from "@mui/icons-material/Money";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import userAPI from "../utils/userAPI.jsx";
import { dataURLtoBlob } from "../utils/utils.jsx";

export default function ImageDetection() {
  const webcamRef = useRef(null);
  const [detectionType, setDetectionType] = useState("Currency");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [detections, setDetections] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  // Load premium voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      const premiumVoices = voices.filter(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") ||
            v.name.includes("Enhanced") ||
            v.name.includes("Premium") ||
            v.localService === true)
      );

      let defaultVoice = voices.find(
        (v) => v.name === "Samantha" && v.lang === "en-US"
      );
      if (!defaultVoice)
        defaultVoice = voices.find((v) => v.name.includes("Samantha"));
      if (!defaultVoice) defaultVoice = premiumVoices[0];

      if (!selectedVoice && defaultVoice) {
        setSelectedVoice(defaultVoice);
      }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          capture();
          break;
        case "s":
          e.preventDefault();
          speechSynthesis.cancel();
          announce("Audio stopped");
          break;
        case "r":
          e.preventDefault();
          if (reply) announce(reply, true);
          break;
        case "h":
        case "?":
          e.preventDefault();
          setShowHelp(true);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      speechSynthesis.cancel();
    };
  }, [selectedVoice]);

  const announce = useCallback(
    (text, interrupt = false) => {
      if (interrupt && speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }
      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = 0.85;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;
      speechSynthesis.speak(utterance);
    },
    [selectedVoice]
  );

  const capture = useCallback(async () => {
    const imageSrc = webcamRef.current.getScreenshot();

    if (!imageSrc) {
      announce("Failed to capture image", true);
      return;
    }

    const blob = dataURLtoBlob(imageSrc);
    const file = new File([blob], "screenshot.jpg", { type: blob.type });
    const imageData = new FormData();
    imageData.append("file", file);

    setLoading(true);

    switch (detectionType) {
      case "Currency":
        try {
          announce("Analyzing currency, please wait...", true);

          const response = await userAPI.postCurrencyDetection(imageData);
          const totalMoney = response.data.total_money;
          const detectionsList = response.data.detections || [];

          setDetections(detectionsList);
          speechSynthesis.cancel();

          let detailedMessage = "";

          if (totalMoney === 0 || detectionsList.length === 0) {
            detailedMessage =
              "No currency detected. Try better lighting or position the banknote clearly.";
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
                  denomParts.push(`one ${formattedDenom} dong note`);
                } else {
                  denomParts.push(`${count} ${formattedDenom} dong notes`);
                }
              });

            detailedMessage = `Detected: ${denomParts.join(
              ", "
            )}. Total value: ${totalMoney.toLocaleString()} Vietnamese Dong.`;
          }

          setReply(detailedMessage);
          setTimeout(() => announce(detailedMessage, false), 200);
        } catch (error) {
          console.error("Currency detection error:", error);
          speechSynthesis.cancel();
          const errorMsg =
            error.response?.data?.detail ||
            "Failed to detect currency. Please ensure stable internet.";
          setReply(errorMsg);
          setTimeout(() => announce(errorMsg, false), 200);
=======
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
>>>>>>> origin/main
        }
        break;

<<<<<<< HEAD
      case "Text":
        try {
          announce("Recognizing text, please wait...", true);
          const result = await userAPI.postDocumentRecognition(imageData);
          const text = result.data.text || "No text detected.";
          setReply(text);
          setDetections([]);
          setTimeout(() => announce(text, false), 200);
        } catch (error) {
          const errorMsg = "Failed to recognize text.";
          setReply(errorMsg);
          setTimeout(() => announce(errorMsg, false), 200);
=======
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
>>>>>>> origin/main
        }
        break;

<<<<<<< HEAD
      case "Object":
      case "Barcode":
        const msg = `${detectionType} detection not yet implemented.`;
        setReply(msg);
        setDetections([]);
        setTimeout(() => announce(msg, false), 200);
        break;

      default:
        break;
    }

    setLoading(false);
  }, [detectionType, announce]);

  return (
    <div className="image-detection-container">
      {/* Help button - Fixed position */}
      <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 1000 }}>
        <IconButton
          onClick={() => setShowHelp(true)}
          aria-label="Show keyboard shortcuts (H key)"
          size="large"
          sx={{
            bgcolor: "primary.main",
            color: "white",
            "&:hover": { bgcolor: "primary.dark" },
          }}
        >
          <HelpOutlineIcon fontSize="large" />
        </IconButton>
      </Box>
      {/* Tabs on the left */}
      <div className="detection-tabs">
        <ImageDetectionOptions setDetectionType={setDetectionType} />
      </div>

      {/* Main content on the right */}
      <div className="detection-content">
        {detectionType === "Currency" ? (
          // Currency Detection - Enhanced Layout
          <Container maxWidth="lg" sx={{ px: 0 }}>
            <Card elevation={3} sx={{ mb: 3 }}>
              <CardContent>
                <Box
                  sx={{
                    position: "relative",
                    width: "100%",
                    borderRadius: 2,
                    overflow: "hidden",
                    bgcolor: "black",
                    mb: 2,
                  }}
                >
                  <WebCam ref={webcamRef} />
                </Box>

                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  onClick={capture}
                  disabled={loading}
                  tabIndex={0}
                  startIcon={
                    loading ? <CircularProgress size={24} /> : <CameraAltIcon />
                  }
                  aria-label="Capture currency image. Press Space key as shortcut"
                >
                  {loading ? "Analyzing..." : "Take Screenshot (Space)"}
                </Button>

                <Stack
                  direction="row"
                  spacing={1}
                  justifyContent="center"
                  sx={{ mt: 2 }}
                >
                  <IconButton
                    onClick={() => {
                      if (reply) announce(reply, true);
                    }}
                    disabled={!reply}
                    aria-label="Repeat last result. Press R key as shortcut"
                    title="Repeat (R)"
                  >
                    <VolumeUpIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => speechSynthesis.cancel()}
                    aria-label="Stop audio playback. Press S key as shortcut"
                    title="Stop (S)"
                  >
                    <StopIcon />
                  </IconButton>
                </Stack>
              </CardContent>
            </Card>

            {/* Results Section */}
            {reply && (
              <Card
                elevation={4}
                sx={{
                  bgcolor:
                    detections.length > 0 ? "success.main" : "warning.main",
                  color: "white",
                  mb: 2,
                }}
              >
                <CardContent>
                  <Stack
                    direction="row"
                    spacing={2}
                    alignItems="center"
                    sx={{ mb: 2 }}
                  >
                    <Typography
                      variant="h5"
                      component="h2"
                      sx={{ flex: 1, fontWeight: "bold" }}
                    >
                      Detection Result
                    </Typography>
                    <IconButton
                      onClick={() => announce(reply, true)}
                      sx={{
                        color: "white",
                        bgcolor: "rgba(255,255,255,0.2)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                      }}
                    >
                      <VolumeUpIcon />
                    </IconButton>
                    <IconButton
                      onClick={() => speechSynthesis.cancel()}
                      sx={{
                        color: "white",
                        bgcolor: "rgba(255,255,255,0.2)",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.3)" },
                      }}
                    >
                      <StopIcon />
                    </IconButton>
                  </Stack>

                  <Divider sx={{ bgcolor: "rgba(255,255,255,0.3)", mb: 2 }} />

                  <Typography variant="h6" sx={{ mb: 2, lineHeight: 1.5 }}>
                    {reply}
                  </Typography>

                  {detections.length > 0 && (
                    <>
                      <Divider
                        sx={{ bgcolor: "rgba(255,255,255,0.3)", my: 2 }}
                      />
                      <Typography
                        variant="subtitle1"
                        sx={{ mb: 2, fontWeight: "medium" }}
                      >
                        Detected Notes:
                      </Typography>
                      <Stack spacing={1.5}>
                        {detections.map((det, idx) => (
                          <Paper
                            key={idx}
                            elevation={0}
                            sx={{
                              p: 2,
                              bgcolor: "rgba(255,255,255,0.95)",
                              color: "success.dark",
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <MoneyIcon fontSize="large" />
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="h6" fontWeight="bold">
                                {parseInt(det.class).toLocaleString()} VND
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                Color: {det.color || "detected"} • Confidence:{" "}
                                {Math.round(det.confidence * 100)}%
                              </Typography>
                            </Box>
                          </Paper>
                        ))}
                      </Stack>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {!reply && !loading && (
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  textAlign: "center",
                  bgcolor: "grey.100",
                  borderRadius: 2,
                }}
              >
                <Typography variant="body1" color="text.secondary">
                  Capture an image to see detection results
                </Typography>
              </Paper>
            )}
          </Container>
        ) : (
          // Other Detection Types - Simple Layout
          <>
            <Button
              variant="contained"
              onClick={capture}
              disabled={loading}
              size="large"
              sx={{ mb: 2 }}
            >
              {loading ? "Processing..." : "Take Screenshot"}
            </Button>

            <WebCam ref={webcamRef}></WebCam>

            {reply && (
              <div className="reply-box">
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <IconButton
                    onClick={() => announce(reply, true)}
                    size="small"
                  >
                    <VolumeUpIcon />
                  </IconButton>
                  <IconButton
                    onClick={() => speechSynthesis.cancel()}
                    size="small"
                  >
                    <StopIcon />
                  </IconButton>
                </Stack>
                {reply}
              </div>
            )}
          </>
        )}
      </div>

      {/* Help Dialog */}
      <Dialog
        open={showHelp}
        onClose={() => setShowHelp(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Keyboard Shortcuts for Accessibility</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                Space
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Take screenshot and analyze
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                R
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Repeat last result (audio)
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                S
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Stop audio playback
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                H or ?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Show this help dialog
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHelp(false)} autoFocus>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
=======
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
>>>>>>> origin/main
}
