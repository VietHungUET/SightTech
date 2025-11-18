import './ImageDetectionOptions.css';
import { Stack, Paper, Typography, Box } from '@mui/material';
import { CameraAlt, Article, MonetizationOnRounded, QrCodeScanner } from '@mui/icons-material';
import {useState} from "react";

export default function ImageDetectionOptions({setDetectionType}) {

    const [selected, setSelected] = useState(0);

    const options = [
        {type: 'Object', label: 'Object detection', icon: <CameraAlt /> },
        {type: 'Text', label: 'Text detection', icon: <Article /> },
        {type: 'Currency', label: 'Currency detection', icon: <MonetizationOnRounded /> },
        {type: 'Barcode', label: 'Bar code scanner', icon: <QrCodeScanner /> }
    ];

    return (
        <Stack spacing={2} className="options">
            {options.map((option, index) => (
                <Paper key={index}
                       elevation={2}
                       className={`option-card ${selected === index ? 'selected' : ''}`}
                       onClick={() => {
                           setSelected(index);
                           setDetectionType(option.type);
                       }}>
                    <Box className="option-icon">{option.icon}</Box>
                    <Typography variant="body1">{option.label}</Typography>
                </Paper>
            ))}
        </Stack>
    );
}