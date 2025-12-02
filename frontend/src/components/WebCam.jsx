import React, { forwardRef } from "react";
import Webcam from "react-webcam";
import "./WebCam.css";

const WebCam = forwardRef(({ children }, ref) => {
    return (
        <div className="webcam">
            <Webcam
                className="camera"
                audio={false}
                ref={ref}
                //videoConstraints={videoConstraints}
                screenshotFormat="image/jpeg"
                mirrored={false}
            />
            {children}
        </div>
    );
});

export default WebCam;
