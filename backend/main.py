"""
FastAPI backend for Smart Mirror rPPG analysis
Integrates with VitalLens API for vital signs estimation
"""

import os
import logging
import shutil
import subprocess
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from vitallens import VitalLens
from dotenv import load_dotenv
from pathlib import Path
import tempfile
import json

# Load environment variables
load_dotenv()

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure FFmpeg is available on PATH
def ensure_video_tools() -> None:
    """Ensure required system binaries are available for video probing/decoding."""
    ffmpeg_bin_dir = os.getenv("FFMPEG_BIN")
    if ffmpeg_bin_dir and os.path.isdir(ffmpeg_bin_dir):
        current_path = os.environ.get("PATH", "")
        if ffmpeg_bin_dir not in current_path:
            os.environ["PATH"] = f"{ffmpeg_bin_dir}{os.pathsep}{current_path}"
            logger.info(f"Added FFmpeg bin to PATH: {ffmpeg_bin_dir}")

    ffmpeg_bin = shutil.which("ffmpeg")
    ffprobe_bin = shutil.which("ffprobe")
    if not ffmpeg_bin or not ffprobe_bin:
        logger.error(f"FFmpeg not found. ffmpeg={ffmpeg_bin}, ffprobe={ffprobe_bin}")
        logger.error(f"Current PATH: {os.environ.get('PATH', 'NOT SET')}")
        logger.error(f"FFMPEG_BIN env var: {os.getenv('FFMPEG_BIN', 'NOT SET')}")

# Call it immediately when module loads
ensure_video_tools()

# Video processing configuration
VIDEO_FPS = int(os.getenv("VIDEO_FPS", "30"))

def convert_webm_to_mp4(webm_path: str) -> str:
    """Convert WebM video to MP4 for better compatibility with VitalLens."""
    mp4_path = webm_path.replace(".webm", ".mp4")
    try:
        logger.info(f"Converting {webm_path} to MP4 format at {VIDEO_FPS} fps...")
        result = subprocess.run(
            ["ffmpeg", "-i", webm_path, "-r", str(VIDEO_FPS), "-c:v", "libx264", "-crf", "28", "-c:a", "aac", "-y", mp4_path],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            logger.error(f"FFmpeg conversion error: {result.stderr}")
            raise RuntimeError(f"FFmpeg conversion failed: {result.stderr}")
        logger.info(f"Successfully converted to MP4: {mp4_path}")
        return mp4_path
    except subprocess.TimeoutExpired:
        raise RuntimeError("Video conversion timed out after 60 seconds")
    except Exception as e:
        logger.error(f"Conversion error: {e}")
        raise

# Initialize FastAPI app
app = FastAPI(
    title="Smart Mirror rPPG API",
    description="Backend API for vital signs analysis using VitalLens",
    version="1.0.0"
)

# Add CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=(os.getenv("CORS_ORIGINS", "http://localhost:3000")).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize VitalLens with API key
VITALLENS_API_KEY = os.getenv("VITALLENS_API_KEY")
if not VITALLENS_API_KEY:
    logger.warning("VITALLENS_API_KEY not set - API requests will fail")

# Initialize VitalLens client
vl = None


def get_vitallens():
    """Lazy initialize VitalLens client"""
    global vl
    if vl is None:
        if not VITALLENS_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="VitalLens API key not configured"
            )
        vl = VitalLens(method="vitallens", api_key=VITALLENS_API_KEY)
    return vl


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/health/process-video")
async def process_video(file: UploadFile = File(...)):
    """
    Process video file and return vital signs
    
    Expected: MP4, WebM, or other video formats supported by VitalLens
    Returns: Vital signs (heart rate, respiratory rate, HRV, etc.)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate file type (basic check)
    allowed_extensions = {".mp4", ".webm", ".mov", ".avi", ".flv"}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )

    try:
        # Initialize variables for cleanup
        tmp_path = None
        mp4_path = None
        
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            contents = await file.read()
            tmp_file.write(contents)
            tmp_path = tmp_file.name

        logger.info(f"Processing video: {file.filename} (temp path: {tmp_path})")

        # Convert WebM to MP4 if needed for better frame rate metadata
        video_to_process = tmp_path
        if file_ext.lower() == ".webm":
            mp4_path = convert_webm_to_mp4(tmp_path)
            video_to_process = mp4_path

        # Process video with VitalLens
        vl_client = get_vitallens()
        results = vl_client(video_to_process)

        # Extract vital signs from first result (single video processing)
        if not results or len(results) == 0:
            raise HTTPException(
                status_code=400,
                detail="VitalLens could not analyze the video. Ensure video contains a clear face."
            )

        vital_signs = results[0].get("vitals", {})

        # Format response
        response_data = {
            "success": True,
            "vital_signs": {
                "heart_rate": {
                    "value": vital_signs.get("heart_rate", {}).get("value"),
                    "unit": vital_signs.get("heart_rate", {}).get("unit", "bpm"),
                    "confidence": vital_signs.get("heart_rate", {}).get("confidence"),
                    "note": vital_signs.get("heart_rate", {}).get("note")
                },
                "respiratory_rate": {
                    "value": vital_signs.get("respiratory_rate", {}).get("value"),
                    "unit": vital_signs.get("respiratory_rate", {}).get("unit", "rpm"),
                    "confidence": vital_signs.get("respiratory_rate", {}).get("confidence"),
                    "note": vital_signs.get("respiratory_rate", {}).get("note")
                },
                "hrv_sdnn": vital_signs.get("hrv_sdnn", {}),
                "hrv_rmssd": vital_signs.get("hrv_rmssd", {}),
                "hrv_lfhf": vital_signs.get("hrv_lfhf", {}),
                "ppg_waveform": vital_signs.get("ppg_waveform", {}),
                "respiratory_waveform": vital_signs.get("respiratory_waveform", {}),
            },
            "face": results[0].get("face", {}),
            "message": results[0].get("message", "")
        }

        logger.info(f"Successfully processed video. HR: {response_data['vital_signs']['heart_rate']['value']}")

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing video: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing video: {str(e)}"
        )
    finally:
        # Cleanup temp files
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)
            logger.info(f"Cleaned up temp file: {tmp_path}")
        if 'mp4_path' in locals() and mp4_path and os.path.exists(mp4_path):
            os.unlink(mp4_path)
            logger.info(f"Cleaned up converted MP4: {mp4_path}")


@app.post("/api/health/process-video-base64")
async def process_video_base64(data: dict):
    """
    Alternative endpoint for processing base64 encoded video
    
    Expected JSON: {"video": "base64_encoded_video", "filename": "video.mp4"}
    """
    try:
        import base64
        
        if "video" not in data or "filename" not in data:
            raise HTTPException(
                status_code=400,
                detail="Missing 'video' or 'filename' in request body"
            )

        video_base64 = data["video"]
        filename = data["filename"]

        # Decode base64
        video_bytes = base64.b64decode(video_base64)

        # Validate file type
        allowed_extensions = {".mp4", ".webm", ".mov", ".avi", ".flv"}
        file_ext = Path(filename).suffix.lower()
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
            )

        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp_file:
            tmp_file.write(video_bytes)
            tmp_path = tmp_file.name

        logger.info(f"Processing base64 video: {filename}")

        # Process with VitalLens
        vl_client = get_vitallens()
        results = vl_client(tmp_path)

        if not results or len(results) == 0:
            raise HTTPException(
                status_code=400,
                detail="VitalLens could not analyze the video. Ensure video contains a clear face."
            )

        vital_signs = results[0].get("vitals", {})

        response_data = {
            "success": True,
            "vital_signs": {
                "heart_rate": {
                    "value": vital_signs.get("heart_rate", {}).get("value"),
                    "unit": vital_signs.get("heart_rate", {}).get("unit", "bpm"),
                    "confidence": vital_signs.get("heart_rate", {}).get("confidence"),
                    "note": vital_signs.get("heart_rate", {}).get("note")
                },
                "respiratory_rate": {
                    "value": vital_signs.get("respiratory_rate", {}).get("value"),
                    "unit": vital_signs.get("respiratory_rate", {}).get("unit", "rpm"),
                    "confidence": vital_signs.get("respiratory_rate", {}).get("confidence"),
                    "note": vital_signs.get("respiratory_rate", {}).get("note")
                },
                "hrv_sdnn": vital_signs.get("hrv_sdnn", {}),
                "hrv_rmssd": vital_signs.get("hrv_rmssd", {}),
                "hrv_lfhf": vital_signs.get("hrv_lfhf", {}),
                "ppg_waveform": vital_signs.get("ppg_waveform", {}),
                "respiratory_waveform": vital_signs.get("respiratory_waveform", {}),
            },
            "face": results[0].get("face", {}),
            "message": results[0].get("message", "")
        }

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing base64 video: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing video: {str(e)}"
        )
    finally:
        if 'tmp_path' in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logger.info("Smart Mirror rPPG API starting...")
    logger.info(f"CORS Origins: {os.getenv('CORS_ORIGINS', 'http://localhost:3000')}")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("Smart Mirror rPPG API shutting down...")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENVIRONMENT", "development") == "development"
    )
