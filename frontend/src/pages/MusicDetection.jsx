import React, {useState, useRef, useEffect} from 'react';
import {Button} from '@mui/material'
import userAPI, {API_BASE_URL} from "../utils/userAPI.jsx";
import {speech} from "../utils/utils.jsx";
import {KeyboardVoice, StopCircle} from "@mui/icons-material";

export default function MusicDetection() {
    const [isListening, setIsListening] = useState(false);
    const [result, setResult] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        const introduction = (
            "This is the Music Detection mode."
        );
        speech(introduction);
    }, []);

    const startListening = async () => {
        try {
            setResult(null);
            audioChunksRef.current = [];

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await processAudio(audioBlob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsListening(true);
        } catch (err) {
            speech('Microphone access denied. Please allow microphone access.');
        }
    };

    const stopListening = () => {
        if (mediaRecorderRef.current && isListening) {
            mediaRecorderRef.current.stop();
            setIsListening(false);
            setIsProcessing(true);
            speech("Stop Listening. Processing the music");
        }
    };

    const processAudio = async (audioBlob) => {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');

            const response = await userAPI.postMusicDetection(formData);
            const data = response.data;

            console.log(data);

            if (data.success) {
                setResult({
                    type: data.type,
                    title: data.music_info?.title,
                    artist: data.music_info?.artist,
                    album: data.music_info?.album,
                    coverImage: data.music_info?.spotify?.artwork?.large,
                    releaseDate: data.music_info?.release_date,
                    audioPath: data.audio_path ? `${API_BASE_URL}${data.audio_path}` : null,
                    timestamp: new Date().toLocaleTimeString()
                });
                console.log(data);
                setTimeout(() => {
                speech("The song is " + data.music_info?.title
                    + ". It was composed by " + data.music_info?.artist
                    + "and released on " + data.music_info?.release_date);
                }, 1000);
            } else {
                speech('Unable to identify the music. Please try again.');
            }
            setIsProcessing(false);
        } catch (err) {
            speech('Error processing audio: ' + (err.response?.data?.detail || err.message));
            setIsProcessing(false);
        }
    };

    return (
        <div>
            <Button
                variant={isListening ? "contained" : "outlined"}
                color={isListening ? "error" : "primary"}
                onClick={isListening ? stopListening : startListening}
                startIcon={isListening ? <StopCircle /> : <KeyboardVoice />}
            >
                {isListening ? "Stop Listening" : "Start Listening"}
            </Button>
            {isListening && <span className="voice-status">Listening...</span>}
            <div>
                {isProcessing ? "Processing..." :
                    result &&
                    <div>
                        <div>
                            {"result : " + "The song is " + result.title
                            + ". It was composed by " + result.artist
                            + " and released on " + result.releaseDate}
                        </div>
                        <div style={{width : "200px", height : "200px"}}>
                            <img src={result.coverImage} alt="" style={{width:'100%', height:'100%'}} />
                        </div>
                    </div>
                }

            </div>
        </div>
    );
}