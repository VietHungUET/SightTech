import React, {useState, useRef, useEffect} from 'react';
import {
    Button,
    Card,
    CardContent,
    CardMedia,
    Typography,
    Box,
    CircularProgress,
    Chip,
    Container,
    Paper,
    Fade
} from '@mui/material';
import {KeyboardVoice, StopCircle, MusicNote, Album, Person, CalendarToday} from "@mui/icons-material";
import userAPI, {API_BASE_URL} from "../utils/userAPI.jsx";
import {speech} from "../utils/utils.jsx";
import './MusicDetection.css';

export default function MusicDetection() {
    const [isListening, setIsListening] = useState(false);
    const [result, setResult] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const timeoutRef = useRef(null);
    const recognitionRef = useRef(null);
    const isListeningRef = useRef(false);
    const isProcessingRef = useRef(false);
    const voiceActiveRef = useRef(false);

    const startVoiceRecognition = () => {
        if (!recognitionRef.current || voiceActiveRef.current) return;

        try {
            recognitionRef.current.start();
            voiceActiveRef.current = true;
            setIsVoiceCommandActive(true);
            console.log('Voice recognition started');
        } catch (e) {
            console.error('Failed to start voice recognition:', e);
            // If already started, just mark as active
            if (e.name === 'InvalidStateError') {
                voiceActiveRef.current = true;
                setIsVoiceCommandActive(true);
            }
        }
    };

    useEffect(() => {
        const introduction = "This is the Music Detection mode. Say 'start listening' to begin detecting music.";

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
                console.log('Voice command received:', transcript);

                if (transcript.includes('start') || transcript.includes('start listening') || transcript.includes('start detection')) {
                    console.log('Start command detected. isListening:', isListeningRef.current, 'isProcessing:', isProcessingRef.current);
                    if (!isListeningRef.current && !isProcessingRef.current) {
                        speech('Starting music detection');
                        startListening();
                    }
                } else if (transcript.includes('stop listening') || transcript.includes('stop detection')) {
                    console.log('Stop command detected');
                    if (isListeningRef.current) {
                        stopListening();
                    }
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                voiceActiveRef.current = false;

                // Don't restart on certain errors
                if (event.error === 'aborted' || event.error === 'audio-capture') {
                    return;
                }

                // Auto-restart on other errors after a delay
                setTimeout(() => {
                    if (!voiceActiveRef.current) {
                        startVoiceRecognition();
                    }
                }, 1000);
            };

            recognition.onend = () => {
                console.log('Voice recognition ended, restarting...');
                voiceActiveRef.current = false;

                // Automatically restart recognition
                setTimeout(() => {
                    if (!voiceActiveRef.current) {
                        startVoiceRecognition();
                    }
                }, 500);
            };

            recognition.onstart = () => {
                console.log('Voice recognition active');
                voiceActiveRef.current = true;
                setIsVoiceCommandActive(true);
            };

            recognitionRef.current = recognition;

            // Speak introduction first, then start voice recognition after speech completes
            speech(introduction);

            // Wait for introduction to complete before starting voice recognition
            setTimeout(() => {
                startVoiceRecognition();
            }, 6000);
        } else {
            console.warn('Speech recognition not supported in this browser');
            speech(introduction);
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            if (recognitionRef.current) {
                voiceActiveRef.current = false;
                try {
                    recognitionRef.current.stop();
                } catch (e) {
                    console.log('Error stopping recognition:', e);
                }
            }
        };
    }, []);

    const startListening = async () => {
        try {
            console.log('Starting to listen for music...');
            setResult(null);
            audioChunksRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await processAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsListening(true);
            isListeningRef.current = true;
            console.log('Now listening, refs updated');

            timeoutRef.current = setTimeout(() => {
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                    mediaRecorderRef.current.stop();
                    setIsListening(false);
                    isListeningRef.current = false;
                    setIsProcessing(true);
                    isProcessingRef.current = true;
                    speech("Processing the music");
                }
            }, 10000);
        } catch (err) {
            console.error('Error starting listener:', err);
            speech('Microphone access denied. Please allow microphone access.');
            isListeningRef.current = false;
            setIsListening(false);
        }
    };

    const stopListening = () => {
        console.log('Stopping listening...');
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsListening(false);
            isListeningRef.current = false;
            setIsProcessing(true);
            isProcessingRef.current = true;
            speech("Processing the music");
        }
    };

    const processAudio = async (audioBlob) => {
        try {
            console.log('Processing audio...');
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');

            const response = await userAPI.postMusicDetection(formData);
            const data = response.data;

            if (data.success) {
                setResult({
                    type: data.type,
                    title: data.music_info?.title,
                    artist: data.music_info?.artist,
                    album: data.music_info?.album,
                    coverImage: data.music_info?.spotify?.artwork?.large,
                    releaseDate: data.music_info?.release_date,
                    audioPath: data.audio_path ? `${API_BASE_URL}${data.audio_path}` : null,
                    timestamp: new Date().toLocaleTimeString()
                });
                setTimeout(() => {
                    speech("The song is " + data.music_info?.title
                        + ". It was composed by " + data.music_info?.artist
                        + " and released on " + data.music_info?.release_date);
                }, 1000);
            } else {
                speech('Unable to identify the music. Please try again.');
            }
            setIsProcessing(false);
            isProcessingRef.current = false;
            console.log('Processing complete, ready for next command');
        } catch (err) {
            console.error('Error processing audio:', err);
            speech('Error processing audio: ' + (err.response?.data?.detail || err.message));
            setIsProcessing(false);
            isProcessingRef.current = false;
        }
    };

    return (
        <Container maxWidth="md" className="music-detection-container">
            <Paper elevation={3} className="music-detection-paper">
                <Box className="music-detection-header">
                    <MusicNote className="music-detection-icon" />
                    <Typography variant="h4" gutterBottom className="music-detection-title">
                        Music Detection
                    </Typography>
                    <Typography variant="body1" className="music-detection-subtitle">
                        Say "start listening" or tap the button to identify music
                    </Typography>
                </Box>

                {isVoiceCommandActive && (
                    <Box className="music-detection-voice-status">
                        <Chip
                            icon={<KeyboardVoice />}
                            label="Voice commands active"
                            color="success"
                            size="small"
                            className="music-detection-voice-chip"
                        />
                    </Box>
                )}

                <Box className="music-detection-content">
                    <Button
                        variant={isListening ? "contained" : "contained"}
                        color={isListening ? "error" : "primary"}
                        onClick={isListening ? stopListening : startListening}
                        disabled={isProcessing}
                        size="large"
                        startIcon={isListening ? <StopCircle /> : <KeyboardVoice />}
                        className="music-detection-button"
                    >
                        {isListening ? "Stop Listening" : "Start Listening"}
                    </Button>

                    {(isListening || isProcessing) && (
                        <Fade in={isListening || isProcessing}>
                            <Box className="music-detection-loading">
                                <CircularProgress size={60} thickness={4} />
                                <Typography variant="body1" className="music-detection-loading-text">
                                    {isListening ? "Listening to music..." : "Identifying music..."}
                                </Typography>
                            </Box>
                        </Fade>
                    )}

                    {result && !isProcessing && (
                        <Fade in={Boolean(result)}>
                            <Card className="music-detection-result-card">
                                {result.coverImage && (
                                    <CardMedia
                                        component="img"
                                        height="300"
                                        image={result.coverImage}
                                        alt={result.title}
                                        className="music-detection-cover"
                                    />
                                )}
                                <CardContent className="music-detection-result-content">
                                    <Typography variant="h5" gutterBottom className="music-detection-result-title">
                                        {result.title}
                                    </Typography>

                                    <Box className="music-detection-result-info">
                                        <Box className="music-detection-info-row">
                                            <Person color="action" />
                                            <Typography variant="body1" className="music-detection-info-text">
                                                <strong>Artist:</strong> {result.artist}
                                            </Typography>
                                        </Box>

                                        {result.album && (
                                            <Box className="music-detection-info-row">
                                                <Album color="action" />
                                                <Typography variant="body1" className="music-detection-info-text">
                                                    <strong>Album:</strong> {result.album}
                                                </Typography>
                                            </Box>
                                        )}

                                        {result.releaseDate && (
                                            <Box className="music-detection-info-row">
                                                <CalendarToday color="action" />
                                                <Typography variant="body1" className="music-detection-info-text">
                                                    <strong>Released:</strong> {result.releaseDate}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>

                                    <Chip
                                        label={`Detected at ${result.timestamp}`}
                                        size="small"
                                        className="music-detection-timestamp"
                                        variant="outlined"
                                    />
                                </CardContent>
                            </Card>
                        </Fade>
                    )}
                </Box>
            </Paper>
        </Container>
    );
}