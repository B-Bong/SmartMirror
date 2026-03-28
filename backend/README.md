# Smart Mirror rPPG Backend

FastAPI backend for analyzing vital signs using the VitalLens API.

## Features

- **Video Processing**: Accepts video files and processes them with VitalLens API
- **Vital Signs Extraction**: Returns heart rate, respiration rate, HRV metrics
- **CORS Support**: Configured for Next.js frontend communication
- **Error Handling**: Comprehensive error responses for debugging

## Prerequisites

- Python 3.10+
- FFmpeg installed and in PATH
- VitalLens API key (free tier available at https://www.rouast.com/api)

### Windows Requirements

- Microsoft Visual C++ Build Tools (for onnxruntime)
- Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/

## Setup

### 1. Install Dependencies

```bash
cd backend
python -m venv venv
venv\Scripts\activate  # On Windows
# or: source venv/bin/activate  # On macOS/Linux

pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

Edit `.env`:

```
VITALLENS_API_KEY=your_api_key_here
PORT=8000
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

Get your API key:
1. Visit https://www.rouast.com/api
2. Sign up for free tier
3. Copy your API key from dashboard
4. Paste into `.env` file

### 3. Run the Server

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The server will start at `http://localhost:8000`

## API Endpoints

### POST `/api/health/process-video`

Process a video file and extract vital signs.

**Request:**
- Content-Type: `multipart/form-data`
- Body: Video file (MP4, WebM, MOV, AVI, FLV)

**Response:**
```json
{
  "success": true,
  "vital_signs": {
    "heart_rate": {
      "value": 72.5,
      "unit": "bpm",
      "confidence": 0.85,
      "note": "..."
    },
    "respiratory_rate": {
      "value": 16.2,
      "unit": "rpm",
      "confidence": 0.79,
      "note": "..."
    },
    "hrv_sdnn": { "value": null },
    "hrv_rmssd": { "value": null },
    "hrv_lfhf": { "value": null },
    "ppg_waveform": {},
    "respiratory_waveform": {}
  },
  "face": {
    "confidence": 0.92,
    "note": "..."
  },
  "message": "..."
}
```

### POST `/api/health/process-video-base64`

Alternative endpoint for base64 encoded video (useful for browser uploads).

**Request:**
```json
{
  "video": "base64_encoded_video_data",
  "filename": "video.webm"
}
```

**Response:** Same as above

### GET `/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

## Video Processing

### Optimal Settings

- **Duration**: 50-60 seconds for best accuracy
- **Format**: MP4, WebM (WebM recommended for browser recording)
- **Resolution**: 640x480 minimum, 1280x720 recommended
- **Lighting**: Natural or well-lit environment
- **Face**: Clear face visible, looking at camera

### Processing Time

- **Free Tier**: 30-120 seconds per video (depends on server load)
- **Paid Tier**: Faster processing
- **Confidence**: Higher confidence scores (>0.7) indicate reliable results

## Frontend Integration

The frontend records 50 seconds of video using `MediaRecorder API`, then uploads to this backend endpoint.

### Environment Variables (Frontend)

Add to `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Example Setup

1. **Start Backend:**
   ```bash
   cd backend
   python main.py
   ```

2. **Start Frontend:**
   ```bash
   npm run dev
   ```

3. **Use Smart Mirror:**
   - Click "Start Camera"
   - Click "Record"
   - Wait 50 seconds (auto-stops)
   - Results display in 1-2 minutes

## Troubleshooting

### "VitalLens API key not configured"
- Check `.env` file has `VITALLENS_API_KEY`
- Verify API key is valid
- Restart server after changing `.env`

### "Could not analyze the video"
- Ensure face is clearly visible
- Check lighting is adequate
- Ensure video duration is 30+ seconds
- Try re-recording with better face positioning

### FFmpeg not found
- Install FFmpeg: https://ffmpeg.org/download.html
- Add to PATH environment variable
- Restart terminal and verify: `ffmpeg -version`

### Connection refused
- Check backend is running on correct port
- Verify `CORS_ORIGINS` includes frontend URL
- Check firewall settings

### Video too large / Upload timeout
- Keep video under 50MB
- Increase timeout in frontend if needed
- Consider splitting longer sessions

## Development

### Testing API Locally

```bash
# Test with curl (Linux/macOS)
curl -X POST \
  -F "file=@path/to/video.mp4" \
  http://localhost:8000/api/health/process-video

# Test health check
curl http://localhost:8000/health
```

### Logs

The backend outputs logs to console. For production, redirect to file:

```bash
python main.py > logs.txt 2>&1
```

## Performance Optimization

### For Production

1. **Use Gunicorn:**
   ```bash
   pip install gunicorn
   gunicorn -w 4 -b 0.0.0.0:8000 main:app
   ```

2. **Enable Caching:**
   - Consider caching analysis results for same video
   - Implement request rate limiting

3. **Database:**
   - Store analysis history in PostgreSQL/MongoDB
   - Track user sessions

4. **Docker:**
   ```bash
   docker build -t smart-mirror-api .
   docker run -p 8000:8000 -e VITALLENS_API_KEY=xxx smart-mirror-api
   ```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## License

MIT
