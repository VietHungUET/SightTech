# SightTech - Setup and Installation Guide

## Overview
SightTech is an AI-powered application designed to assist visually impaired users with various tasks including object detection, currency recognition, music identification, and more.

---

## Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Python** (v3.8 or higher) - [Download here](https://www.python.org/downloads/)
- **pip** (Python package manager, usually comes with Python)
 **Git** (for cloning the repository)

---

## Features

SightTech offers an AI-powered, voice-first interface designed specifically for visually impaired users, with the following core features:

🏠** Home Page**

The Home Page serves as the central hub of the application, providing an accessible and intuitive entry point for all features.
It includes a large voice interaction button that allows users to control the system through speech commands.
A minimal and high-contrast interface, combined with clear icons and audio feedback, ensures ease of navigation for users with visual impairments.
<img width="753" height="424" alt="image" src="https://github.com/user-attachments/assets/3c261b1a-cefa-4f2c-9512-0df5fbd8c823" />


🔍** Object Detection**

Uses computer vision to detect and identify objects in the surrounding environment.
The system provides real-time audio feedback, helping users recognize nearby objects and avoid obstacles.

🗣️** Real-time Description**

Continuously analyzes the environment and generates spoken descriptions of scenes, objects, and contextual changes, enhancing situational awareness.

📝 **Text Recognition (OCR)**

Extracts text from images or camera input and reads it aloud, enabling users to access printed materials such as signs, documents, and labels.

🧭 **Navigation**

Assists users in movement and orientation by providing voice-guided directions, supporting safer and more confident navigation.

<img width="752" height="423" alt="image" src="https://github.com/user-attachments/assets/3a5880da-5bec-40b8-9ad9-4e12ffaa9bd0" />


💬 **Chatbot**

An AI-based conversational assistant that answers questions, explains information, and supports users via voice or text interaction.
<img width="753" height="424" alt="image" src="https://github.com/user-attachments/assets/5199ad5e-e7d3-49d5-8178-70825b5f5735" />

📰 **News**

Allows users to search for, browse, and listen to news content using voice commands, ensuring convenient access to up-to-date information.
<img width="752" height="423" alt="image" src="https://github.com/user-attachments/assets/a29e45b9-beac-4af0-92e2-f37f8158ea96" />


🎵 **Music Detection**

Identifies music playing in the environment and provides details such as song title and artist through audio feedback.
<img width="753" height="424" alt="image" src="https://github.com/user-attachments/assets/1550e8dd-b1b6-4706-9a24-49aea78fd3f1" />


## Backend Setup

### 1. Navigate to the backend directory:

```bash
cd backend
```

### 2. Create a virtual environment and activate it:

**On Windows (CMD):**
```cmd
python -m venv venv
.\venv\Scripts\Activate.ps1  
```

**On macOS/Linux:**
```bash
python -m venv venv
source venv/bin/activate
```

### 3. Install the required Python dependencies:

```bash
pip install -r requirements.txt
```

### 4. Create a `.env` file in the `backend` directory:

Create a new file named `.env`



**How to obtain API keys:**
- **Audd.io API Key**: Sign up at [https://audd.io/](https://audd.io/) (Free tier: 50 requests/day)
- **OpenAI API Key**: Sign up at [https://platform.openai.com/](https://platform.openai.com/)
- **Groq API Key**: Sign up at [https://console.groq.com/](https://console.groq.com/) (Free unlimited)
- **Google API Key**: Get from [Google Cloud Console](https://console.cloud.google.com/)
- **Deepgram API Key**: Sign up at [https://console.deepgram.com/](https://console.deepgram.com/) (Free tier: $200 credit, ~45,000 minutes of audio transcription)

### 5. Start the backend server:

```bash
uvicorn app.main:app --reload
```

The backend will be available at: `http://localhost:8000`

To view API documentation, visit: `http://localhost:8000/docs`

---

## Frontend Setup

### 1. Navigate to the frontend directory:

```bash
cd frontend
```

### 2. Install the required dependencies:

```bash
npm install
```

### 3. Start the development server:

```bash
npm run dev
```




