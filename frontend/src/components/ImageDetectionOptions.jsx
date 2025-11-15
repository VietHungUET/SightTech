import './ImageDetectionOptions.css';
import { Stack, Paper, Typography, Box } from '@mui/material';
import { CameraAlt, Article, MonetizationOnRounded, QrCodeScanner } from '@mui/icons-material';
import {useState} from "react";

export default function ImageDetectionOptions() {

    const [selected, setSelected] = useState(null);

    const options = [
        { label: 'Object detection', icon: <CameraAlt /> },
        { label: 'Text detection', icon: <Article /> },
        { label: 'Currency detection', icon: <MonetizationOnRounded /> },
        { label: 'Bar code scanner', icon: <QrCodeScanner /> }
    ];

    return (
        <Stack spacing={2} className="options">
            {options.map((option, index) => (
                <Paper key={index}
                       elevation={2}
                       className={`option-card ${selected === index ? 'selected' : ''}`}
                       onClick={() => setSelected(index)}>
                    <Box className="option-icon">{option.icon}</Box>
                    <Typography variant="body1">{option.label}</Typography>
                </Paper>
            ))}
        </Stack>
    );
}