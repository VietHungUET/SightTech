import axios from "axios";

const axiosClient = axios.create({
    baseURL: "http://localhost:8000",
    headers: {
        "Content-Type": "multipart/form-data",
    },
});

const userAPI = {
    postDocumentRecognition: (imageData) => {
        const url = "/document_recognition";
        return axiosClient.post(url, imageData);
    },
}

export default userAPI;