# Smart Mirror rPPG (Remote Photoplethysmography) System

A real-time vital signs analysis system using remote photoplethysmography (rPPG) technology. This project integrates a Next.js frontend with a FastAPI backend to capture a 50-second video of your face and analyze heart rate, respiratory rate, and other vital signs using the VitalLens API — with a live weather and clock ambient display for Kuala Lumpur.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Prerequisites](#prerequisites)
- [Setup & Installation](#setup--installation)
- [Running the Application](#running-the-application)
- [Usage Guide](#usage-guide)
- [Working Logic](#working-logic)
- [API Endpoints](#api-endpoints)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Changelog](#changelog)

---

## Overview

This Smart Mirror system automatically captures a **50-second video** of your face and uses **remote photoplethysmography (rPPG)** technology to extract vital signs without any wearable devices. The VitalLens SDK analyzes subtle color variations in your face across video frames to compute:

- **Heart Rate (HR)** — beats per minute
- **Respiratory Rate (RR)** — breaths per minute
- **Heart Rate Variability (HRV)** — SDNN and RMSSD metrics
- **Wellness Score** — composite health score (0–100)
- **Stress Level** — Low / Moderate / High estimation
- **Face Confidence** — reliability of the analysis

Additionally, the mirror displays **live Kuala Lumpur weather** (from the official Malaysia open data API) alongside the current **date and time**.

### How rPPG Works

1. Video is captured of your face for **50 seconds** (auto-stops)
2. FFmpeg converts the WebM blob to MP4, compressing to 480p for reliability
3. VitalLens analyzes color changes in facial regions (cheeks) across frames
4. These subtle color variations correspond to blood flow (the PPG signal)
5. The signal is processed via FFT to extract heart rate and respiratory rate
6. Results appear in a **slide-up Health Report** panel

---

## Features

✅ **Auto Recording** — 50-second countdown timer; recording starts and stops automatically  
✅ **Live Ambient Bar** — Real-time KL weather (data.gov.my) + clock/date always visible  
✅ **Real-Time Fall Detection** — YOLOv11m-pose runs in background via WebSocket at 5fps 
✅ **Post-scan Health Report** — Metrics slide up after analysis (not cluttering the idle view)  
✅ **Alignment Guide** — Face oval + scan animation appears only during active recording  
✅ **LED Strip Animation** — Animated border reacts to scanning state  
✅ **Multiple Vital Metrics** — Heart rate, respiratory rate, HRV (SDNN & RMSSD)  
✅ **Confidence Bars** — Visual indicator of measurement reliability per metric  
✅ **Local or Cloud Processing** — Toggle between VitalLens cloud API and local CHROM algorithm  
✅ **Video Compression** — FFmpeg scales to 480p, CRF 32 before upload to reduce SSL errors  
✅ **Error Handling** — Clear error messages and retry flow  

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMART MIRROR SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend (Next.js + React)              Backend (FastAPI)      │
│  ├─ SmartMirror component                ├─ main.py server      │
│  │  ├─ 50s auto-recording countdown      ├─ FFmpeg 480p/CRF-32  │
│  │  ├─ AmbientBar (weather + clock)      ├─ WebM → MP4 convert  │
│  │  ├─ AlignmentGuide (scan only)        ├─ VitalLens cloud API │
│  │  ├─ HealthReport (post-scan panel)    ├─ OR local CHROM mode │
│  │  ├─ FallAlert (glassmorphic modal)    └─ YOLOv11m-pose Infer │
│  │  └─ Camera Permission Flow                                   │
│  │                                       External Data Sources  │
│  ├─ AmbientBar component                 ├─ api.data.gov.my     │
│  │  ├─ useWeather hook (KL forecast)     │   (KL weather)       │
│  │  └─ useClock hook (live time)         └─ api.rouast.com      │
│  │                                           (VitalLens cloud)  │
│  ├─ HealthReport component                                      │
│  ├─ AlignmentGuide component                                    │
│  ├─ LedStrip component                                          │
│  ├─ FallAlert component                                         │
│  ├─ API Client (health-analysis-api.ts)                         │
│  └─ Hooks (use-video-recorder.ts, use-fall-detection.ts)        │
│                                                                 │
│  Video Pipeline:                                                │
│  Browser (WebM 50s) → Backend → FFmpeg 480p MP4                │
│    → VitalLens (cloud or local) → JSON → HealthReport panel    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16.2, React 19, TypeScript | UI, video recording, metric display |
| **Backend** | FastAPI, Uvicorn, Python 3.12 | API server, video processing |
| **Video Processing** | FFmpeg 8.1 | Convert WebM→MP4, compress to 480p |
| **Vital Signs (Cloud)** | VitalLens SDK 0.6.1 | rPPG via cloud API (api.rouast.com) |
| **Vital Signs (Local)** | VitalLens SDK (CHROM method) | rPPG fully offline, no quota limits |
| **Weather** | api.data.gov.my | Official Malaysia open data (no API key needed) |
| **Styling** | Tailwind CSS, Custom CSS | Glassmorphism UI |

---

## Prerequisites

### System Requirements
- **Windows 10/11**
- **Node.js 18+** (for frontend)
- **Python 3.12** (3.13+ has pydantic-core incompatibilities)
- **FFmpeg 8.1** (must be accessible from PATH or configured via `FFMPEG_BIN`)
- **Webcam** (for video recording)
- **Modern browser** (Chrome or Edge recommended — best WebRTC support)

### Required API Keys
- **VitalLens API Key** — Get from https://www.rouast.com/api  
  - Free tier: ~5–10 requests/day  
  - **Optional if using local mode** (`VITALLENS_LOCAL=true` in `.env`)

### Verify Prerequisites

```powershell
node --version     # 18+
python --version   # 3.12.x
ffmpeg -version    # 8.x
ffprobe -version
```

---

## Setup & Installation

### Step 1: Navigate to Project

```powershell
cd "C:\Users\User\Downloads\SmartMirror"
```

### Step 2: Install FFmpeg (if not already done)

1. Download **ffmpeg-8.1-essentials_build.zip** from https://www.gyan.dev/ffmpeg/builds/
2. Extract to e.g. `C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\`
3. Verify:
   ```powershell
   ffmpeg -version
   ```

### Step 3: Configure Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Create **`backend/.env`**:

```env
# ── VitalLens ──────────────────────────────────
VITALLENS_API_KEY=your_api_key_here

# Set to true to use offline CHROM algorithm (no API key / quota needed)
# Set to false to use cloud API (requires valid VITALLENS_API_KEY)
VITALLENS_LOCAL=false

# ── FFmpeg ─────────────────────────────────────
FFMPEG_BIN=C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin

# ── Server ─────────────────────────────────────
PORT=8000
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

> **Tip:** If you hit SSL/quota errors with the cloud API, set `VITALLENS_LOCAL=true` to process fully offline with no upload.

### Step 4: Install Frontend Dependencies

```powershell
cd ..   # back to project root
npm install
```

---

## Running the Application

### Terminal 1 — Backend

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python main.py
```

Expected output:
```
INFO:__main__:Added FFmpeg bin to PATH: C:\...\bin
INFO:__main__:VitalLens mode: CLOUD (api.rouast.com)
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

### Terminal 2 — Frontend

```powershell
npm run dev
```

Expected output:
```
▲ Next.js 16.2.0 (Turbopack)
  Local:   http://localhost:3000
✓ Ready in ~500ms
```

Open **http://localhost:3000** in your browser.

---

## Usage Guide

### Step-by-Step Flow

#### 1. Grant Camera Permission
- Click **"Start Camera"**
- Allow camera access when the browser asks

#### 2. Begin Recording
- Click **"Record"** (visible only after camera is active)
- A **50-second countdown** begins with a visual circular arc
- The alignment guide (face oval + corner brackets + scan line) appears
- Keep your face centered and still

#### 3. Automatic Stop & Analysis
- At 0 seconds, recording auto-stops and **"Analyzing vital signs…"** overlay appears
- The backend processes the video (30–90 seconds depending on mode)

#### 4. View the Health Report
- A **slide-up panel** appears at the bottom with:
  - 💓 **Heart Rate** (BPM) with confidence bar
  - 🌬️ **Respiratory Rate** (br/min) with confidence bar
  - 🧠 **Stress Level** (colour-coded: green / yellow / red)
  - ✨ **Wellness Score** (0–100)
  - HRV (SDNN & RMSSD) — if available
- Tap **✕** or tap the backdrop to dismiss

#### 5. Ambient Bar (always visible)
- **Top-left pill** — KL weather: temperature, condition (translated from Malay), "Kuala Lumpur" label
  - Source: `api.data.gov.my`, refreshed every 30 min, **no API key needed**
- **Top-right pill** — Live clock (HH:MM:SS AM/PM) + full date

### Tips for Best Results

✅ **Lighting** — Bright, even frontal light (natural or LED lamp); avoid backlighting  
✅ **Position** — Center face in the oval guide, ~30–40 cm from camera  
✅ **Stability** — Avoid excessive movement during the full 50 seconds  
✅ **Relax** — Tension elevates heart rate and reduces measurement accuracy  

---

## Working Logic

### Complete Data Flow

```
1. USER INTERACTION (Frontend)
───────────────────────────────
Click "Start Camera"
  → getUserMedia() → camera permission → live <video> feed

Click "Record"
  → MediaRecorder starts (WebM)
  → 50-second countdown (circular arc overlay)
  → At 0s: MediaRecorder.stop() → onRecordingComplete(blob)

2. VIDEO UPLOAD (Frontend → Backend)
─────────────────────────────────────
HealthAnalysisAPI.uploadVideo(videoBlob)
  → POST http://localhost:8000/api/health/process-video
  → multipart/form-data { file: video.webm }

3. VIDEO COMPRESSION (Backend — FFmpeg)
───────────────────────────────────────
Receive WebM → save to temp file
  → ffmpeg -i input.webm -vf "scale=-2:480" -crf 32 -c:v libx264 output.mp4
  → Results in ~3–8 MB file (down from 30–60 MB raw WebM)

4. VITALLENS ANALYSIS (Backend)
───────────────────────────────
If VITALLENS_LOCAL=false (default):
  → VitalLens(method="vitallens", api_key=...) — cloud API
  → Uploads MP4 to api.rouast.com for server-side rPPG analysis

If VITALLENS_LOCAL=true:
  → VitalLens(method="CHROM") — fully offline algorithm
  → No network calls, no quota, runs locally

Both return:
  { heart_rate, respiratory_rate, hrv_sdnn, hrv_rmssd, ppg_waveform, face_confidence }

5. RESPONSE → FRONTEND
──────────────────────
Backend returns JSON → HealthAnalysisAPI.parseResponse()
  → calculateWellnessScore() → 0–100 composite
  → estimateStressLevel() → "Low" / "Moderate" / "High"
  → setHealthMetrics() + setShowReport(true)
  → HealthReport panel slides up

6. WEATHER (Frontend — AmbientBar)
────────────────────────────────────
useWeather hook calls:
  GET https://api.data.gov.my/weather/forecast
      ?contains=Kuala+Lumpur@location__location_name&limit=7
  → Finds today's entry by Malaysia date (UTC+8)
  → Maps Malay forecast string → English label + Lucide icon
  → Displays in top-left pill; refreshed every 30 minutes

7. FALL DETECTION (Parallel Background Process)
─────────────────────────────────────────────
run_in_executor(YOLOv11m-pose) loop in backend:
  → Browser captures 320x240 JPEG at 5 fps
  → Sent via WebSocket: ws://localhost:8000/ws/fall-detection
  → Backend runs pose inference (extracts 4 keypoints)
  → Calculates: High downward velocity + >60° torso angle + wide bounding box
  → Returns { fall_detected: true/false }
  → Frontend shows full-screen "FALL ALERT" modal if detected
```

### Wellness Score Formula

```
HR_normalized = max(0, 100 − abs(heartRate − 75) / 0.5)
RR_normalized = max(0, 100 − abs(respiratoryRate − 16) / 0.25)
confidence_weight = (heartRateConfidence + respiratoryRateConfidence) / 2

wellness_score = HR_normalized * 0.4
              + RR_normalized * 0.4
              + confidence_weight * 100 * 0.2
```

---

## API Endpoints

### POST `/api/health/process-video`

**Request:**
```
Content-Type: multipart/form-data
Body: { file: <video_blob> }   Supported: .webm, .mp4, .mov, .avi
```

**Response (200 OK):**
```json
{
  "success": true,
  "vital_signs": {
    "heart_rate":       { "value": 75,   "confidence": 0.92, "unit": "bpm" },
    "respiratory_rate": { "value": 16,   "confidence": 0.85, "unit": "rpm" },
    "hrv_sdnn":         { "value": 35,   "unit": "ms" },
    "hrv_rmssd":        { "value": 28,   "unit": "ms" },
    "ppg_waveform":     [...],
    "respiratory_waveform": [...]
  },
  "face": { "confidence": 0.95, "detected": true },
  "message": "Analysis complete"
}
```

**Error (500):**
```json
{ "detail": "Error processing video: [specific message]" }
```

### GET `/health`

```json
{ "status": "running", "version": "1.0.0" }
```

---

## Configuration Reference

### `backend/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `VITALLENS_API_KEY` | *(required for cloud)* | API key from rouast.com/api |
| `VITALLENS_LOCAL` | `false` | `true` = use offline CHROM algorithm; `false` = cloud API |
| `FFMPEG_BIN` | *(required)* | Full path to folder containing `ffmpeg.exe` / `ffprobe.exe` |
| `PORT` | `8000` | Backend server port |
| `ENVIRONMENT` | `development` | `development` or `production` |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed frontend origins |

### Switching to Local (Offline) Mode

```env
# backend/.env
VITALLENS_LOCAL=true
```

- No VitalLens API key required
- No network calls for analysis
- Eliminates SSL/quota/connection errors
- Slightly different algorithm (CHROM vs VitalLens v3) — accuracy may vary

---

## Project Structure

```
SmartMirror/
├── app/
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Main page
│   └── globals.css              # Global styles
│
├── components/
│   ├── smart-mirror.tsx         # Main component — camera, recording, orchestration
│   ├── ambient-bar.tsx          # Weather (KL) + live clock/date pill bar
│   ├── health-report.tsx        # Post-scan slide-up report panel
│   ├── alignment-guide.tsx      # Face oval + scan line (shown only during recording)
│   ├── led-strip.tsx            # Animated LED border
│   ├── health-widget.tsx        # Individual metric pill (used inside HealthReport)
│   ├── wellness-widget.tsx      # Wellness score display
│   └── ui/                      # shadcn/ui components
│
├── hooks/
│   ├── use-video-recorder.ts    # MediaRecorder hook (50s auto-stop)
│   ├── use-weather.ts           # KL weather from api.data.gov.my
│   └── use-clock.ts             # Live clock (updates every second)
│
├── lib/
│   ├── health-analysis-api.ts   # API client + wellness/stress calculations
│   ├── types.ts                 # TypeScript interfaces
│   └── utils.ts                 # Helpers
│
├── backend/
│   ├── main.py                  # FastAPI server — video processing, VitalLens
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # Configuration (NOT committed)
│   └── venv/                    # Python virtual environment
│
├── public/
├── package.json
├── tsconfig.json
├── README.md                    # This file
└── SETUP_GUIDE.md               # Quick-start reference
```

---

## Troubleshooting

### "FFmpeg not found"
```
ERROR: FFmpeg not found
```
1. Check `FFMPEG_BIN` path in `backend/.env`
2. Verify the exe exists:
   ```powershell
   Test-Path "C:\...\bin\ffmpeg.exe"  # Must be True
   ```
3. Restart backend

---

### "VitalLens API key not configured"
1. Get key from https://www.rouast.com/api
2. Add `VITALLENS_API_KEY=your_key` to `backend/.env`
3. Or set `VITALLENS_LOCAL=true` to bypass the cloud API entirely

---

### SSL / Connection Aborted / Quota errors
```
SSLEOFError / RemoteDisconnected / quota exceeded
```
These are cloud API errors. Solutions in order:
1. **Set `VITALLENS_LOCAL=true`** — eliminates all network issues ✅
2. Use a different API key account
3. Reduce recording duration further (already at 50s with 480p compression)

---

### "Camera permission denied"
- Grant camera access in browser Settings → Privacy → Camera
- Refresh the page (F5) and click "Start Camera" again

---

### "No face detected" / Low confidence
- Improve **lighting**: bright, even, frontal — avoid backlighting
- **Center** your face in the oval guide, ~30–40 cm from camera
- Stay as **still** as possible for the full 50 seconds
- Retry — some sessions have transient analysis failures

---

### Weather shows wrong date / April date instead of today
Already fixed in `hooks/use-weather.ts` — the hook uses `toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" })` to correctly derive today's date in UTC+8 before filtering the API response.

---

### CORS errors in browser console
1. Verify backend is running: `curl http://localhost:8000/health`
2. Check `CORS_ORIGINS` in `backend/.env` matches your frontend URL
3. Restart backend

---

## Changelog

### v1.3.0 — March 2026 (Current)
- ✅ **Real-Time Fall Detection** — YOLOv11m-pose integration via FastAPI WebSockets processing at 5fps natively.
- ✅ **Fall Alert Overlay** — Premium glassmorphic "FALL ALERT" UI with manual dismiss.
- ✅ **Monitoring Badge** — Green pulsing indicator when fall monitoring is active.

### v1.2.0 — March 2026
- ✅ **Ambient Bar** — Live KL weather (data.gov.my, no API key) + clock/date
- ✅ **Post-scan Health Report** — Metrics shown as a slide-up report panel; removed from idle top bar
- ✅ **Alignment guide** — Now only visible during active recording
- ✅ **Weather date fix** — Correct Malaysia date matching using UTC+8 timezone

### v1.1.0 — March 2026
- ✅ **50-second auto-recording** — Countdown timer + circular arc; no manual Stop button
- ✅ **FFmpeg 480p/CRF-32 compression** — Dramatically smaller upload, fewer SSL errors
- ✅ **Local processing mode** (`VITALLENS_LOCAL=true`) — Offline CHROM algorithm, no quotas
- ✅ **Stale closure bug fix** — Countdown timer no longer goes negative

### v1.0.0
- ✅ Real-time vital signs via rPPG (VitalLens cloud)
- ✅ WebM→MP4 conversion, LED animation, alignment guide
- ✅ Wellness score, stress level, HRV

---

**Last Updated:** March 29, 2026  
**Status:** ✅ Fully Functional
