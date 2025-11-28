import { useState, useRef, useEffect } from 'react';
import { TextField, IconButton, CircularProgress } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import SendIcon from "@mui/icons-material/Send";
import userAPI from '../../utils/userAPI';
import './ChatInput.css';

export default function ChatInput({ onSend, loading, onRecordingChange, onStopSpeaking }) {
    const [input, setInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [audioBars, setAudioBars] = useState(Array(30).fill(0.1));
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);

    const handleSend = () => {
        if (input.trim()) {
            onSend(input);
            setInput('');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const visualizeAudio = (stream) => {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        analyserRef.current = audioContextRef.current.createAnalyser();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 128;
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateLevel = () => {
            if (!analyserRef.current) return;
            
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Get average for overall level
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            setAudioLevel(average / 255);
            
            // Create bars from frequency data
            const newBars = [];
            const barsCount = 30;
            const step = Math.floor(bufferLength / barsCount);
            for (let i = 0; i < barsCount; i++) {
                const value = dataArray[i * step] / 255;
                newBars.push(Math.max(0.15, value));
            }
            setAudioBars(newBars);
            
            animationFrameRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
    };

    const startRecording = async () => {
        // Stop chatbot speaking when user starts recording
        if (onStopSpeaking) {
            onStopSpeaking();
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await sendAudioForTranscription(audioBlob);
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                
                // Clean up audio context
                if (audioContextRef.current) {
                    audioContextRef.current.close();
                    audioContextRef.current = null;
                }
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }
                setAudioLevel(0);
                setAudioBars(Array(30).fill(0.1));
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
            if (onRecordingChange) onRecordingChange(true);
            
            // Start audio visualization
            visualizeAudio(stream);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Unable to access microphone. Please check permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (onRecordingChange) onRecordingChange(false);
        }
    };

    const sendAudioForTranscription = async (audioBlob) => {
        setIsProcessing(true);
        
        const formData = new FormData();
        formData.append('file', new File([audioBlob], 'voice-input.webm', { type: 'audio/webm' }));

        try {
            console.log('Sending audio to backend...', audioBlob.size, 'bytes');
            
            const response = await userAPI.transcribeOnboarding(formData);

            console.log('Backend response:', response.data);

            // Backend returns: { transcript: "...", success: true } or { transcript: "", success: false, error: "..." }
            if (response.data.success && response.data.transcript) {
                const transcribedText = response.data.transcript.trim();
                
                if (transcribedText) {
                    console.log('Transcription successful:', transcribedText);
                    // Send transcribed text to chatbot
                    onSend(transcribedText);
                } else {
                    console.log('Empty transcript received');
                    alert('No speech detected. Please try again.');
                }
            } else {
                console.error('Transcription failed:', response.data.error || 'Unknown error');
                alert('Failed to transcribe audio. Please try speaking more clearly.');
            }
        } catch (error) {
            console.error('Error transcribing audio:', error);
            if (error.code === 'ERR_NETWORK') {
                alert('Cannot connect to backend. Please make sure the server is running.');
            } else {
                const errorMessage = error.response?.data?.detail || 'Failed to transcribe audio. Please try again.';
                alert(errorMessage);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && isRecording) {
                stopRecording();
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, []);

    // Recording mode - full width waveform button
    if (isRecording) {
        return (
            <div
                onClick={stopRecording}
                className="recordingContainer"
                role="button"
                aria-label="Tap anywhere to stop recording"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && stopRecording()}
            >
                {/* Waveform visualization - full width */}
                <div className="waveformContainer">
                    {audioBars.map((barHeight, index) => (
                        <div
                            key={index}
                            className="waveformBar"
                            style={{
                                height: `${Math.max(8, barHeight * 52)}px`,
                                opacity: 0.7 + barHeight * 0.3,
                            }}
                        />
                    ))}
                </div>

                {/* Tap to stop hint */}
                <span className="tapToStopHint">Tap to stop</span>
            </div>
        );
    }

    // Normal mode - text input UI
    return (
        <div className="inputContainer">
            <IconButton
                onClick={toggleRecording}
                disabled={loading || isProcessing}
                className="micButton"
                aria-label="Start voice recording"
            >
                <MicIcon fontSize="large" />
            </IconButton>
            
            <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type or speak your message..."
                variant="outlined"
                disabled={isProcessing}
                className="chatTextField"
                inputProps={{ "aria-label": "Type your message" }}
            />
            
            <IconButton
                onClick={handleSend}
                disabled={loading || isProcessing || !input.trim()}
                className="sendButton"
                aria-label="Send message"
            >
                {loading || isProcessing ? (
                    <CircularProgress size={24} color="inherit" />
                ) : (
                    <SendIcon fontSize="large" />
                )}
            </IconButton>
        </div>
    );
}
