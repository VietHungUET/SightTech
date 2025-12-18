import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Card, Chip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import ChatMessage from '../components/chat/ChatMessage';
import ChatInput from '../components/chat/ChatInput';
import userAPI from '../utils/userAPI';
import './ChatBot.css';

export default function ChatBot() {
    const navigate = useNavigate();
    const chatContainerRef = useRef(null);
    const recognitionRef = useRef(null);
    const isMountedRef = useRef(true);
    const restartTimeoutRef = useRef(null);
    const isSpeakingInternalRef = useRef(false);
    const pendingTranscriptRef = useRef('');
    const sendMessageTimeoutRef = useRef(null);
    const inactivityTimeoutRef = useRef(null);      // Auto-stop if no speech
    const lastResultTimeRef = useRef(null);         // Track last speech result time
    
    const [isListening, setIsListening] = useState(false);
    const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false);
    
    // Chat state
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Voice state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState([]);
    const utteranceRef = useRef(null);

    // Voice Recognition Helper Functions
    const startVoiceRecognition = useCallback(() => {
        if (!recognitionRef.current || recognitionRef.current.isActive || !isMountedRef.current || isSpeakingInternalRef.current) return;

        try {
            recognitionRef.current.start();
            recognitionRef.current.isActive = true;
            setIsVoiceCommandActive(true);
            lastResultTimeRef.current = Date.now();
            console.log('Voice recognition started');

            // Auto-stop after 5s if no speech result
            if (inactivityTimeoutRef.current) {
                clearTimeout(inactivityTimeoutRef.current);
            }
            inactivityTimeoutRef.current = setTimeout(() => {
                if (!recognitionRef.current || !recognitionRef.current.isActive) return;

                const now = Date.now();
                const last = lastResultTimeRef.current || 0;
                if (now - last >= 5000) {
                    console.log('⏹️ No speech detected within timeout, stopping voice recognition');
                    try {
                        recognitionRef.current.stop();
                    } catch (e) {
                        console.error('Failed to stop recognition on inactivity:', e);
                    }
                }
            }, 4000);
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

            if (inactivityTimeoutRef.current) {
                clearTimeout(inactivityTimeoutRef.current);
                inactivityTimeoutRef.current = null;
            }
        } catch (e) {
            console.error('Failed to stop voice recognition:', e);
        }
    }, []);

    // Load voices on mount
    useEffect(() => {
        const introduction = "This is Chatbot mode. Press the Space key to start a voice command.";

        const loadVoices = () => {
            const availableVoices = window.speechSynthesis.getVoices();
            setVoices(availableVoices);
        };

        loadVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = loadVoices;
        }

        const introTimer = setTimeout(() => {
            speak(introduction);
        }, 200);

        return () => {
            clearTimeout(introTimer);
            window.speechSynthesis.cancel();
        };
    }, []);

    // Initialize Voice Recognition
    useEffect(() => {
        isMountedRef.current = true;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            recognition.isActive = false;

            recognition.onresult = (event) => {
                if (isSpeakingInternalRef.current) {
                    console.log('Ignoring voice command while speaking');
                    return;
                }

                lastResultTimeRef.current = Date.now();

                const transcript = event.results[event.results.length - 1][0].transcript.trim();
                console.log('Voice command received:', transcript);

                const lowerTranscript = transcript.toLowerCase();
                let isNavigationCommand = false;

                // Check for navigation commands - execute immediately
                if (lowerTranscript.includes('switch to') || lowerTranscript.includes('open') || lowerTranscript.includes('go to') || lowerTranscript.includes('i want to use')) {
                    // Clear any pending message
                    if (sendMessageTimeoutRef.current) {
                        clearTimeout(sendMessageTimeoutRef.current);
                        sendMessageTimeoutRef.current = null;
                    }
                    pendingTranscriptRef.current = '';

                    if (lowerTranscript.includes('object')) {
                        navigate('/image/object');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('currency') || lowerTranscript.includes('money')) {
                        navigate('/image/currency');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('barcode') || lowerTranscript.includes('product')) {
                        navigate('/image/barcode');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('text') || lowerTranscript.includes('document')) {
                        navigate('/image/text');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('news')) {
                        navigate('/news');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('music')) {
                        navigate('/music');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('navigation')) {
                        navigate('/navigation');
                        isNavigationCommand = true;
                    } else if (lowerTranscript.includes('home')) {
                        navigate('/');
                        isNavigationCommand = true;
                    }
                }

                // If not a navigation command, accumulate transcript with debounce
                if (!isNavigationCommand) {
                    // Add to pending transcript
                    if (pendingTranscriptRef.current) {
                        pendingTranscriptRef.current += ' ' + transcript;
                    } else {
                        pendingTranscriptRef.current = transcript;
                    }

                    console.log('Accumulated transcript:', pendingTranscriptRef.current);

                    // Clear existing timeout
                    if (sendMessageTimeoutRef.current) {
                        clearTimeout(sendMessageTimeoutRef.current);
                    }

                    // Set new timeout to send message after 2.5 seconds of silence
                    sendMessageTimeoutRef.current = setTimeout(() => {
                        const messageToSend = pendingTranscriptRef.current.trim();
                        if (messageToSend) {
                            console.log('Sending accumulated message:', messageToSend);
                            sendMessage(messageToSend);
                        }
                        pendingTranscriptRef.current = '';
                        sendMessageTimeoutRef.current = null;
                    }, 2000);
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'no-speech') {
                    return;
                }
                recognition.isActive = false;
                setIsVoiceCommandActive(false);

                if (restartTimeoutRef.current) {
                    clearTimeout(restartTimeoutRef.current);
                }
            };

            recognition.onend = () => {
                recognition.isActive = false;
                setIsVoiceCommandActive(false);

                if (restartTimeoutRef.current) {
                    clearTimeout(restartTimeoutRef.current);
                }

                if (!isMountedRef.current) {
                    return;
                }
            };

            recognition.onstart = () => {
                recognition.isActive = true;
                setIsVoiceCommandActive(true);
            };

            recognitionRef.current = recognition;
        }

        return () => {
            console.log('Component unmounting, cleaning up...');
            isMountedRef.current = false;

            if (restartTimeoutRef.current) {
                clearTimeout(restartTimeoutRef.current);
            }

            if (inactivityTimeoutRef.current) {
                clearTimeout(inactivityTimeoutRef.current);
            }

            if (sendMessageTimeoutRef.current) {
                clearTimeout(sendMessageTimeoutRef.current);
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
    }, [navigate, startVoiceRecognition]);

    // Text-to-speech function
    const speak = (text, options = {}) => {
        // Stop voice recognition while speaking
        isSpeakingInternalRef.current = true;
        stopVoiceRecognition();
        
        window.speechSynthesis.cancel();
        if (!text) {
            isSpeakingInternalRef.current = false;
            if (isMountedRef.current) startVoiceRecognition();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utteranceRef.current = utterance;

        const englishVoice = voices.find(
            voice => voice.lang.startsWith('en') && voice.localService
        ) || voices.find(voice => voice.lang.startsWith('en'));

        if (englishVoice) {
            utterance.voice = englishVoice;
        }

        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;
        utterance.lang = options.lang || 'en-US';

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            // Resume voice recognition after speaking
            setTimeout(() => {
                isSpeakingInternalRef.current = false;
            }, 1000);
        };
        utterance.onerror = () => {
            setIsSpeaking(false);
            isSpeakingInternalRef.current = false;
        };

        window.speechSynthesis.speak(utterance);
    };

    // Stop speaking function
    const stopSpeaking = () => {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    };

    // Send message to chatbot
    const sendMessage = async (text) => {
        const userMessage = { sender: 'user', text, timestamp: new Date() };
        setMessages((prev) => [...prev, userMessage]);
        setLoading(true);
        
        try {
            const response = await userAPI.postGeneralQuestionAnswering(text);
            const data = response.data;
            
            const botReply = data.reply || data.response || data.answer || 'Sorry, I could not understand that.';
            
            const botMessage = { 
                sender: 'bot', 
                text: botReply,
                timestamp: new Date()
            };
            
            setMessages((prev) => [...prev, botMessage]);
            // Speak a bit slower for better comprehension
            speak(botReply, { rate: 1.1 });
            
        } catch (error) {
            console.error('Error sending message to chatbot:', error);
            const errorMessage = { 
                sender: 'bot', 
                text: 'Sorry, something went wrong. Please try again.',
                timestamp: new Date()
            };
            setMessages((prev) => [...prev, errorMessage]);
            speak('Sorry, something went wrong. Please try again.', { rate: 1.1 });
        } finally {
            setLoading(false);
        }
    };

    // Auto scroll to bottom when messages change
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);

    // Toggle helper so Space và icon mic cùng một logic
    const toggleVoiceRecognition = useCallback(() => {
        if (recognitionRef.current && recognitionRef.current.isActive) {
            stopVoiceRecognition();
        } else {
            startVoiceRecognition();
        }
    }, [startVoiceRecognition, stopVoiceRecognition]);

    // Keyboard shortcut: Space to toggle voice recognition
    useEffect(() => {
        const handleKeyDown = (event) => {
            const target = event.target;
            const isTypingElement =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            if (isTypingElement) return;

            if (event.code === 'Space' || event.key === ' ') {
                event.preventDefault();

                if (recognitionRef.current && recognitionRef.current.isActive) {
                    stopVoiceRecognition();
                } else {
                    startVoiceRecognition();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [startVoiceRecognition, stopVoiceRecognition]);

    return (
        <Container maxWidth="lg" className="chatbotContainer">
            {/* Header with Title and Status */}
            <div className="chatbotHeader">
                <div className="chatbotHeaderRow">
                    <h1 className="chatbotTitle">Chatbot</h1>
                    {/* Status Chip */}
                    {isVoiceCommandActive ? (
                        <Chip
                            icon={<MicIcon />}
                            label="Listening..."
                            color="error"
                            className="statusChip statusChipPulse"
                        />
                    ) : isSpeaking ? (
                        <Chip
                            label="Speaking..."
                            color="success"
                            className="statusChip statusChipPulse"
                        />
                    ) : loading ? (
                        <Chip
                            label="Thinking..."
                            color="warning"
                            className="statusChip statusChipPulse"
                        />
                    ) : (
                        <Chip
                            label="Ready"
                            color="primary"
                            className="statusChip"
                        />
                    )}
                </div>
                <p className="chatbotDescription">
                    Ask me anything by typing or using voice inputs.
                </p>
            </div>

            {/* Chat Box */}
            <Card elevation={2} className="chatCard">
                {/* Chat Messages */}
                <div
                    ref={chatContainerRef}
                    className="messagesContainer"
                    aria-live="polite"
                    aria-label="Chat messages"
                >
                    {messages.length > 0 ? (
                        messages.map((msg, i) => (
                            <ChatMessage key={i} message={msg} />
                        ))
                    ) : (
                        <div className="emptyState">
                            <h2 className="emptyStateTitle">Start a conversation</h2>
                            <p className="emptyStateHint">
                                Type a message, tap the microphone, or press the Space key to speak
                            </p>
                        </div>
                    )}
                </div>

                {/* Input and Send Button */}
                <ChatInput 
                    onSend={sendMessage} 
                    loading={loading}
                    isListening={isVoiceCommandActive}
                    onToggleMic={toggleVoiceRecognition}
                />
            </Card>
        </Container>
    );
}
