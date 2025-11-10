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




