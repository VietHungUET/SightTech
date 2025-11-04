import React, { useRef, useCallback } from "react";
import Webcam from "react-webcam";
import "./WebCam.css"

export default function WebCam() {
    const webcamRef = useRef(null);

    const capture = useCallback(() => {
        const imageSrc = webcamRef.current.getScreenshot();
        console.log(imageSrc);
    }, [webcamRef]);

    // const videoConstraints = {
    //     width: 1280,
    //     height: 720,
    //     facingMode: "user",
    // };

    return (
        <div className="webcam">
            <Webcam
                audio={false}
                ref={webcamRef}
                //videoConstraints={videoConstraints}
                screenshotFormat="image/jpeg"
                mirrored={true}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                }}
            />
        </div>
    );
}
