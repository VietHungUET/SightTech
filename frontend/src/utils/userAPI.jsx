import axios from "axios";

const axiosClient = axios.create({
    baseURL: "http://localhost:8000",
    headers: {
        "Content-Type": "multipart/form-data",
    },
});

export const API_BASE_URL = axiosClient.defaults.baseURL;

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
}

export default userAPI;