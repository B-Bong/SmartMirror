# Smart Mirror — Quick Setup Guide

Concise reference for getting the Smart Mirror running. See `README.md` for full documentation.

---

## Architecture Overview

```
Frontend (Next.js)
    ↓ 50-second auto-recorded WebM
Backend API (FastAPI)
    ↓ FFmpeg compresses to 480p MP4
VitalLens (cloud API or local CHROM)
    ↓ Vital signs JSON
Frontend
    ↓ Slide-up Health Report + Ambient Bar (KL weather / clock)
```

---

## Quick Start

### Prerequisites

- Python **3.12** (not 3.13+)
- Node.js **18+**
- FFmpeg **8.1** (`ffmpeg.exe` accessible)
- VitalLens API key from https://www.rouast.com/api *(not needed in local mode)*

---

### Step 1 — Backend Setup

```powershell
cd backend

# Create & activate virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create .env (see template below)
```

**`backend/.env` template:**

```env
# ── VitalLens ──────────────────────────────────────────────────
VITALLENS_API_KEY=your_api_key_here

# true  = offline CHROM algorithm (no quota, no network needed)
# false = cloud API at api.rouast.com (requires valid key above)
VITALLENS_LOCAL=false

# ── FFmpeg ─────────────────────────────────────────────────────
FFMPEG_BIN=C:\Users\User\Downloads\ffmpeg-8.1-essentials_build\ffmpeg-8.1-essentials_build\bin

# ── Server ─────────────────────────────────────────────────────
PORT=8000
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

> **Having SSL / quota errors?** Set `VITALLENS_LOCAL=true` — fully offline, no upload needed.

```powershell
# Start backend
python main.py
```

Expected:
```
INFO: Uvicorn running on http://0.0.0.0:8000
INFO: Application startup complete.
```

Test: `curl http://localhost:8000/health`

---

### Step 2 — Frontend Setup

```powershell
# From project root
npm install
npm run dev
```

Expected:
```
▲ Next.js 16.2.0
  Local: http://localhost:3000
✓ Ready
```

---

### Step 3 — Use It

1. Open **http://localhost:3000**
2. Click **"Start Camera"** → allow camera permission
3. Click **"Record"** → 50-second countdown begins
4. Stay still, face centered in oval — recording auto-stops at 0
5. Wait 30–90 s for analysis
6. **Health Report** slides up with all metrics
7. Dismiss with **✕** or tap backdrop; repeat as needed

The **ambient bar** (top of mirror) shows:
- **Left** — Current KL weather from `api.data.gov.my` (no key needed)
- **Right** — Live clock + date (Malaysia time, UTC+8)

---

## File Structure

```
SmartMirror/
├── backend/
│   ├── main.py                  # FastAPI server
│   ├── requirements.txt
│   ├── .env                     # Your config (not committed)
│   └── venv/
│
├── components/
│   ├── smart-mirror.tsx         # Main orchestrator
│   ├── ambient-bar.tsx          # KL weather + clock (NEW)
│   ├── health-report.tsx        # Post-scan report panel (NEW)
│   ├── alignment-guide.tsx      # Scan oval (recording only)
│   ├── led-strip.tsx
│   ├── health-widget.tsx
│   └── wellness-widget.tsx
│
├── hooks/
│   ├── use-video-recorder.ts    # 50s auto-stop recorder
│   ├── use-weather.ts           # KL forecast (NEW)
│   └── use-clock.ts             # Live 1s clock (NEW)
│
├── lib/
│   ├── health-analysis-api.ts
│   ├── types.ts
│   └── utils.ts
│
├── README.md                    # Full documentation
└── SETUP_GUIDE.md               # This file
```

---

## Configuration Reference

| `.env` variable | Default | Notes |
|-----------------|---------|-------|
| `VITALLENS_API_KEY` | *(required for cloud)* | From rouast.com/api |
| `VITALLENS_LOCAL` | `false` | `true` = offline CHROM, no key/quota needed |
| `FFMPEG_BIN` | *(required)* | Path to folder with `ffmpeg.exe` |
| `PORT` | `8000` | Backend port |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated frontend origins |

---

## Common Issues

| Issue | Fix |
|-------|-----|
| `FFmpeg not found` | Check `FFMPEG_BIN` path in `.env`; verify `ffmpeg.exe` exists at that path |
| `API key not configured` | Add `VITALLENS_API_KEY` to `.env`, or set `VITALLENS_LOCAL=true` |
| SSL / quota / connection errors | Set `VITALLENS_LOCAL=true` — eliminates all cloud API issues |
| Camera denied | Browser Settings → Privacy → Camera → allow; refresh page |
| No face detected | Better lighting, center face in oval, reduce movement |
| Weather shows future date | Fixed — uses `toLocaleDateString` with `Asia/Kuala_Lumpur` timezone |
| CORS error | Confirm `CORS_ORIGINS` in `.env` matches `http://localhost:3000`; restart backend |

---

## API Reference

### `POST /api/health/process-video`

```
Content-Type: multipart/form-data
Body: { file: <video_blob> }
```

Response:
```json
{
  "success": true,
  "vital_signs": {
    "heart_rate":       { "value": 75, "confidence": 0.92, "unit": "bpm" },
    "respiratory_rate": { "value": 16, "confidence": 0.85, "unit": "rpm" },
    "hrv_sdnn":         { "value": 35, "unit": "ms" },
    "hrv_rmssd":        { "value": 28, "unit": "ms" }
  },
  "face": { "confidence": 0.95, "detected": true },
  "message": "Analysis complete"
}
```

### `GET /health`
```json
{ "status": "running", "version": "1.0.0" }
```

---

## Support

- **VitalLens Docs**: https://docs.rouast.com/python
- **Malaysia Open Data API**: https://api.data.gov.my
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **Next.js Docs**: https://nextjs.org/docs
- **FFmpeg**: https://ffmpeg.org/documentation.html

---

**Last Updated:** March 29, 2026
