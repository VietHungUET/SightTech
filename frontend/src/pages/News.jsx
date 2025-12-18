import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Button,
  TextField,
  Card,
  CardContent,
  CardActions,
  Typography,
  Container,
  Box,
  CircularProgress,
  Alert,
  IconButton,
  Divider,
  Link as MuiLink,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import StopIcon from "@mui/icons-material/Stop";
import SearchIcon from "@mui/icons-material/Search";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import SpeedIcon from "@mui/icons-material/Speed";

export default function News() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Audio state
  const [currentArticleIndex, setCurrentArticleIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [readingSpeed, setReadingSpeed] = useState(1.0);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [autoRead, setAutoRead] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const utteranceRef = useRef(null);
  const BACKEND_URL = "http://localhost:8000";

  // Load voices when component mounts
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      // Filter for high-quality English voices
      const premiumVoices = voices.filter(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Enhanced") ||
            v.name.includes("Premium") ||
            v.name.includes("Natural") ||
            v.quality === "premium" ||
            v.name.includes("Samantha") ||
            v.name.includes("Alex") ||
            v.name.includes("Google") ||
            v.localService === true)
      );
      setAvailableVoices(
        premiumVoices.length > 0
          ? premiumVoices
          : voices.filter((v) => v.lang.startsWith("en"))
      );

      // Priority 1: Samantha (en-US)
      // Priority 2: Any Samantha voice
      // Priority 3: Other premium voices
      // Priority 4: Any English voice
      let defaultVoice = voices.find(
        (v) => v.name === "Samantha" && v.lang === "en-US"
      );
      if (!defaultVoice)
        defaultVoice = voices.find((v) => v.name.includes("Samantha"));
      if (!defaultVoice) defaultVoice = premiumVoices[0];
      if (!defaultVoice)
        defaultVoice = voices.find((v) => v.lang.startsWith("en"));

      // Set default voice
      if (!selectedVoice && defaultVoice) {
        setSelectedVoice(defaultVoice);
      }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    // Load preferences from localStorage
    const savedSpeed = localStorage.getItem("newsReadingSpeed");
    const savedAutoRead = localStorage.getItem("newsAutoRead");
    if (savedSpeed) setReadingSpeed(parseFloat(savedSpeed));
    if (savedAutoRead) setAutoRead(savedAutoRead === "true");

    return () => {
      speechSynthesis.cancel();
    };
  }, []);

  // Save preferences
  useEffect(() => {
    localStorage.setItem("newsReadingSpeed", readingSpeed.toString());
    localStorage.setItem("newsAutoRead", autoRead.toString());
  }, [readingSpeed, autoRead]);

  // Announce function for audio cues
  const announce = useCallback(
    (text, interrupt = false) => {
      if (interrupt && speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.rate = readingSpeed;
      utterance.volume = 0.8; // Slightly quieter for announcements
      speechSynthesis.speak(utterance);
    },
    [selectedVoice, readingSpeed]
  );

  // Fetch news articles
  const fetchNews = async (searchQuery) => {
    setLoading(true);
    setError(null);
    announce("Searching for articles", true);

    try {
      const formData = new FormData();
      formData.append("news_query", searchQuery);

      const response = await axios.post(
        `${BACKEND_URL}/fetching_news`,
        formData
      );

      if (response.data.articles) {
        setArticles(response.data.articles);
        const count = response.data.articles.length;
        announce(`Found ${count} article${count !== 1 ? "s" : ""}`);

        // Auto-read first article if enabled
        if (autoRead && count > 0) {
          setTimeout(() => readArticle(0), 1500);
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Failed to fetch news";
      setError(errorMsg);
      announce("Error fetching articles");
      console.error("Error fetching news:", err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search (not used for button click, but useful for future autocomplete)
  const debouncedSearch = useMemo(() => {
    let timeoutId;
    return (searchQuery) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fetchNews(searchQuery), 500);
    };
  }, []);

  const handleSearch = (e) => {
    e?.preventDefault();
    if (query.trim()) {
      fetchNews(query.trim());
    }
  };

  // Voice recognition
  const startVoiceRecognition = () => {
    if (!("webkitSpeechRecognition" in window)) {
      setError("Voice recognition is not supported in your browser.");
      return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      announce("Listening");
    };

    recognition.onresult = (event) => {
      const transcriptRaw = event.results[0][0].transcript.trim();
      const transcript = transcriptRaw.toLowerCase();

      // Navigation commands (Open / Switch / Go to / I want to use ...)
      const isNavIntent =
        transcript.includes("open") ||
        transcript.includes("switch to") ||
        transcript.includes("go to") ||
        transcript.includes("i want to use");

      if (isNavIntent) {
        if (transcript.includes("object")) {
          navigate("/image/object");
        } else if (transcript.includes("currency") || transcript.includes("money")) {
          navigate("/image/currency");
        } else if (transcript.includes("barcode") || transcript.includes("product")) {
          navigate("/image/barcode");
        } else if (transcript.includes("text") || transcript.includes("document")) {
          navigate("/image/text");
        } else if (transcript.includes("news")) {
          // Already here
          announce("You are already in the news section");
        } else if (transcript.includes("chatbot") || transcript.includes("chat bot") || transcript.includes("chat")) {
          navigate("/chatbot");
        } else if (transcript.includes("navigation") || transcript.includes("navigate")) {
          navigate("/navigation");
        } else if (transcript.includes("music")) {
          navigate("/music");
        } else if (transcript.includes("home") || transcript.includes("homepage") || transcript.includes("main menu") || transcript.includes("main screen")) {
          navigate("/");
        } else {
          // Unknown target → fallback to search
          setQuery(transcriptRaw);
          fetchNews(transcriptRaw);
        }
      } else {
        // Default: treat as search query
        setQuery(transcriptRaw);
        fetchNews(transcriptRaw);
      }
    };

    recognition.onerror = (event) => {
      console.error("Voice recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Read article with enhanced features
  const readArticle = useCallback(
    (index) => {
      if (index < 0 || index >= articles.length) return;

      speechSynthesis.cancel();
      setCurrentArticleIndex(index);
      setIsPlaying(true);

      const article = articles[index];
      const position = `Article ${index + 1} of ${articles.length}`;
      const text = `${position}. ${article.title}. ${article.summary}`;

      utteranceRef.current = new SpeechSynthesisUtterance(text);
      if (selectedVoice) utteranceRef.current.voice = selectedVoice;
      utteranceRef.current.rate = readingSpeed;
      utteranceRef.current.pitch = 1.0;
      utteranceRef.current.volume = 1.0;

      utteranceRef.current.onend = () => {
        setIsPlaying(false);

        // Auto-advance to next article if auto-read enabled
        if (autoRead && index < articles.length - 1) {
          setTimeout(() => readArticle(index + 1), 2000);
        } else if (index === articles.length - 1) {
          announce("No more articles");
        }
      };

      utteranceRef.current.onerror = () => {
        setIsPlaying(false);
      };

      speechSynthesis.speak(utteranceRef.current);
    },
    [articles, selectedVoice, readingSpeed, autoRead, announce]
  );

  // Playback controls
  const togglePlayPause = useCallback(() => {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
      speechSynthesis.pause();
      setIsPlaying(false);
    } else if (speechSynthesis.paused) {
      speechSynthesis.resume();
      setIsPlaying(true);
    } else if (currentArticleIndex >= 0) {
      readArticle(currentArticleIndex);
    } else if (articles.length > 0) {
      readArticle(0);
    }
  }, [currentArticleIndex, articles, readArticle]);

  const nextArticle = useCallback(() => {
    if (currentArticleIndex < articles.length - 1) {
      readArticle(currentArticleIndex + 1);
    } else {
      announce("Last article");
    }
  }, [currentArticleIndex, articles, readArticle, announce]);

  const previousArticle = useCallback(() => {
    if (currentArticleIndex > 0) {
      readArticle(currentArticleIndex - 1);
    } else {
      announce("First article");
    }
  }, [currentArticleIndex, readArticle, announce]);

  const stopAll = useCallback(() => {
    speechSynthesis.cancel();
    setIsPlaying(false);
    setCurrentArticleIndex(-1);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;

      switch (e.key.toLowerCase()) {
        case " ":
          e.preventDefault();
          togglePlayPause();
          break;
        case "arrowright":
          e.preventDefault();
          nextArticle();
          break;
        case "arrowleft":
          e.preventDefault();
          previousArticle();
          break;
        case "r":
          if (currentArticleIndex >= 0) {
            readArticle(currentArticleIndex);
          }
          break;
        case "s":
          stopAll();
          break;
        case "a":
          setAutoRead((prev) => !prev);
          announce(autoRead ? "Auto-read disabled" : "Auto-read enabled");
          break;
        case "?":
          setShowHelp(true);
          break;
        case "+":
        case "=":
          setReadingSpeed((prev) => Math.min(2.0, prev + 0.1));
          break;
        case "-":
        case "_":
          setReadingSpeed((prev) => Math.max(0.5, prev - 0.1));
          break;
        default:
          // Number keys 1-9
          if (e.key >= "1" && e.key <= "9") {
            const index = parseInt(e.key) - 1;
            if (index < articles.length) {
              readArticle(index);
            }
          }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [
    togglePlayPause,
    nextArticle,
    previousArticle,
    stopAll,
    readArticle,
    articles,
    currentArticleIndex,
    autoRead,
    announce,
  ]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Skip to Content Link */}
      <Button
        href="#search-results"
        sx={{
          position: "absolute",
          left: "-9999px",
          "&:focus": {
            left: "10px",
            top: "10px",
            zIndex: 9999,
            position: "fixed",
          },
        }}
      >
        Skip to search results
      </Button>

      {/* Page Title */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          News Search
        </Typography>
        <IconButton
          onClick={() => setShowHelp(true)}
          aria-label="Show keyboard shortcuts help"
          size="large"
        >
          <HelpOutlineIcon />
        </IconButton>
      </Box>

      {/* Controls Panel */}
      <Card sx={{ mb: 3, p: 2 }} elevation={1}>
        <Typography variant="h6" gutterBottom sx={{ fontSize: "1.1rem" }}>
          Reading Controls
        </Typography>
        <Stack spacing={2}>
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Voice</InputLabel>
              <Select
                value={selectedVoice?.name || ""}
                label="Voice"
                onChange={(e) => {
                  const voice = availableVoices.find(
                    (v) => v.name === e.target.value
                  );
                  setSelectedVoice(voice);
                }}
              >
                {availableVoices.map((voice) => (
                  <MenuItem key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Checkbox
                  checked={autoRead}
                  onChange={(e) => setAutoRead(e.target.checked)}
                />
              }
              label="Auto-read results"
            />
          </Box>

          <Box>
            <Typography gutterBottom>
              <SpeedIcon sx={{ verticalAlign: "middle", mr: 1 }} />
              Reading Speed: {readingSpeed.toFixed(1)}x
            </Typography>
            <Slider
              value={readingSpeed}
              onChange={(_, value) => setReadingSpeed(value)}
              min={0.5}
              max={2.0}
              step={0.1}
              marks={[
                { value: 0.75, label: "Slow" },
                { value: 1.0, label: "Normal" },
                { value: 1.5, label: "Fast" },
              ]}
              sx={{ maxWidth: 400 }}
            />
          </Box>

          {articles.length > 0 && (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                onClick={togglePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button
                variant="outlined"
                startIcon={<SkipPreviousIcon />}
                onClick={previousArticle}
                disabled={currentArticleIndex <= 0}
                aria-label="Previous article"
              >
                Previous
              </Button>
              <Button
                variant="outlined"
                startIcon={<SkipNextIcon />}
                onClick={nextArticle}
                disabled={currentArticleIndex >= articles.length - 1}
                aria-label="Next article"
              >
                Next
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                onClick={stopAll}
                aria-label="Stop all audio"
              >
                Stop
              </Button>
              <Chip
                label={`Article ${currentArticleIndex + 1} of ${
                  articles.length
                }`}
                color="primary"
                sx={{ ml: "auto" }}
              />
            </Box>
          )}
        </Stack>
      </Card>

      {/* Search Form */}
      <Box
        component="form"
        onSubmit={handleSearch}
        sx={{ mb: 4 }}
        role="search"
      >
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            fullWidth
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What would you like to know about?"
            label="Search Query"
            variant="outlined"
            disabled={loading}
            inputProps={{ "aria-label": "Enter news search query" }}
          />
          <IconButton
            onClick={startVoiceRecognition}
            disabled={loading || isListening}
            color={isListening ? "error" : "primary"}
            aria-label="Voice search"
            sx={{ minWidth: "56px", minHeight: "56px" }}
          >
            <MicIcon fontSize="large" />
          </IconButton>
        </Box>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={loading || !query.trim()}
          fullWidth
          startIcon={<SearchIcon />}
          sx={{ mt: 2, fontSize: "1.1rem", py: 1.5 }}
        >
          {loading ? "Searching..." : "Search News"}
        </Button>
      </Box>

      {/* Loading/Error/Empty States */}
      {loading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            py: 6,
          }}
        >
          <CircularProgress size={60} />
          <Typography variant="h6">Finding the best articles...</Typography>
        </Box>
      )}

      {error && !loading && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => query && fetchNews(query)}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!loading && !error && articles.length === 0 && (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography variant="h6" color="text.secondary">
            Enter a topic to find news articles
          </Typography>
        </Box>
      )}

      {/* Articles List */}
      <Box
        id="search-results"
        sx={{ display: "flex", flexDirection: "column", gap: 3 }}
      >
        {!loading &&
          articles.map((article, index) => (
            <Card
              key={index}
              elevation={currentArticleIndex === index ? 4 : 2}
              sx={{
                border:
                  currentArticleIndex === index ? "3px solid #1976d2" : "none",
                "&:focus-within": {
                  outline: "3px solid #1976d2",
                  outlineOffset: "2px",
                },
              }}
            >
              <CardContent>
                <Typography
                  variant="h5"
                  component="h2"
                  gutterBottom
                  sx={{ fontWeight: 600 }}
                >
                  {article.title}
                </Typography>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ fontSize: "1.1rem", lineHeight: 1.7 }}
                >
                  {article.summary}
                </Typography>
              </CardContent>
              <CardActions sx={{ p: 2, gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  startIcon={<VolumeUpIcon />}
                  onClick={() => readArticle(index)}
                  aria-label={`Read article ${index + 1}`}
                  sx={{ minHeight: "48px", px: 2.5 }}
                >
                  Read Aloud
                </Button>
                <Button
                  variant="contained"
                  component="a"
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  endIcon={<OpenInNewIcon />}
                  aria-label={`Read full article (opens in new tab)`}
                  sx={{ minHeight: "48px", px: 2.5 }}
                >
                  Full Article
                </Button>
              </CardActions>
            </Card>
          ))}
      </Box>

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog
        open={showHelp}
        onClose={() => setShowHelp(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogContent>
          <Box sx={{ "& > *": { mb: 1.5 } }}>
            <Typography>
              <strong>Space</strong> - Play/Pause current article
            </Typography>
            <Typography>
              <strong>→</strong> - Next article
            </Typography>
            <Typography>
              <strong>←</strong> - Previous article
            </Typography>
            <Typography>
              <strong>R</strong> - Repeat current article
            </Typography>
            <Typography>
              <strong>S</strong> - Stop all audio
            </Typography>
            <Typography>
              <strong>1-9</strong> - Jump to article N
            </Typography>
            <Typography>
              <strong>A</strong> - Toggle auto-read
            </Typography>
            <Typography>
              <strong>+/-</strong> - Adjust reading speed
            </Typography>
            <Typography>
              <strong>?</strong> - Show this help
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowHelp(false)} size="large">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
