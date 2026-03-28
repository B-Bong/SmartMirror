# Smart Mirror rPPG Implementation Guide

Complete setup guide for the Smart Mirror backend + frontend integration.

## Architecture Overview

```
Frontend (Next.js)
    ↓ Records 50-60 sec video
Backend API (FastAPI)
    ↓ Sends to VitalLens
VitalLens Service
    ↓ Analyzes rPPG
Backend API
    ↓ Returns vital signs
Frontend (Next.js)
    ↓ Displays metrics
```

## Quick Start (5 minutes)

### Prerequisites

- Python 3.10+
- Node.js 18+
- FFmpeg installed globally
- VitalLens API key (free at https://www.rouast.com/api)

### Step 1: Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy and configure .env
copy .env.example .env
# Edit .env: add your VITALLENS_API_KEY

# Start server
python main.py
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Smart Mirror rPPG API starting...
```

Test it: `curl http://localhost:8000/health`

### Step 2: Frontend Setup

In another terminal:

```bash
# Install dependencies (first time only)
npm install

# Start dev server
npm run dev
```

**Expected output:**
```
  ▲ Next.js 16.2.0
  - Local:        http://localhost:3000
```

### Step 3: Try It Out

1. Open http://localhost:3000 in browser
2. Click "Start Camera" (allow permissions)
3. Click "Record" 
4. Wait 50 seconds (auto-stops)
5. Wait 1-2 minutes for analysis
6. See vital signs update!

---

## File Structure

```
smart-mirror/
├── backend/
│   ├── main.py                 # FastAPI server
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example           # Environment template
│   ├── Dockerfile             # Docker config
│   └── README.md              # Backend docs
├── components/
│   ├── smart-mirror.tsx       # Main UI (UPDATED)
│   ├── health-widget.tsx
│   ├── wellness-widget.tsx
│   └── ...
├── hooks/
│   ├── use-video-recorder.ts  # Video recording hook (NEW)
│   └── use-toast.ts
├── lib/
│   ├── types.ts               # TypeScript types (NEW)
│   ├── health-analysis-api.ts # API client (NEW)
│   └── utils.ts
├── .env.local                 # Frontend env (NEW)
└── ...
```

---

## What's New

### Backend Files (NEW)

1. **`backend/main.py`** - FastAPI server with two endpoints:
   - `POST /api/health/process-video` - Upload video file
   - `POST /api/health/process-video-base64` - Send base64 video

2. **`backend/requirements.txt`** - Dependencies

3. **`backend/Dockerfile`** - For production deployment

### Frontend Files (NEW)

1. **`lib/types.ts`** - TypeScript interfaces for VitalLens response
   - `HealthAnalysisResponse` - API response
   - `HealthMetrics` - Frontend state

2. **`lib/health-analysis-api.ts`** - API client class
   - `uploadVideo()` - Send video to backend
   - `parseResponse()` - Transform API response
   - `calculateWellnessScore()` - Compute wellness
   - `estimateStressLevel()` - Estimate stress

3. **`hooks/use-video-recorder.ts`** - React hook for recording
   - `startRecording()` - Start recording from stream
   - `stopRecording()` - Stop and get blob
   - Auto-stops at 50 seconds

4. **`components/smart-mirror.tsx`** (UPDATED)
   - Integrated video recording
   - Integrated API calls
   - Real metric display
   - Loading/error states

5. **`.env.local`** - Frontend environment
   - `NEXT_PUBLIC_API_URL` - Backend location

---

## Configuration

### Backend (.env)

```env
# VitalLens service
VITALLENS_API_KEY=your_key_here

# Server
PORT=8000
ENVIRONMENT=development

# CORS (allow frontend)
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env.local)

```env
# Backend API location
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## API Reference

### Process Video

**Endpoint:** `POST /api/health/process-video`

**Request:**
```
Content-Type: multipart/form-data
Body: { file: [video_blob] }
```

**Response:**
```json
{
  "vital_signs": {
    "heart_rate": { "value": 72.5, "unit": "bpm", "confidence": 0.85 },
    "respiratory_rate": { "value": 16.2, "unit": "rpm", "confidence": 0.79 },
    "hrv_sdnn": { "value": null, "unit": "ms", "confidence": null },
    ...
  },
  "face": { "confidence": 0.92, "note": "..." },
  "message": "..."
}
```

---

## Performance Notes

### Video Requirements

- **Duration**: 50-60 seconds (optimal)
- **Format**: WebM or MP4
- **Resolution**: 640x480+
- **FPS**: 25-30 fps
- **Lighting**: Well-lit environment
- **Face**: Clear, centered, looking at camera

### Processing Times

| Duration | Speed | Free Tier |
|----------|-------|-----------|
| 30-50 sec | Fast | 30-60 sec |
| 50-60 sec | Normal | 1-2 min |
| 60+ sec | Slow | 2+ min |

### Confidence Scores

- **>0.8**: Excellent reliability
- **0.6-0.8**: Good reliability  
- **0.4-0.6**: Fair, may need retry
- **<0.4**: Poor, try different conditions

---

## Troubleshooting

### "VitalLens API key not configured"

**Solution:**
1. Get API key from https://www.rouast.com/api
2. Add to `backend/.env`
3. Restart backend: `python main.py`

### "Could not analyze the video"

**Causes:**
- Face not clearly visible
- Poor lighting
- Video too short (<30s)
- Video too dark/blurry

**Solution:** Re-record in well-lit environment

### "Could not upload video - Connection refused"

**Causes:**
- Backend not running
- Wrong port/URL
- CORS issues

**Solution:**
1. Check backend running: `http://localhost:8000/health`
2. Check `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:8000`
3. Restart both servers

### FFmpeg not found

**Solution:**
1. Install FFmpeg: https://ffmpeg.org/download.html
2. Add to PATH
3. Verify: `ffmpeg -version`
4. Restart terminal

---

## Production Deployment

### Docker Setup

```bash
cd backend

# Build image
docker build -t smart-mirror-api .

# Run container
docker run -p 8000:8000 \
  -e VITALLENS_API_KEY=your_key \
  -e CORS_ORIGINS=https://yourdomain.com \
  smart-mirror-api
```

### Environment Variables for Production

```env
# backend/.env
VITALLENS_API_KEY=prod_key
PORT=8000
ENVIRONMENT=production
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# frontend/.env.production
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### Cloud Deployment

- **Backend**: Render, Railway, Heroku, AWS Lambda
- **Frontend**: Vercel, Netlify, GitHub Pages
- **Database**: MongoDB Atlas (optional, for history)

---

## Testing

### Test Backend API

```bash
# Health check
curl http://localhost:8000/health

# API documentation
open http://localhost:8000/docs
```

### Test Frontend

1. Open http://localhost:3000
2. Browser console (F12) shows logs
3. Look for `[SmartMirror]` prefixed messages

### Debug Video Upload

Chrome DevTools:
1. Open Network tab
2. Click "Record"
3. Look for `process-video` request
4. Check response status and body

---

## Next Steps

### Features to Add

1. **History Storage**
   - Save results to database
   - Show trends over time
   - Export data

2. **Real-time Streaming**
   - WebSocket for live results
   - Process chunks instead of whole video

3. **Advanced Metrics**
   - Store HRV history
   - Trend analysis
   - Alerts for abnormal values

4. **User Accounts**
   - Authentication
   - Multiple users
   - Personal dashboards

---

## Support & Documentation

- **VitalLens Docs**: https://docs.rouast.com/python
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Next.js Docs**: https://nextjs.org/docs

---

## License

MIT
