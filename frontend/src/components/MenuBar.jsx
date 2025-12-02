import { NavLink } from "react-router-dom";
import "./MenuBar.css";
import {
    HomeOutlined,
    CameraAltOutlined,
    ArticleOutlined,
    MonetizationOnOutlined,
    QrCodeScannerOutlined,
    MusicNoteOutlined,
    SmartToyOutlined,
    NewspaperOutlined,
    VisibilityOutlined,
} from "@mui/icons-material";
import { Tooltip } from "@mui/material";

export default function MenuBar() {
    const navItems = [
        { to: "/", icon: <HomeOutlined fontSize="large" />, label: "Home" },
        { to: "/image/object", icon: <CameraAltOutlined fontSize="large" />, label: "Objects" },
        { to: "/image/text", icon: <ArticleOutlined fontSize="large" />, label: "Text" },
        { to: "/image/currency", icon: <MonetizationOnOutlined fontSize="large" />, label: "Currency" },
        { to: "/image/barcode", icon: <QrCodeScannerOutlined fontSize="large" />, label: "Barcode" },
        { to: "/music", icon: <MusicNoteOutlined fontSize="large" />, label: "Music" },
        { to: "/chatbot", icon: <SmartToyOutlined fontSize="large" />, label: "Chat" },
        { to: "/news", icon: <NewspaperOutlined fontSize="large" />, label: "News" },
    ];

    return (
        <nav className="main-nav" role="navigation" aria-label="Main navigation">
            {/* Logo Hidden in Mobile Bottom Nav (optional) */}
            <div className="nav-brand">
                <VisibilityOutlined className="brand-icon" aria-hidden="true" />
                <span className="brand-name">SightTech</span>
            </div>

            {/* Navigation Links */}
            <div className="nav-links" role="menubar">
                {navItems.map((item) => (
                    <Tooltip key={item.to} title={item.label} arrow placement="top">
                        <NavLink
                            to={item.to}
                            className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                            role="menuitem"
                            aria-label={item.label}
                        >
                            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                        </NavLink>
                    </Tooltip>
                ))}
            </div>
        </nav>
    );
}