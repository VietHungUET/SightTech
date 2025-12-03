import { useEffect, useState } from "react";
import { speech } from "../utils/utils.jsx";
import logo from "../assets/logo.png";
import "./Home.css";

const INTRO_MESSAGE =
  "Hello and welcome to SightTech! SightTech is an AI-powered application designed to assist visually impaired users with various tasks including object detection, currency recognition, music identification, chatbot assistance, and news reading. Explore the features using the navigation bar. Thank you for using SightTech!";

const Home = () => {
  const [statusText] = useState("Welcome to SightTech");

  useEffect(() => {
    speech(INTRO_MESSAGE);

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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
        </div>
      </section>

      {/* Wave decoration */}
      <div className="wave-decoration"></div>
    </div>
  );
};

export default Home;