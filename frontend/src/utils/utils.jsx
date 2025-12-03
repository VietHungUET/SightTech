export function dataURLtoBlob(dataURL) {
    const [header, base64] = dataURL.split(",");
    const mime = header.match(/data:(.*?);base64/)[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
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
            
            // Chọn giọng chất lượng cao - ưu tiên Microsoft Zira
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes("Zira")) ||
                voices.find(v => 
                    v.lang.startsWith("en") && 
                    (v.name.includes("Google") || 
                     v.name.includes("Samantha") || 
                     v.name.includes("Enhanced"))
                ) || voices.find(v => v.lang.startsWith("en"));
            
            if (preferredVoice) {
                utter.voice = preferredVoice;
            }
            
            // Cài đặt tốc độ và âm lượng
            utter.rate = 0.9;      // Tốc độ chậm hơn một chút
            utter.pitch = 0.9;     
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
