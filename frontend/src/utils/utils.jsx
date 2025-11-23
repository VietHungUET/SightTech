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
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(content);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}
