import { useState } from 'react';
import { TextField, IconButton, CircularProgress } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import SendIcon from "@mui/icons-material/Send";
import './ChatInput.css';

export default function ChatInput({ onSend, loading, isListening, onToggleMic }) {
    const [input, setInput] = useState('');

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

    // Text input + simple mic button (no waveform recording)
    return (
        <div className="inputContainer">
            <IconButton
                onClick={onToggleMic}
                disabled={loading}
                className={`micButton ${isListening ? 'micButtonListening' : ''}`}
                aria-label={isListening ? "Stop listening" : "Start voice command"}
            >
                {isListening ? <StopIcon fontSize="large" /> : <MicIcon fontSize="large" />}
            </IconButton>
            
            <TextField
                fullWidth
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type or speak your message..."
                variant="outlined"
                disabled={false}
                className="chatTextField"
                inputProps={{ "aria-label": "Type your message" }}
            />
            
            <IconButton
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="sendButton"
                aria-label="Send message"
            >
                {loading ? (
                    <CircularProgress size={24} color="inherit" />
                ) : (
                    <SendIcon fontSize="large" />
                )}
            </IconButton>
        </div>
    );
}
