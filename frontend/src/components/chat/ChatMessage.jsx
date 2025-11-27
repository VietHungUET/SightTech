import ReactMarkdown from "react-markdown";
import './ChatMessage.css';

export default function ChatMessage({ message }) {
    const isUser = message.sender === 'user';

    return (
        <div
            className={`messageWrapper ${isUser ? 'userMessage' : 'botMessage'}`}
            aria-label={isUser ? 'Your message' : 'Assistant message'}
        >
            <div className={`messageBubble ${isUser ? 'userBubble' : 'botBubble'}`}>
                <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
        </div>
    );
}
