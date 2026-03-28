# Smart Mirror rPPG (Remote Photoplethysmography) System

A real-time vital signs analysis system using remote photoplethysmography (rPPG) technology. This project integrates a Next.js frontend with a FastAPI backend to capture video of your face and analyze heart rate, respiratory rate, and other vital signs using the VitalLens API.

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
- [Troubleshooting](#troubleshooting)

---

## Overview

This Smart Mirror system captures a 50-60 second video of your face and uses **remote photoplethysmography (rPPG)** technology to extract vital signs without any wearable devices. The VitalLens API analyzes the subtle color variations in your face across video frames to compute:

- **Heart Rate (HR)** - beats per minute
- **Respiratory Rate (RR)** - breaths per minute  
- **Heart Rate Variability (HRV)** - SDNN, RMSSD, LF/HF ratio
- **PPG Waveform** - the extracted heart signal
- **Face Confidence** - reliability of the analysis

### How rPPG Works

1. Video is captured of your face for 50-60 seconds
2. FFmpeg extracts frames and converts to MP4 format
3. VitalLens API analyzes color changes in facial regions across frames
4. These subtle color variations correspond to blood flow (PPG signal)
5. The signal is processed to extract heart rate and respiratory rate
6. Results are displayed in real-time on the mirror interface

---

## Features

✅ **Real-time Vital Signs Analysis** - No sensors or wearables required  
✅ **Face Detection & Tracking** - Automatic face detection in video  
✅ **Multiple Vital Metrics** - Heart rate, respiratory rate, HRV  
✅ **Detailed Confidence Scores** - Know how reliable each measurement is  
✅ **WebM to MP4 Conversion** - Browser video auto-converted for better compatibility  
✅ **Beautiful Mirror UI** - Displays vital signs with real-time metric updates  
✅ **Error Handling** - Clear error messages if video can't be analyzed  
✅ **Wellness Score** - Composite health metric derived from vitals  

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMART MIRROR SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend (Next.js + React)                  Backend (FastAPI) │
│  ├─ Smart Mirror Component                   ├─ Main Server    │
│  │  ├─ Video Recording (MediaRecorder)       ├─ FFmpeg Support │
│  │  ├─ Real-time Metrics Display             ├─ WebM→MP4 Conv  │
│  │  └─ Camera Permission Flow                ├─ VitalLens API  │
│  │                                           └─ DB (Future)    │
│  ├─ Health Widget Components                                   │
│  ├─ Wellness Widget                          External APIs     │
│  ├─ LED Strip Animation                      ├─ VitalLens API  │
│  ├─ Alignment Guide                          └─ FFmpeg         │
│  └─ API Client (health-analysis-api.ts)                        │
│                                                                 │
│  Video Processing Pipeline:                                    │
│  Browser (WebM 50s) → Backend → FFmpeg MP4 → VitalLens API    │
│                      → Vital Signs JSON → Frontend Display     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16.2.0, React 19.0.0, TypeScript | UI, video recording, metric display |
| **Backend** | FastAPI, Uvicorn, Python 3.12 | API server, video processing coordination |
| **Video Processing** | FFmpeg 8.1 | Convert WebM→MP4, probe video metadata |
| **Vital Signs Analysis** | VitalLens SDK 0.6.1 | rPPG-based vital sign extraction |
| **Communication** | HTTP REST API, FormData | Frontend-backend video/results transfer |
| **Styling** | Tailwind CSS, shadcn/ui | Component library and theme |

---

## Prerequisites

Before starting, ensure you have:

### System Requirements
- **Windows 10/11** (tested on Windows)
- **Node.js 18+** (for frontend)
- **Python 3.12** (exact version - 3.13+ has pydantic-core incompatibilities)
- **FFmpeg 8.1** (for video processing)
- **Webcam** (for video recording)
- **Modern browser** (Chrome, Edge, Firefox with WebRTC support)

### Required API Keys
- **VitalLens API Key** - Get from https://vitallens.ai (free tier available)
  - Free tier: 5-10 requests/day, 60s duration
  - Pro tier: Unlimited requests with higher accuracy features (HRV)

### Verify Prerequisites

```powershell
# Check Node.js
node --version
npm --version

# Check Python
python --version

# Check FFmpeg
ffmpeg -version
ffprobe -version
```

---

## Setup & Installation

### Step 1: Clone & Navigate to Project

```powershell
cd "C:\Users\User\Downloads\SmartMirror"
ls  # Verify you see: app/, components/, backend/, package.json, etc.
```

### Step 2: Install FFmpeg (if not already done)

1. Download FFmpeg 8.1 essentials build:
   - Visit https://www.gyan.dev/ffmpeg/builds/
   - Download **ffmpeg-8.1-essentials_build.zip**
   - Extract to: `C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\`

2. Verify FFmpeg is installed:
   ```powershell
   ffmpeg -version
   ffprobe -version
   ```

### Step 3: Configure Backend

1. **Set up Python Virtual Environment:**
   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

2. **Install Python Dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

3. **Create `.env` file** (backend/.env):
   ```env
   # VitalLens API Configuration
   VITALLENS_API_KEY=your_api_key_here

   # Server Configuration
   PORT=8000
   ENVIRONMENT=development

   # CORS Configuration
   CORS_ORIGINS=http://localhost:3000,http://localhost:3001

   # FFmpeg Configuration
   FFMPEG_BIN=C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin
   ```

   **Important:** Replace `your_api_key_here` with your actual VitalLens API key.

### Step 4: Install Frontend Dependencies

```powershell
# From project root (not backend folder)
cd ..
npm install
# or if using pnpm:
pnpm install
```

---

## Running the Application

### Terminal 1: Start Backend Server

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python main.py
```

**Expected output:**
```
INFO:__main__:Added FFmpeg bin to PATH: C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:main:Smart Mirror rPPG API starting...
INFO:main:CORS Origins: http://localhost:3000,http://localhost:3001
INFO:     Application startup complete.
```

### Terminal 2: Start Frontend Development Server

```powershell
# From project root
npm run dev
# or:
pnpm dev
```

**Expected output:**
```
▲ Next.js 16.2.0 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://192.168.x.x:3000
✓ Ready in 490ms
```

### Step 3: Open Browser

Navigate to **http://localhost:3000** in your web browser.

---

## Usage Guide

### Step-by-Step Recording & Analysis

#### 1. **Grant Camera Permission**
   - Page loads → "Start Camera" button appears
   - Click "Start Camera"
   - Browser asks for camera permission → Click "Allow"
   - Live camera feed appears in mirror frame

#### 2. **Begin Recording**
   - Frame yourself centered in mirror (alignment guide helps)
   - Ensure good lighting on your face
   - Click "Record" button (only visible after camera is active)
   - **50-second countdown starts** - keep your face in frame, minimize movement

#### 3. **Wait for Analysis**
   - "Recording..." overlay shows elapsed time
   - After 50 seconds, recording auto-stops
   - "Analyzing vital signs..." overlay appears with spinner
   - Takes 30-60 seconds to process

#### 4. **View Results**
   - Top metric bar updates with:
     - 💓 **Heart Rate** (BPM) - with pulsing animation
     - 🌬️ **Respiratory Rate** (breaths/min)
     - 🧠 **Stress Level** (Low/Moderate/High)
     - ✨ **Wellness Score** (0-100)
   - Results remain displayed after analysis completes

#### 5. **Error Handling**
   - If error occurs, red error box appears below metric bar
   - Common errors:
     - "No face detected" → Reposition face in frame
     - "Low confidence" → Ensure good lighting
     - "FFmpeg error" → Check backend is running
   - Click "Start Camera" again to retry

### Tips for Best Results

✅ **Lighting:** Use bright, even lighting (natural window light or LED lamp)  
✅ **Position:** Center face in alignment guide, keep ~12 inches from camera  
✅ **Stability:** Avoid excessive movement during recording  
✅ **Duration:** Full 50-60 seconds for best accuracy  
✅ **Comfort:** Relax - tension affects heart rate measurement  

---

## Working Logic

### Complete Data Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION (Frontend)                                       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Click "Start Camera"                                               │
│  ↓                                                                   │
│  navigator.mediaDevices.getUserMedia() → Ask browser for camera    │
│  ↓                                                                   │
│  User grants permission                                             │
│  ↓                                                                   │
│  <video> element streams live camera feed                           │
│                                                                      │
│  Click "Record"                                                     │
│  ↓                                                                   │
│  MediaRecorder starts capturing video frames                        │
│  ↓                                                                   │
│  Timer counts down: 50, 49, 48... 1, 0                             │
│  ↓ (at 0 seconds)                                                   │
│  MediaRecorder.stop() triggered                                     │
│  ↓                                                                   │
│  Video data collected into Blob (encoded as WebM)                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 2. VIDEO UPLOAD (Frontend → Backend)                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  HealthAnalysisAPI.uploadVideo(videoBlob)                           │
│  ↓                                                                   │
│  Create FormData with video file (video.webm)                       │
│  ↓                                                                   │
│  POST http://localhost:8000/api/health/process-video               │
│  Headers: Content-Type: multipart/form-data                         │
│  Body: { file: videoBlob }                                          │
│  ↓                                                                   │
│  (Network latency: ~100-500ms)                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 3. VIDEO CONVERSION (Backend - FFmpeg)                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Backend receives WebM file → saves to temp location                │
│  ↓                                                                   │
│  check: file_ext == ".webm"?                                        │
│  ↓ YES                                                              │
│  convert_webm_to_mp4(webm_path)                                     │
│  ↓                                                                   │
│  subprocess.run([                                                    │
│    "ffmpeg",                                                         │
│    "-i", webm_path,              # input WebM                       │
│    "-c:v", "libx264",            # H.264 video codec                │
│    "-crf", "28",                 # compression quality              │
│    "-c:a", "aac",               # AAC audio codec                   │
│    "-y",                         # overwrite output                  │
│    mp4_path                      # output MP4                       │
│  ])                                                                  │
│  ↓                                                                   │
│  (Processing time: 5-15 seconds depending on duration)             │
│  ↓                                                                   │
│  Returns: mp4_path with proper frame rate metadata                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 4. VITALLENS ANALYSIS (Backend)                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  vl_client = VitalLens(method="vitallens", api_key=VITALLENS_KEY)   │
│  ↓                                                                   │
│  results = vl_client(mp4_path)                                      │
│  ↓                                                                   │
│  VitalLens processes video:                                         │
│    1. Extract face region using face detection                     │
│    2. Identify ROI (cheek regions with blood flow)                 │
│    3. Extract color channels (R, G, B) across frames               │
│    4. Reconstruct PPG waveform using rPPG algorithm                │
│    5. Extract heart rate from FFT of PPG signal                    │
│    6. Apply respiratory motion constraints                          │
│    7. Extract respiratory rate                                      │
│    8. Compute HRV metrics (SDNN, RMSSD, LF/HF)                     │
│  ↓                                                                   │
│  (Processing time: 20-60 seconds - backend to VitalLens API)      │
│  ↓                                                                   │
│  Returns: {                                                          │
│    vitals: {                                                         │
│      heart_rate: { value: 75, confidence: 0.92, unit: "bpm" },    │
│      respiratory_rate: { value: 16, confidence: 0.85, unit: "rpm" }│
│      hrv_sdnn: { value: 35 },                                      │
│      ppg_waveform: [...],                                           │
│      respiratory_waveform: [...]                                    │
│    },                                                                │
│    face: { confidence: 0.95 }                                       │
│  }                                                                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 5. RESPONSE FORMATTING (Backend)                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Backend transforms VitalLens response → standardized format        │
│  ↓                                                                   │
│  response_data = {                                                  │
│    "success": true,                                                 │
│    "vital_signs": {                                                 │
│      "heart_rate": {                                                │
│        "value": 75,                  # derived from PPG peak freq   │
│        "confidence": 0.92,           # signal quality               │
│        "unit": "bpm"                                                │
│      },                                                              │
│      "respiratory_rate": {                                          │
│        "value": 16,                  # derived from breathing motion│
│        "confidence": 0.85,                                          │
│        "unit": "rpm"                                                │
│      },                                                              │
│      ... (HRV, waveforms, face confidence)                         │
│    }                                                                 │
│  }                                                                   │
│  ↓                                                                   │
│  HTTP 200 OK + JSON response                                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ 6. STATE UPDATE & DISPLAY (Frontend)                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  HealthAnalysisAPI.parseResponse(response)                          │
│  ↓                                                                   │
│  Extract vitals: {                                                  │
│    heartRate: 75,                                                   │
│    heartRateConfidence: 0.92,                                       │
│    respiratoryRate: 16,                                             │
│    respiratoryRateConfidence: 0.85,                                 │
│    ...                                                              │
│  }                                                                   │
│  ↓                                                                   │
│  Calculate wellness score:                                          │
│    1. Normalize HR (60-100 = healthy range)                         │
│    2. Normalize RR (12-20 = healthy range)                          │
│    3. Apply confidence weighting                                    │
│    4. Composite score: 0-100                                        │
│  ↓                                                                   │
│  Estimate stress level:                                             │
│    if HRV_normal && confidence > 0.8: "Low"                         │
│    elif HR_elevated: "Moderate"                                     │
│    else: "High"                                                     │
│  ↓                                                                   │
│  setHealthMetrics(vitals)                                           │
│  setWellnessScore(score)                                            │
│  setStressLevel(level)                                              │
│  ↓                                                                   │
│  React renders updated component:                                   │
│    ├─ HealthWidget: HR pulsing animation                            │
│    ├─ HealthWidget: RR display                                      │
│    ├─ WellnessWidget: Animated score bar                            │
│    └─ HealthWidget: Stress level color-coded                        │
│  ↓                                                                   │
│  Cleanup: delete temp video files, reset recording state            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Algorithm Details

**rPPG Signal Extraction:**
```
1. Face Detection: Locate face in each frame
2. ROI Selection: Select cheek regions (high blood flow)
3. Color Decomposition: Extract R, G, B channels
4. Temporal Filtering: Remove noise and motion artifacts
5. PPG Reconstruction: Combine channels to maximize pulsation
6. FFT Analysis: Convert time-domain PPG to frequency-domain
7. Peak Detection: Find dominant frequency = heart rate
```

**Wellness Score Formula:**
```
HR_normalized = max(0, 100 - abs(heartRate - 75) / 0.5)
RR_normalized = max(0, 100 - abs(respiratoryRate - 16) / 0.25)
confidence_weight = (heartRateConfidence + respiratoryRateConfidence) / 2

wellness_score = (HR_normalized * 0.4 + 
                  RR_normalized * 0.4 + 
                  confidence_weight * 100 * 0.2)
```

---

## API Endpoints

### POST `/api/health/process-video`

Process video file and extract vital signs.

**Request:**
```
POST http://localhost:8000/api/health/process-video
Content-Type: multipart/form-data

Body:
  file: <video_blob>  (supported: .webm, .mp4, .mov, .avi, .flv)
```

**Response (200 OK):**
```json
{
  "success": true,
  "vital_signs": {
    "heart_rate": {
      "value": 75,
      "confidence": 0.92,
      "unit": "bpm",
      "note": "Normal"
    },
    "respiratory_rate": {
      "value": 16,
      "confidence": 0.85,
      "unit": "rpm",
      "note": "Normal"
    },
    "hrv_sdnn": {
      "value": 35,
      "unit": "ms"
    },
    "hrv_rmssd": {
      "value": 28,
      "unit": "ms"
    },
    "hrv_lfhf": {
      "value": 1.2
    },
    "ppg_waveform": [0.1, 0.2, 0.15, ...],
    "respiratory_waveform": [0.05, 0.08, ...]
  },
  "face": {
    "confidence": 0.95,
    "detected": true
  },
  "message": "Analysis complete"
}
```

**Error Response (500):**
```json
{
  "detail": "Error processing video: [specific error message]"
}
```

### GET `/health`

Health check endpoint.

**Request:**
```
GET http://localhost:8000/health
```

**Response (200 OK):**
```json
{
  "status": "running",
  "version": "1.0.0"
}
```

---

## Troubleshooting

### Issue: "FFmpeg not found" Error

**Symptoms:**
```
ERROR:main:Error processing video: FFmpeg not found
```

**Solution:**

1. Verify FFmpeg is installed:
   ```powershell
   ffmpeg -version
   ```

2. Check `FFMPEG_BIN` in `backend/.env`:
   ```env
   FFMPEG_BIN=C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin
   ```

3. Verify the path exists:
   ```powershell
   Test-Path "C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin\ffmpeg.exe"
   # Should output: True
   ```

4. Restart backend server:
   ```powershell
   # Stop: Ctrl+C
   # Restart:
   cd backend
   .\venv\Scripts\Activate.ps1
   python main.py
   ```

---

### Issue: "VitalLens API key not configured"

**Symptoms:**
```
ERROR: VitalLens API key not configured
```

**Solution:**

1. Get API key from https://vitallens.ai
2. Add to `backend/.env`:
   ```env
   VITALLENS_API_KEY=your_actual_key_here
   ```
3. Restart backend:
   ```powershell
   Ctrl+C  # Stop server
   python main.py  # Restart
   ```

---

### Issue: "Camera permission denied"

**Symptoms:**
- Button says "Camera access denied"
- Video feed doesn't appear

**Solution:**

1. Check browser camera permission in Settings
2. Grant camera access to browser
3. Refresh page (F5)
4. Click "Start Camera" again

---

### Issue: "No face detected" or Low Confidence

**Symptoms:**
```
Error: "VitalLens could not analyze the video. Ensure video contains a clear face."
```

**Solution:**

1. **Improve lighting:**
   - Natural window light or LED lamp
   - Avoid backlighting or shadows on face

2. **Better positioning:**
   - Center face in alignment guide
   - Keep ~12 inches from camera
   - Ensure full face is visible

3. **Stability:**
   - Minimize head movement during recording
   - Keep steady position for full 50 seconds

4. **Retry:**
   - Click "Start Camera" and try again

---

### Issue: "Frame rate information missing" Warning

**Symptoms:**
```
WARNING:root:Frame rate information missing
WARNING:root:Cannot infer number of total frames
```

**Why it's okay:**
- FFmpeg successfully converts WebM to MP4
- VitalLens falls back to duration-based estimation
- Still provides valid results

**If causing failures:**
- Ensure recording is full 50 seconds (not shorter)
- Check video file isn't corrupted

---

### Issue: Backend takes too long (>60 seconds)

**Symptoms:**
- "Analyzing vital signs..." spinner appears for 2+ minutes

**Causes:**
- VitalLens API queue is busy (free tier)
- Video quality is poor (more processing needed)
- Network latency to VitalLens servers

**Solutions:**
- Try again during off-peak hours
- Upgrade to VitalLens Pro tier for priority processing
- Ensure good lighting and face positioning

---

### Issue: CORS Error in Browser Console

**Symptoms:**
```
Access to XMLHttpRequest has been blocked by CORS policy
```

**Solution:**

1. Verify backend is running on port 8000:
   ```powershell
   netstat -ano | findstr :8000
   ```

2. Check `CORS_ORIGINS` in `backend/.env`:
   ```env
   CORS_ORIGINS=http://localhost:3000,http://localhost:3001
   ```

3. Restart backend

---

## Development & Customization

### Project Structure

```
smart-mirror/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with providers
│   ├── page.tsx                 # Main page
│   └── globals.css              # Global styles
│
├── components/                   # React Components
│   ├── smart-mirror.tsx         # Main mirror component (VIDEO RECORDING)
│   ├── health-widget.tsx        # Individual metric display
│   ├── wellness-widget.tsx      # Wellness score widget
│   ├── alignment-guide.tsx      # Face alignment helper
│   ├── led-strip.tsx            # Animated LED border
│   │
│   └── ui/                      # shadcn/ui Components
│       └── (50+ reusable components)
│
├── hooks/                        # React Hooks
│   └── use-video-recorder.ts    # Video recording logic
│
├── lib/                          # Utilities & Types
│   ├── health-analysis-api.ts   # API client
│   ├── types.ts                 # TypeScript interfaces
│   └── utils.ts                 # Helper functions
│
├── backend/                      # FastAPI Backend
│   ├── main.py                  # Main server (VIDEO PROCESSING)
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # Configuration
│   └── venv/                    # Python virtual environment
│
├── public/                       # Static assets
├── styles/                       # Additional CSS
├── package.json                 # Frontend dependencies
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
```

### Extending the System

**Add Database Storage:**
```python
# backend/main.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./vital_signs.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(engine)

# Store results after analysis
def store_result(vitals, user_id):
    db = SessionLocal()
    result = VitalSignRecord(user_id=user_id, vitals=vitals, timestamp=datetime.now())
    db.add(result)
    db.commit()
```

**Add Authentication:**
```python
# Secure endpoints with user authentication
from fastapi.security import HTTPBearer
security = HTTPBearer()

@app.post("/api/health/process-video")
async def process_video(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Verify token
    user_id = verify_token(credentials.credentials)
    # Process video...
```

**Add History Tracking:**
```typescript
// frontend: Store past results
const [history, setHistory] = useState<AnalysisResult[]>([])

useEffect(() => {
  const storedHistory = localStorage.getItem('vitalsHistory')
  if (storedHistory) setHistory(JSON.parse(storedHistory))
}, [])

const saveResult = (result: AnalysisResult) => {
  const updated = [...history, { ...result, timestamp: Date.now() }]
  setHistory(updated)
  localStorage.setItem('vitalsHistory', JSON.stringify(updated))
}
```

---

## Performance & Optimization

### Frontend Performance
- **Code Splitting:** Next.js auto-splits components
- **Image Optimization:** Automatic image resizing
- **CSS-in-JS:** Tailwind CSS for efficient styling

### Backend Performance
- **Async Processing:** FastAPI non-blocking I/O
- **Cache VitalLens Client:** Reuse connection across requests
- **Temp File Cleanup:** Automatic cleanup after analysis

### Video Processing Optimization
- **WebM → MP4:** Required only for metadata integrity
- **FFmpeg Settings:** CRF 28 (quality/speed tradeoff)
- **Parallel Processing:** Future: handle multiple uploads

---

## Security Considerations

⚠️ **Before Production Deployment:**

1. **Secure API Key:**
   ```env
   # .env (NEVER commit this)
   VITALLENS_API_KEY=prod_key_only_in_prod
   
   # Use environment variables or secrets manager
   ```

2. **CORS Restrictions:**
   ```python
   CORS_ORIGINS = "https://yourdomain.com"  # Not localhost
   ```

3. **HTTPS Only:**
   ```python
   @app.middleware("http")
   async def require_https(request, call_next):
       if request.url.scheme == "http":
           return RedirectResponse(url=request.url.replace("http", "https"))
       return await call_next(request)
   ```

4. **Rate Limiting:**
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   
   @app.post("/api/health/process-video")
   @limiter.limit("5/minute")
   async def process_video(...):
       # Limited to 5 requests per minute per IP
   ```

---

## Support & Resources

- **VitalLens Documentation:** https://vitallens.ai/docs
- **FastAPI Docs:** https://fastapi.tiangolo.com
- **Next.js Docs:** https://nextjs.org/docs
- **FFmpeg Documentation:** https://ffmpeg.org/documentation.html

---

## License

This project is provided as-is for research and educational purposes.

---

## Changelog

### v1.0.0 (Current)
- ✅ Real-time vital signs analysis via rPPG
- ✅ WebM to MP4 video conversion
- ✅ beautiful Mirror UI with LED animations
- ✅ Heart rate, respiratory rate, HRV support
- ✅ Wellness score and stress level estimation
- ✅ Complete error handling and recovery

### Future Improvements
- 📋 User history/dashboard
- 📊 Data export (CSV, PDF)
- 🔐 User authentication
- 📱 Mobile app
- 🧠 AI-powered stress detection
- 🎯 Guided breathing exercises
- 📈 Long-term trend analysis

---

**Last Updated:** March 28, 2026  
**Status:** ✅ Fully Functional
