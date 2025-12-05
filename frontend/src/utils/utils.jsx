export function dataURLtoBlob(dataURL) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/data:(.*?);base64/)[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

export function isSpeaking() {
    return window.speechSynthesis && window.speechSynthesis.speaking;
}

export function speech(content) {
    return new Promise((resolve) => {
        if (!window.speechSynthesis) {
            resolve();
            return;
        }
        window.speechSynthesis.cancel();
        
        const speak = () => {
            const utter = new SpeechSynthesisUtterance(content);
            
            // Chọn giọng theo thứ tự ưu tiên (hỗ trợ cả Chrome và Edge/Windows)
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = 
                // Microsoft voices (Edge/Windows)
                voices.find(v => v.name.includes("Zira")) ||
                voices.find(v => v.name.includes("Microsoft") && v.lang.startsWith("en")) ||
                // Google voices (Chrome)
                voices.find(v => v.name.includes("Google") && v.lang.startsWith("en-US")) ||
                voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) ||
                // macOS voices
                voices.find(v => v.name.includes("Samantha")) ||
                // Fallback to any English voice
                voices.find(v => v.lang.startsWith("en-US")) ||
                voices.find(v => v.lang.startsWith("en"));
            
            if (preferredVoice) {
                utter.voice = preferredVoice;
            }
            
            // Cài đặt tốc độ và âm lượng
            utter.rate = 0.8;      // Tốc độ vừa phải
            utter.pitch = 1.0;     
            utter.volume = 1.0;    
            
            utter.onend = () => resolve();
            utter.onerror = () => resolve();
            window.speechSynthesis.speak(utter);
        };
        
        // Đảm bảo voices đã load
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            speak();
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                speak();
            };
        }
    });
}
