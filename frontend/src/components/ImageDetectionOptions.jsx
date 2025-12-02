import './ImageDetectionOptions.css';
import { Stack, Paper, Box, Typography } from '@mui/material';
import { CameraAlt, Article, MonetizationOnRounded, QrCodeScanner } from '@mui/icons-material';
import { useState } from "react";
import { speech } from "../utils/utils.jsx";

export default function ImageDetectionOptions({ setDetectionType }) {
    const [selected, setSelected] = useState(0);

    const options = [
        { type: 'Object', label: 'Object detection', icon: <CameraAlt /> },
        { type: 'Text', label: 'Text detection', icon: <Article /> },
        { type: 'Currency', label: 'Currency detection', icon: <MonetizationOnRounded /> },
        { type: 'Barcode', label: 'Barcode scanner', icon: <QrCodeScanner /> }
    ];

    return (
        <Stack
            spacing={2.5}
            className="options"
            role="radiogroup"
            aria-label="Choose detection mode"
        >
            {options.map((option, index) => (
                <Paper
                    key={option.type}
                    component="button"
                    type="button"
                    elevation={selected === index ? 3 : 1}
                    className={`option-card ${selected === index ? 'selected' : ''}`}
                    role="radio"
                    aria-checked={selected === index}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => {
                        setSelected(index);
                        setDetectionType(option.type);
                        speech("Switched to " + option.label + ".");
                    }}
                >
                    <Box 
                        className="option-icon" 
                        aria-hidden="true"
                    >
                        {option.icon}
                    </Box>
                    <Typography 
                        className="option-label"
                        variant="body1"
                        component="span"
                        fontWeight="600"
                    >
                        {option.label}
                    </Typography>
                </Paper>
            ))}
        </Stack>
    );
}