"""
FastAPI backend for Smart Mirror rPPG analysis
Integrates with VitalLens API for vital signs estimation
Also provides real-time fall detection via WebSocket.
"""

import os
import asyncio
import logging
import shutil
import subprocess
import math
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from vitallens import VitalLens
from dotenv import load_dotenv
from pathlib import Path
import tempfile
import json
from datetime import datetime, timezone
from supabase import create_client, Client as SupabaseClient
from health_insights import generate_and_store_insights

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
VIDEO_FPS = int(os.getenv("VIDEO_FPS", "15"))
BASE_DIR = Path(__file__).resolve().parent
AVERAGE_JSON_PATH = BASE_DIR / "vitals_average.json"

# ── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
ELDERLY_ID = os.getenv("ELDERLY_ID", "1b9418fc-a707-4da1-8a44-c30c11ac1ee8")

supabase: SupabaseClient | None = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        logger.info("Supabase client initialised successfully")
    except Exception as exc:
        logger.error(f"Failed to initialise Supabase client: {exc}")
else:
    logger.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — database uploads disabled")

AVERAGE_METRICS = {
    "heart_rate": {
        "label": "Heart Rate",
        "source_key": "heart_rate",
        "unit": "bpm",
    },
    "respiratory_rate": {
        "label": "Respiratory Rate",
        "source_key": "respiratory_rate",
        "unit": "rpm",
    },
    "hrv_sdnn": {
        "label": "HRV (SDNN)",
        "source_key": "hrv_sdnn",
        "unit": "ms",
    },
    "hrv_rmssd": {
        "label": "HRV (RMSSD)",
        "source_key": "hrv_rmssd",
        "unit": "ms",
    },
    "hrv_lfhf": {
        "label": "HRV (LF/HF)",
        "source_key": "hrv_lfhf",
        "unit": "ratio",
    },
}


def _to_float(value) -> Optional[float]:
    """Convert a numeric value to float; return None for invalid values."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _rolling_metric_mean(result_item: dict, metric_name: str) -> Optional[float]:
    """Compute mean of valid rolling metric values (ignoring NaN/inf)."""
    rolling_series = (
        result_item.get("rolling_vitals", {})
        .get(metric_name, {})
        .get("data", [])
    )
    if not isinstance(rolling_series, list):
        return None

    valid_values = []
    for raw in rolling_series:
        value = _to_float(raw)
        if value is None or math.isnan(value) or math.isinf(value):
            continue
        valid_values.append(value)

    if not valid_values:
        return None
    return sum(valid_values) / len(valid_values)


def _extract_measurement_values(result_item: dict) -> dict:
    """Extract tracked metric values, with Heart Rate fallback from rolling data."""
    vital_signs = result_item.get("vitals", {})
    measurement_values = {}
    for metric_name, config in AVERAGE_METRICS.items():
        source_data = vital_signs.get(config["source_key"], {})
        measurement_values[metric_name] = _to_float(source_data.get("value"))

    # Some VitalLens payloads omit global heart_rate while still providing rolling values.
    if measurement_values["heart_rate"] is None:
        measurement_values["heart_rate"] = _rolling_metric_mean(result_item, "heart_rate")

    return measurement_values


def _build_heart_rate_response(result_item: dict, vital_signs: dict) -> dict:
    """Return heart-rate payload with fallback to rolling average when needed."""
    hr_payload = vital_signs.get("heart_rate", {})
    hr_value = _to_float(hr_payload.get("value"))

    if hr_value is not None and not math.isnan(hr_value) and not math.isinf(hr_value):
        return {
            "value": hr_value,
            "unit": hr_payload.get("unit", "bpm"),
            "confidence": hr_payload.get("confidence"),
            "note": hr_payload.get("note"),
        }

    fallback_hr = _rolling_metric_mean(result_item, "heart_rate")
    rolling_hr = result_item.get("rolling_vitals", {}).get("heart_rate", {})
    return {
        "value": fallback_hr,
        "unit": rolling_hr.get("unit", "bpm"),
        "confidence": hr_payload.get("confidence"),
        "note": (
            "Computed from rolling heart-rate series (mean of valid frame-wise values)."
            if fallback_hr is not None
            else hr_payload.get("note")
        ),
    }


def update_average_output(result_item: dict) -> None:
    """Update persistent running averages and write them to vitals_average.json."""
    measurement_values = _extract_measurement_values(result_item)

    if AVERAGE_JSON_PATH.exists():
        try:
            with open(AVERAGE_JSON_PATH, "r", encoding="utf-8") as f:
                average_data = json.load(f)
        except Exception:
            average_data = {}
    else:
        average_data = {}

    metrics_state = average_data.get("metrics", {})

    output_metrics = {}
    flat_metrics = {}
    for metric_name, config in AVERAGE_METRICS.items():
        previous = metrics_state.get(metric_name, {})
        prev_count = int(previous.get("count", 0)) if isinstance(previous, dict) else 1
        prev_average = _to_float(previous.get("average")) if isinstance(previous, dict) else _to_float(previous)
        if prev_average is None:
            prev_average = 0.0

        current_value = measurement_values.get(metric_name)
        if current_value is None:
            new_count = prev_count
            new_average = prev_average if prev_count > 0 else None
        else:
            new_count = prev_count + 1
            new_average = ((prev_average * prev_count) + current_value) / new_count

        # Save the new state for reading next time (internal format)
        output_metrics[metric_name] = {
            "label": config["label"],
            "unit": config["unit"],
            "latest": current_value,
            "average": round(new_average, 4) if new_average is not None else None,
            "count": new_count,
        }
        
        flat_metrics[metric_name] = round(new_average, 4) if new_average is not None else None

    # Save state internally so counting still works
    state_data = {
        "updated_at": datetime.now().isoformat(),
        "metrics": output_metrics,
    }
    with open(AVERAGE_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(state_data, f, indent=4)

    # Calculate Summary metrics
    heart_rate = flat_metrics.get("heart_rate")
    respiratory_rate = flat_metrics.get("respiratory_rate")
    hrv_sdnn = flat_metrics.get("hrv_sdnn")

    stress_level = "Low"
    if heart_rate is not None:
        if heart_rate > 100:
            stress_level = "High"
        elif heart_rate > 90 or hrv_sdnn is None:
            stress_level = "Moderate"

    wellness_score = 0
    if heart_rate is not None and respiratory_rate is not None:
        hr_norm = max(0, 100 - abs(heart_rate - 75) / 0.5)
        rr_norm = max(0, 100 - abs(respiratory_rate - 16) / 0.25)
        
        # HRV component (Scaling 15ms -> 0 to 55ms -> 100)
        if hrv_sdnn is not None:
            hrv_norm = min(100, max(0, (hrv_sdnn - 15) * 2.5))
        else:
            hrv_norm = 40  # Penalty for no HRV data or use moderate assumption
        
        # New weighted calculation (30% HR, 30% RR, 25% HRV, 15% Base Confidence)
        wellness_score = round(hr_norm * 0.3 + rr_norm * 0.3 + hrv_norm * 0.25 + 15)
        wellness_score = max(0, min(100, wellness_score))

    output_data = {
        "updated_at": datetime.now().isoformat(),
        "metrics": flat_metrics,
        "summary": {
            "wellness_score": wellness_score,
            "stress_level": stress_level
        }
    }

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped_json_path = BASE_DIR / f"vitals_average_{timestamp}.json"

    with open(timestamped_json_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=4)

    logger.info(f"Running averages saved to: {timestamped_json_path.name}")

    return flat_metrics, wellness_score, stress_level


def upload_vitals_to_supabase(flat_metrics: dict, wellness_score: int, stress_level: str) -> Optional[str]:
    """Insert a row into the `vitals` table and update the `elderlies` row.

    Silently logs on failure so it never breaks the main measurement flow.
    """
    if supabase is None:
        logger.warning("Supabase client not available — skipping DB upload")
        return None

    now_iso = datetime.now(timezone.utc).isoformat()

    vitals_row = {
        "elderly_id":       ELDERLY_ID,
        "heart_rate":       flat_metrics.get("heart_rate"),
        "respiratory_rate": flat_metrics.get("respiratory_rate"),
        "hrv_sdnn":         flat_metrics.get("hrv_sdnn"),
        "hrv_rmssd":        flat_metrics.get("hrv_rmssd"),
        "hrv_lfhf":         flat_metrics.get("hrv_lfhf"),
        "wellness_score":   wellness_score,
        "stress_level":     stress_level,
        "recorded_at":      now_iso,
    }

    try:
        result = supabase.table("vitals").insert(vitals_row).execute()
        vitals_id = result.data[0]['id'] if result.data else None
        logger.info(f"Vitals uploaded to Supabase (id={vitals_id})")
        return vitals_id
    except Exception as exc:
        logger.error(f"Failed to insert vitals into Supabase: {exc}", exc_info=True)
        return None


def convert_webm_to_mp4(webm_path: str) -> str:
    """Convert WebM video to MP4 for better compatibility with VitalLens."""
    mp4_path = webm_path.replace(".webm", ".mp4")
    try:
        logger.info(f"Converting {webm_path} to MP4 format at {VIDEO_FPS} fps...")
        result = subprocess.run(
            ["ffmpeg", "-i", webm_path, "-r", str(VIDEO_FPS),
             "-vf", "scale='min(640,iw)':-2",  # cap at 640px wide, keep aspect
             "-c:v", "libx264", "-crf", "32", "-preset", "fast",
             "-c:a", "aac", "-y", mp4_path],
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

# ── Fall detection ────────────────────────────────────────────────────────────
# Model is loaded once at startup and shared across WebSocket connections.
# Each connection gets its own FallDetector instance for isolated tracking state.
FALL_MODEL_PATH = os.getenv("FALL_MODEL_PATH", "models/yolo11m-pose.pt")
fall_yolo_model = None  # type: Optional[object]


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
async def process_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
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

        # Save raw API response to disk for external use
        raw_filename = f"vitallens_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(raw_filename, "w") as f:
            json.dump(results, f, indent=4)
        logger.info(f"Raw VitalLens response saved to: {raw_filename}")

        # Extract vital signs from first result (single video processing)
        if not results or len(results) == 0:
            raise HTTPException(
                status_code=400,
                detail="VitalLens could not analyze the video. Ensure video contains a clear face."
            )

        result_item = results[0]
        vital_signs = result_item.get("vitals", {})
        heart_rate_response = _build_heart_rate_response(result_item, vital_signs)

        # Persist running averages for key vital metrics after each measurement.
        flat_metrics, ws_score, sl_level = update_average_output(result_item)
        vitals_id = upload_vitals_to_supabase(flat_metrics, ws_score, sl_level)

        # Trigger background task for health insights
        if vitals_id and supabase:
            vitals_data_for_llm = {
                "heart_rate": flat_metrics.get("heart_rate"),
                "respiratory_rate": flat_metrics.get("respiratory_rate"),
                "hrv_sdnn": flat_metrics.get("hrv_sdnn"),
                "hrv_rmssd": flat_metrics.get("hrv_rmssd"),
                "hrv_lfhf": flat_metrics.get("hrv_lfhf"),
                "wellness_score": ws_score,
                "stress_level": sl_level
            }
            background_tasks.add_task(
                generate_and_store_insights,
                supabase,
                ELDERLY_ID,
                vitals_id,
                vitals_data_for_llm
            )

        # Format response
        response_data = {
            "success": True,
            "vital_signs": {
                "heart_rate": {
                    "value": flat_metrics.get("heart_rate"),
                    "unit": heart_rate_response.get("unit", "bpm"),
                    "confidence": heart_rate_response.get("confidence"),
                    "note": heart_rate_response.get("note")
                },
                "respiratory_rate": {
                    "value": flat_metrics.get("respiratory_rate"),
                    "unit": vital_signs.get("respiratory_rate", {}).get("unit", "rpm"),
                    "confidence": vital_signs.get("respiratory_rate", {}).get("confidence"),
                    "note": vital_signs.get("respiratory_rate", {}).get("note")
                },
                "hrv_sdnn": { **vital_signs.get("hrv_sdnn", {}), "value": flat_metrics.get("hrv_sdnn") } if vital_signs.get("hrv_sdnn") else vital_signs.get("hrv_sdnn", {}),
                "hrv_rmssd": { **vital_signs.get("hrv_rmssd", {}), "value": flat_metrics.get("hrv_rmssd") } if vital_signs.get("hrv_rmssd") else vital_signs.get("hrv_rmssd", {}),
                "hrv_lfhf": { **vital_signs.get("hrv_lfhf", {}), "value": flat_metrics.get("hrv_lfhf") } if vital_signs.get("hrv_lfhf") else vital_signs.get("hrv_lfhf", {}),
                "ppg_waveform": vital_signs.get("ppg_waveform", {}),
                "respiratory_waveform": vital_signs.get("respiratory_waveform", {}),
            },
            "summary": {
                "wellness_score": ws_score,
                "stress_level": sl_level
            },
            "face": result_item.get("face", {}),
            "message": result_item.get("message", "")
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
async def process_video_base64(background_tasks: BackgroundTasks, data: dict):
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

        result_item = results[0]
        vital_signs = result_item.get("vitals", {})
        heart_rate_response = _build_heart_rate_response(result_item, vital_signs)

        # Persist running averages for key vital metrics after each measurement.
        flat_metrics, ws_score, sl_level = update_average_output(result_item)
        vitals_id = upload_vitals_to_supabase(flat_metrics, ws_score, sl_level)

        # Trigger background task for health insights
        if vitals_id and supabase:
            vitals_data_for_llm = {
                "heart_rate": flat_metrics.get("heart_rate"),
                "respiratory_rate": flat_metrics.get("respiratory_rate"),
                "hrv_sdnn": flat_metrics.get("hrv_sdnn"),
                "hrv_rmssd": flat_metrics.get("hrv_rmssd"),
                "hrv_lfhf": flat_metrics.get("hrv_lfhf"),
                "wellness_score": ws_score,
                "stress_level": sl_level
            }
            background_tasks.add_task(
                generate_and_store_insights,
                supabase,
                ELDERLY_ID,
                vitals_id,
                vitals_data_for_llm
            )

        response_data = {
            "success": True,
            "vital_signs": {
                "heart_rate": {
                    "value": flat_metrics.get("heart_rate"),
                    "unit": heart_rate_response.get("unit", "bpm"),
                    "confidence": heart_rate_response.get("confidence"),
                    "note": heart_rate_response.get("note")
                },
                "respiratory_rate": {
                    "value": flat_metrics.get("respiratory_rate"),
                    "unit": vital_signs.get("respiratory_rate", {}).get("unit", "rpm"),
                    "confidence": vital_signs.get("respiratory_rate", {}).get("confidence"),
                    "note": vital_signs.get("respiratory_rate", {}).get("note")
                },
                "hrv_sdnn": { **vital_signs.get("hrv_sdnn", {}), "value": flat_metrics.get("hrv_sdnn") } if vital_signs.get("hrv_sdnn") else vital_signs.get("hrv_sdnn", {}),
                "hrv_rmssd": { **vital_signs.get("hrv_rmssd", {}), "value": flat_metrics.get("hrv_rmssd") } if vital_signs.get("hrv_rmssd") else vital_signs.get("hrv_rmssd", {}),
                "hrv_lfhf": { **vital_signs.get("hrv_lfhf", {}), "value": flat_metrics.get("hrv_lfhf") } if vital_signs.get("hrv_lfhf") else vital_signs.get("hrv_lfhf", {}),
                "ppg_waveform": vital_signs.get("ppg_waveform", {}),
                "respiratory_waveform": vital_signs.get("respiratory_waveform", {}),
            },
            "summary": {
                "wellness_score": ws_score,
                "stress_level": sl_level
            },
            "face": result_item.get("face", {}),
            "message": result_item.get("message", "")
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


@app.get("/api/drops/unread")
async def get_unread_drops():
    """Fetch the oldest unread daily drop to display on the mirror."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    try:
        # Get oldest unread to maintain queue order
        response = supabase.table("daily_drops").select("*").eq("elderly_id", ELDERLY_ID).eq("is_viewed", False).order("created_at", desc=False).limit(1).execute()
        
        if not response.data:
            return {"has_drop": False}
        
        return {
            "has_drop": True,
            "drop": response.data[0]
        }
    except Exception as e:
        logger.error(f"Error fetching drops: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/drops/{drop_id}/mark-viewed")
async def mark_drop_viewed(drop_id: str):
    """Mark a daily drop as viewed."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")
    try:
        supabase.table("daily_drops").update({"is_viewed": True}).eq("id", drop_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking drop viewed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    global fall_yolo_model
    logger.info("Smart Mirror rPPG API starting...")
    logger.info(f"CORS Origins: {os.getenv('CORS_ORIGINS', 'http://localhost:3000')}")

    # Load fall detection model (expensive — do it once at startup)
    try:
        from fall_detection import load_fall_model
        fall_yolo_model = load_fall_model(FALL_MODEL_PATH)
        if fall_yolo_model:
            logger.info(f"Fall detection ready: {FALL_MODEL_PATH}")
        else:
            logger.warning("Fall detection disabled — model file not found at: " + FALL_MODEL_PATH)
    except Exception as exc:
        logger.error(f"Failed to initialise fall detection: {exc}", exc_info=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logger.info("Smart Mirror rPPG API shutting down...")


# ── Fall Detection WebSocket ───────────────────────────────────────────────────

@app.websocket("/ws/fall-detection")
async def fall_detection_ws(websocket: WebSocket):
    """
    Real-time fall detection via WebSocket.

    Protocol:
      Client → Server : raw JPEG bytes (single frame, 320×240 recommended)
      Server → Client : JSON string matching FallDetectionResult schema

    Each connection gets a fresh FallDetector so tracking state (prev_positions,
    fall_timers, global_fall_timer) is fully isolated per session.
    Inference runs in a thread-pool executor so the async event loop is never
    blocked by the CPU-bound YOLO forward pass.
    """
    await websocket.accept()

    if fall_yolo_model is None:
        # Gracefully inform the client instead of silently closing
        await websocket.send_json({
            "error":                "Fall detection model not loaded",
            "fall_detected":        False,
            "global_fall_detected": False,
            "people_count":         0,
            "people":               [],
        })
        await websocket.close(code=1011, reason="Model not loaded")
        return

    from fall_detection import FallDetector
    detector = FallDetector(fall_yolo_model)
    loop = asyncio.get_running_loop()

    logger.info("Fall detection WebSocket connected")
    try:
        while True:
            # Receive one JPEG frame from the browser
            jpeg_bytes = await websocket.receive_bytes()

            # Run inference in thread pool (CPU-bound YOLO — must not block loop)
            result = await loop.run_in_executor(
                None, detector.process_frame, jpeg_bytes
            )

            # Send detection result back as JSON
            await websocket.send_json(result)

    except WebSocketDisconnect:
        logger.info("Fall detection WebSocket disconnected")
    except Exception as exc:
        logger.error(f"Fall detection WebSocket error: {exc}", exc_info=True)


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENVIRONMENT", "development") == "development"
    )
