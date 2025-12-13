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
import {KeyboardVoice, StopCircle, MusicNote, Album, Person, CalendarToday, PlayArrow, Pause} from "@mui/icons-material";
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
    const isMountedRef = useRef(true);
    const restartTimeoutRef = useRef(null);
    const isSpeakingRef = useRef(false);
    const audioRef = useRef(null);
    const resultRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const startVoiceRecognition = () => {
        if (!recognitionRef.current || voiceActiveRef.current || !isMountedRef.current || isSpeakingRef.current) return;

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

    const stopVoiceRecognition = () => {
        if (!recognitionRef.current || !voiceActiveRef.current) return;

        try {
            recognitionRef.current.stop();
            voiceActiveRef.current = false;
            setIsVoiceCommandActive(false);
            console.log('Voice recognition stopped');
        } catch (e) {
            console.error('Failed to stop voice recognition:', e);
        }
    };

    const speakWithPause = (text) => {
        isSpeakingRef.current = true;
        stopVoiceRecognition();

        // Use speechSynthesis for better control
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);

            utterance.onend = () => {
                console.log('Speech finished');
                // Add a small delay before resuming voice recognition
                setTimeout(() => {
                    isSpeakingRef.current = false;
                    if (isMountedRef.current) {
                        startVoiceRecognition();
                    }
                }, 500);
            };

            utterance.onerror = (event) => {
                console.error('Speech error:', event);
                isSpeakingRef.current = false;
                if (isMountedRef.current) {
                    startVoiceRecognition();
                }
            };

            window.speechSynthesis.speak(utterance);
        } else {
            // Fallback to speech function
            speech(text);

            // Resume voice recognition after estimated duration
            const words = text.split(' ').length;
            const estimatedDuration = (words / 150) * 60 * 1000;
            const pauseDuration = Math.max(estimatedDuration + 500, 2000);

            setTimeout(() => {
                isSpeakingRef.current = false;
                if (isMountedRef.current) {
                    startVoiceRecognition();
                }
            }, pauseDuration);
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        const introduction = "This is the Music Detection mode. Say 'start listening' to begin detecting music.";

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                // Ignore results while speaking
                if (isSpeakingRef.current) {
                    console.log('Ignoring voice command while speaking');
                    return;
                }

                const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
                console.log('Voice command received:', transcript);

                if (transcript.includes('start') || transcript.includes('start listening') || transcript.includes('start detection')) {
                    console.log('Start command detected. isListening:', isListeningRef.current, 'isProcessing:', isProcessingRef.current);
                    if (!isListeningRef.current && !isProcessingRef.current) {
                        speakWithPause('Starting music detection');
                        startListening();
                    }
                } else if (transcript.includes('stop listening') || transcript.includes('stop detection')) {
                    console.log('Stop command detected');
                    if (isListeningRef.current) {
                        stopListening();
                    }
                } else if (transcript.includes('play music') || transcript.includes('play song') || transcript.includes('play the music')) {
                    console.log('Play music command detected');
                    playMusic();
                } else if (transcript.includes('stop music') || transcript.includes('stop song') || transcript.includes('pause music') || transcript.includes('pause song')) {
                    console.log('Stop music command detected');
                    stopMusic();
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                voiceActiveRef.current = false;
                setIsVoiceCommandActive(false);

                // Clear any pending restart
                if (restartTimeoutRef.current) {
                    clearTimeout(restartTimeoutRef.current);
                    restartTimeoutRef.current = null;
                }

                // Don't restart on certain errors or if component is unmounted
                if (event.error === 'aborted' || event.error === 'audio-capture' || !isMountedRef.current) {
                    console.log('Not restarting due to error type or unmount');
                    return;
                }

                // Auto-restart on other errors after a delay
                restartTimeoutRef.current = setTimeout(() => {
                    if (!voiceActiveRef.current && isMountedRef.current) {
                        console.log('Attempting restart after error...');
                        startVoiceRecognition();
                    }
                    restartTimeoutRef.current = null;
                }, 1000);
            };

            recognition.onend = () => {
                console.log('Voice recognition ended');
                voiceActiveRef.current = false;
                setIsVoiceCommandActive(false);

                // Clear any pending restart
                if (restartTimeoutRef.current) {
                    clearTimeout(restartTimeoutRef.current);
                    restartTimeoutRef.current = null;
                }

                // Only restart if component is still mounted
                if (!isMountedRef.current) {
                    console.log('Not restarting - component unmounted');
                    return;
                }

                // Automatically restart recognition
                console.log('Scheduling restart...');
                restartTimeoutRef.current = setTimeout(() => {
                    if (!voiceActiveRef.current && isMountedRef.current) {
                        console.log('Restarting recognition...');
                        startVoiceRecognition();
                    }
                    restartTimeoutRef.current = null;
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
                isSpeakingRef.current = false;
                startVoiceRecognition();
            }, 6500);
        } else {
            console.warn('Speech recognition not supported in this browser');
            speech(introduction);
        }

        return () => {
            console.log('Component unmounting, cleaning up...');
            isMountedRef.current = false;
            voiceActiveRef.current = false;

            // Clear all timeouts
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
                restartTimeoutRef.current = null;
            }

            // Stop and cleanup recognition
            if (recognitionRef.current) {
                try {
                    // Remove event listeners to prevent them from firing
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

            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }

            setIsVoiceCommandActive(false);
        };
    }, []);

    const startListening = async () => {
        try {
            console.log('Starting to listen for music...');
            setResult(null);
            resultRef.current = null;
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
                    speakWithPause("Processing the music");
                }
            }, 10000);
        } catch (err) {
            console.error('Error starting listener:', err);
            speakWithPause('Microphone access denied. Please allow microphone access.');
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
            speakWithPause("Processing the music");
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
                const audioPath = data.music_info?.spotify?.preview_url || null;

                const resultData = {
                    type: data.type,
                    title: data.music_info?.title,
                    artist: data.music_info?.artist,
                    album: data.music_info?.album,
                    coverImage: data.music_info?.spotify?.artwork?.large,
                    releaseDate: data.music_info?.release_date,
                    audioPath: audioPath,
                    timestamp: new Date().toLocaleTimeString()
                };

                setResult(resultData);
                resultRef.current = resultData;

                // Create or update audio element if audio path exists
                if (audioPath) {
                    // Clean up old audio if exists
                    if (audioRef.current) {
                        audioRef.current.pause();
                        audioRef.current = null;
                    }

                    // Create new audio element
                    audioRef.current = new Audio(audioPath);
                    audioRef.current.onended = () => {
                        setIsPlaying(false);
                    };
                    console.log('Audio element created with URL:', audioPath);
                }

                setTimeout(() => {
                    const message = "The song is " + data.music_info?.title
                        + ". It was composed by " + data.music_info?.artist
                        + " and released on " + data.music_info?.release_date;

                    if (audioPath) {
                        speakWithPause(message + ". Say play music to play the song.");
                    } else {
                        speakWithPause(message);
                    }
                }, 1000);
            } else {
                speakWithPause('Unable to identify the music. Please try again.');
            }
            setIsProcessing(false);
            isProcessingRef.current = false;
            console.log('Processing complete, ready for next command');
        } catch (err) {
            console.error('Error processing audio:', err);
            speakWithPause('Error processing audio: ' + (err.response?.data?.detail || err.message));
            setIsProcessing(false);
            isProcessingRef.current = false;
        }
    };

    const playMusic = () => {
        console.log('playMusic called');
        console.log('audioRef.current:', audioRef.current);
        console.log('result:', result);
        console.log('resultRef.current:', resultRef.current);
        console.log('result?.audioPath:', result?.audioPath);
        console.log('resultRef.current?.audioPath:', resultRef.current?.audioPath);

        if (audioRef.current && resultRef.current?.audioPath) {
            console.log('Playing audio from:', resultRef.current.audioPath);
            audioRef.current.play();
            setIsPlaying(true);
            speakWithPause('Playing music');
        } else {
            console.log('Cannot play - audioRef.current:', audioRef.current, 'audioPath:', resultRef.current?.audioPath);
            speakWithPause('No music available to play');
        }
    };

    const stopMusic = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
            speakWithPause('Music stopped');
        } else {
            speakWithPause('No music is currently playing');
        }
    };

    return (
        <Container maxWidth="md" className="music-detection-container">
            <Paper elevation={3} className="music-detection-paper">
                <Box className="music-detection-header">
                    <Typography variant="h4" gutterBottom className="music-detection-title">
                        Music Detection
                    </Typography>
                    <Typography variant="body1" className="music-detection-subtitle">
                        Say "start listening" to detect music, then "play music" or "stop music"
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
                                        style={{width:"30%"}}
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
                                
                                {result.audioPath && (
                                    <Button
                                        variant="contained"
                                        onClick={isPlaying ? stopMusic : playMusic}
                                        className="music-detection-play-icon-button"
                                        aria-label={isPlaying ? "Stop music" : "Play music"}
                                    >
                                        {isPlaying ? <Pause sx={{ fontSize: '32px' }} /> : <PlayArrow sx={{ fontSize: '32px' }} />}
                                    </Button>
                                )}
                            </Card>
                        </Fade>
                    )}
                </Box>
            </Paper>
        </Container>
    );
}