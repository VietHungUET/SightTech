import React, { useRef, useCallback, useState, forwardRef } from "react";
import { Button } from "@mui/material";
import { Videocam, VideocamOff, Mic, MicOff } from "@mui/icons-material";
import Webcam from "react-webcam";
import "./WebCam.css";

const WebCam = forwardRef((props, ref) => {
  const [camOpen, setCamOpen] = useState(true);
  const [micOpen, setMicOpen] = useState(true);

  // const videoConstraints = {
  //     width: 1280,
  //     height: 720,
  //     facingMode: "user",
  // };

  const toggleMic = () => {
    setMicOpen(!micOpen);
  };

  const toggleCamera = () => {
    setCamOpen(!camOpen);
  };

  return (
    <div className="webcam">
      {camOpen && (
        <Webcam
          className="camera"
          audio={false}
          ref={ref}
          //videoConstraints={videoConstraints}
          screenshotFormat="image/jpeg"
          mirrored={false}
        />
      )}
      <div className="webcam-controls">
        <Button variant="contained" onClick={toggleCamera}>
          {camOpen ? <Videocam /> : <VideocamOff />}
        </Button>
        <Button variant="contained" onClick={toggleMic}>
          {micOpen ? <Mic /> : <MicOff />}
        </Button>
      </div>
    </div>
  );
});

export default WebCam;
