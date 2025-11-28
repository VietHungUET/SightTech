import { useRef, useEffect, useState } from 'react';
import { Container, Card, Chip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import ChatMessage from '../components/chat/ChatMessage';
import ChatInput from '../components/chat/ChatInput';
import userAPI from '../utils/userAPI';
import './ChatBot.css';

export default function ChatBot() {
    const chatContainerRef = useRef(null);
    const [isListening, setIsListening] = useState(false);
    
    // Chat state
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Voice state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState([]);
    const utteranceRef = useRef(null);

    // Load voices on mount
    useEffect(() => {
        const introduction = "This is Chatbot mode";

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

    // Text-to-speech function
    const speak = (text, options = {}) => {
        window.speechSynthesis.cancel();
        if (!text) return;

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
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);

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
            speak(botReply, { rate: 1.5 });
            
        } catch (error) {
            console.error('Error sending message to chatbot:', error);
            const errorMessage = { 
                sender: 'bot', 
                text: 'Sorry, something went wrong. Please try again.',
                timestamp: new Date()
            };
            setMessages((prev) => [...prev, errorMessage]);
            speak('Sorry, something went wrong. Please try again.');
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

    return (
        <Container maxWidth="lg" className="chatbotContainer">
            {/* Header with Title and Status */}
            <div className="chatbotHeader">
                <div className="chatbotHeaderRow">
                    <h1 className="chatbotTitle">Chatbot</h1>
                    {/* Status Chip */}
                    {isListening ? (
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
                            <MicIcon className="emptyStateIcon" />
                            <h2 className="emptyStateTitle">Start a conversation</h2>
                            <p className="emptyStateHint">
                                Type a message or tap the microphone to speak
                            </p>
                        </div>
                    )}
                </div>

                {/* Input and Send Button */}
                <ChatInput 
                    onSend={sendMessage} 
                    loading={loading}
                    onRecordingChange={setIsListening}
                    onStopSpeaking={stopSpeaking}
                />
            </Card>
        </Container>
    );
}
