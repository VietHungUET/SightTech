import { useEffect, useState, useRef, useCallback } from "react";
import { speech } from "../utils/utils.jsx";
import MicButton from "../components/MicButton.jsx";
import logo from "../assets/logo.png";
import "./Home.css";

const INTRO_MESSAGE =
  "Welcome to SightTech! SightTech is an AI-powered application designed to assist visually impaired users. You can say commands like 'Open Object Detection', 'Go to News' to navigate.";

const Home = () => {
  const [introComplete, setIntroComplete] = useState(false);
  const hasSpokenRef = useRef(false);

  // Speak intro and set introComplete when done
  const speakIntro = useCallback(async () => {
    if (hasSpokenRef.current) return;
    hasSpokenRef.current = true;
    
    await speech(INTRO_MESSAGE);
    setIntroComplete(true);
  }, []);

  useEffect(() => {
    // Delay to let voices load
    const timer = setTimeout(() => {
      speakIntro();
    }, 800);

    return () => {
      clearTimeout(timer);
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speakIntro]);

  return (
    <div className="home-container">
      {/* Decorative leaves */}
      <div className="leaf leaf-1"></div>
      <div className="leaf leaf-2"></div>
      <div className="leaf leaf-3"></div>
      <div className="leaf leaf-4"></div>
      <div className="leaf leaf-5"></div>
      <div className="leaf leaf-6"></div>
      <div className="leaf leaf-7"></div>
      <div className="leaf leaf-8"></div>

      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-content">
          <div className="logo-wrapper">
            <span className="logo-text">SightTech</span>
            <img src={logo} alt="SightTech Logo" className="logo" />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Illuminating Your World with AI
          </h1>
          <p className="hero-description">
            SightTech provides AI-powered assistance for object detection,<br />
            currency recognition, music identification, chatbot support,<br />
            and news reading - making the world more accessible for everyone.
          </p>

          {/* Mic Button with Voice Activation */}
          <div className="mic-section">
            <MicButton onIntroComplete={introComplete} />
          </div>
        </div>
      </section>

      {/* Wave decoration */}
      <div className="wave-decoration"></div>
    </div>
  );
};

export default Home;