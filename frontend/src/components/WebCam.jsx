import React, {useRef, useCallback, useState} from "react";
import {Button} from "@mui/material";
import {Videocam, VideocamOff, Mic, MicOff} from "@mui/icons-material";
import Webcam from "react-webcam";
import "./WebCam.css"

export default function WebCam() {
    const webcamRef = useRef(null);
    const [camOpen, setCamOpen] = useState(false);
    const [micOpen, setMicOpen] = useState(false);

    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot();
        console.log(imageSrc);
    }, [webcamRef]);

    // const videoConstraints = {
    //     width: 1280,
    //     height: 720,
    //     facingMode: "user",
    // };

    const toggleMic = () => {
        setMicOpen(!micOpen);
    }

    const toggleCamera = () => {
        setCamOpen(!camOpen);
    }

    return (
        <div className="webcam">
            {camOpen &&
            <Webcam
                className="camera"
                audio={micOpen}
                ref={webcamRef}
                //videoConstraints={videoConstraints}
                screenshotFormat="image/jpeg"
                mirrored={true}
            />
            }
            <div className="webcam-controls">
                <Button
                    variant="contained"
                    onClick={toggleCamera}
                >
                    {camOpen ? <Videocam /> : <VideocamOff />}
                </Button>
                <Button
                    variant="contained"
                    onClick={toggleMic}
                >
                    {micOpen ? <Mic /> : <MicOff />}
                </Button>
            </div>
        </div>
    );
}
