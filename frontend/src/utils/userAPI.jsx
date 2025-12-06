import axios from "axios";

const axiosClient = axios.create({
  baseURL: "http://localhost:8000",
  headers: {
    "Content-Type": "multipart/form-data",
  },
});

export const API_BASE_URL = axiosClient.defaults.baseURL;
export const WS_BASE_URL = "ws://localhost:8000";

const userAPI = {
    postDocumentRecognition: (imageData) => {
        const url = "/document_recognition";
        return axiosClient.post(url, imageData);
    },

    postCurrencyDetection: (imageData) => {
        const url = "/currency_detection";
        return axiosClient.post(url, imageData);
    },

    postBarcodeScan: (imageData) => {
        const url = "/barcode/scan";
        return axiosClient.post(url, imageData);
    },

    postVoiceCommand: (audioData) => {
        const url = "/transcribe_audio_v2";
        return axiosClient.post(url, audioData);
    },

    transcribeOnboarding: (audioData) => {
        const url = "/transcribe_audio_simple";
        return axiosClient.post(url, audioData);
    },

    postMusicDetection: (audioData) => {
        const url = "/music_detection";
        return axiosClient.post(url, audioData);
    },

    postChatbot: (data) => {
        const url = "/chatbot";
        return axiosClient.post(url, data);
    },

    postGeneralQuestionAnswering: (message) => {
        const url = "/general_question_answering";
        const formData = new FormData();
        formData.append('message', message);
        return axiosClient.post(url, formData);
    },

    postImageCaptioning: (imageData) => {
        const url = "/image_captioning";
        return axiosClient.post(url, imageData);
    },

    // Real-time description endpoints
    startRealtimeDescription: () => {
        const url = "/realtime-description/start";
        return axiosClient.post(url);
    },

    stopRealtimeDescription: () => {
        const url = "/realtime-description/stop";
        return axiosClient.post(url);
    },

    getRealtimeDescriptionStatus: () => {
        const url = "/realtime-description/status";
        return axiosClient.get(url);
    },
}

export default userAPI;