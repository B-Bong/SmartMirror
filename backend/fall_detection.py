"""
Fall Detection module for Smart Mirror.

Wraps YOLOv11-pose inference with a rule-based fall classifier.
Designed for WebSocket integration: accepts JPEG bytes per frame,
returns a structured dict — no camera, no cv2 windows.
"""

import cv2
import numpy as np
import logging
from typing import Optional
from ultralytics import YOLO

logger = logging.getLogger(__name__)


class FallDetector:
    """
    Stateful fall detector that processes video frames.

    Each WebSocket connection should get its own FallDetector instance
    so that per-person tracking state remains isolated per session.
    The underlying YOLO model object can be shared across instances
    (it is stateless during inference).

    Detection logic (ported exactly from original script):
      - Extracts shoulder & hip keypoints per person
      - Computes torso angle, bounding box ratio, and vertical velocity
      - FALL condition: vel_y > 15 AND angle > 60° AND ratio > 1
      - Fall label persists for 15 frames per person after trigger
      - Global alert fires for 30 frames when a person exits frame with vel_x > 15
    """

    def __init__(self, model: YOLO, inference_size: int = 640) -> None:
        """
        Args:
            model:          Pre-loaded YOLO pose model (shared across instances).
            inference_size: Image resolution fed to YOLO (must be multiple of 32).
        """
        self.model = model
        self.inference_size = inference_size
        self.reset()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def reset(self) -> None:
        """Reset all per-connection tracking state."""
        self.prev_positions: dict = {}   # {person_id: {hip_y, x, vel_x}}
        self.fall_timers: dict = {}      # {person_id: frames_remaining}
        self.global_fall_timer: int = 0  # frames remaining for out-of-frame alert

    def process_frame(self, jpeg_bytes: bytes) -> dict:
        """
        Process a single JPEG frame and return fall detection results.

        Args:
            jpeg_bytes: Raw JPEG bytes (from browser canvas.toBlob).

        Returns:
            {
                "fall_detected":        bool,   # any person classified as falling
                "global_fall_detected": bool,   # someone exited frame at high speed
                "people_count":         int,    # people detected this frame
                "people": [
                    {
                        "person_id": int,
                        "activity":  "Fall" | "Non-fall",
                        "angle":     float,   # torso angle from vertical (degrees)
                        "vel_y":     float,   # downward hip velocity (pixels/frame)
                        "vel_x":     float,   # horizontal hip velocity (pixels/frame)
                        "ratio":     float,   # bbox width / height
                        "bbox":      [x1, y1, x2, y2]
                    },
                    ...
                ]
            }
        """
        # Decode JPEG bytes → numpy BGR frame
        nparr = np.frombuffer(jpeg_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            logger.warning("FallDetector: failed to decode JPEG frame")
            return self._empty_result()

        # Run YOLO pose inference
        results = self.model(frame, imgsz=self.inference_size, verbose=False, max_det=20)

        if not results or len(results) == 0:
            return self._empty_result()

        r = results[0]
        current_people = (
            len(r.keypoints.xy)
            if r.keypoints is not None and len(r.keypoints.xy) > 0
            else 0
        )

        # ── Handle people who disappeared from the frame ──────────────
        for pid in list(self.prev_positions.keys()):
            if pid >= current_people:
                vel_x_last = self.prev_positions[pid].get("vel_x", 0)
                if vel_x_last > 15:
                    # Sudden high-speed lateral exit → global alert
                    self.global_fall_timer = 30
                del self.prev_positions[pid]
                if pid in self.fall_timers:
                    del self.fall_timers[pid]

        # Tick down global fall timer
        if self.global_fall_timer > 0:
            self.global_fall_timer -= 1

        # ── Process each detected person ──────────────────────────────
        people_results = []
        fall_detected = False

        for person_id in range(current_people):
            person_data = self._process_person(r, person_id)
            if person_data is None:
                continue
            people_results.append(person_data)
            if person_data["activity"] == "Fall":
                fall_detected = True

        return {
            "fall_detected": fall_detected,
            "global_fall_detected": self.global_fall_timer > 0,
            "people_count": current_people,
            "people": people_results,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _process_person(self, result, person_id: int) -> Optional[dict]:
        """Classify a single person's activity and return their data."""
        kpts = result.keypoints.xy[person_id].cpu().numpy()
        box = result.boxes.xyxy[person_id].cpu().numpy()

        # COCO keypoint indices
        left_shoulder  = kpts[5]
        right_shoulder = kpts[6]
        left_hip       = kpts[11]
        right_hip      = kpts[12]

        # Skip if any key joint is undetected (at origin)
        if not (
            np.sum(left_shoulder)  > 0 and
            np.sum(right_shoulder) > 0 and
            np.sum(left_hip)       > 0 and
            np.sum(right_hip)      > 0
        ):
            return None

        shoulder_mid = (left_shoulder + right_shoulder) / 2
        hip_mid      = (left_hip + right_hip) / 2

        # Torso angle from vertical: 0° = upright, 90° = lying flat
        dx = shoulder_mid[0] - hip_mid[0]
        dy = shoulder_mid[1] - hip_mid[1]
        angle = float(np.degrees(np.arctan2(abs(dx), abs(dy))))

        # Bounding box aspect ratio
        x1, y1, x2, y2 = box
        width  = x2 - x1
        height = y2 - y1
        ratio  = float(width / height) if height > 0 else 0.0

        # Initialise tracking state for a newly-appeared person
        if person_id not in self.prev_positions:
            self.prev_positions[person_id] = {"hip_y": None, "x": None, "vel_x": 0}
            self.fall_timers[person_id] = 0

        prev = self.prev_positions[person_id]

        vel_y = float(hip_mid[1] - prev["hip_y"]) if prev["hip_y"] is not None else 0.0
        vel_x = float(hip_mid[0] - prev["x"])     if prev["x"]     is not None else 0.0

        # Update tracking
        self.prev_positions[person_id]["hip_y"] = float(hip_mid[1])
        self.prev_positions[person_id]["x"]     = float(hip_mid[0])
        self.prev_positions[person_id]["vel_x"] = abs(vel_x)

        # ── Rule-based classifier ─────────────────────────────────────
        # Sudden downward drop + near-horizontal torso + wide bounding box
        activity = "Non-fall"
        if vel_y > 15 and angle > 60 and ratio > 1:
            activity = "Fall"
            self.fall_timers[person_id] = 15

        # Keep "Fall" label visible for the duration of the fall timer
        if self.fall_timers[person_id] > 0:
            activity = "Fall"
            self.fall_timers[person_id] -= 1

        return {
            "person_id": person_id,
            "activity":  activity,
            "angle":     round(angle, 1),
            "vel_y":     round(vel_y, 1),
            "vel_x":     round(abs(vel_x), 1),
            "ratio":     round(ratio, 2),
            "bbox":      [float(x1), float(y1), float(x2), float(y2)],
        }

    def _empty_result(self) -> dict:
        """Return a safe empty result, preserving the global timer state."""
        return {
            "fall_detected":        False,
            "global_fall_detected": self.global_fall_timer > 0,
            "people_count":         0,
            "people":               [],
        }


# ── Module-level helper ────────────────────────────────────────────────────────

def load_fall_model(model_path: str) -> Optional[YOLO]:
    """
    Load a YOLO pose model from disk.

    Returns:
        YOLO instance if successful, None if the file is missing or load fails.
    """
    import os
    if not os.path.isfile(model_path):
        logger.warning(f"Fall detection model not found at: {model_path}")
        return None
    try:
        model = YOLO(model_path)
        logger.info(f"Fall detection model loaded successfully: {model_path}")
        return model
    except Exception as exc:
        logger.error(f"Failed to load fall detection model: {exc}", exc_info=True)
        return None
