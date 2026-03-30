from ultralytics import YOLO
import cv2
import numpy as np
import time

# =========================
# SETTINGS
# =========================
MODEL_PATH = "yolo11m-pose.pt"
VIDEO_SOURCE = 0  # webcam
INFERENCE_SIZE = 500  

model = YOLO(MODEL_PATH)


def open_camera(preferred_source=0):
    # Try common camera indices/backends so webcam opens reliably on Windows.
    candidates = [preferred_source, 0, 1]
    tried = set()

    for source in candidates:
        if source in tried:
            continue
        tried.add(source)

        cap_test = cv2.VideoCapture(source, cv2.CAP_DSHOW)
        if cap_test.isOpened():
            return cap_test, source
        cap_test.release()

        cap_test = cv2.VideoCapture(source)
        if cap_test.isOpened():
            return cap_test, source
        cap_test.release()

    return None, None


cap, active_source = open_camera(VIDEO_SOURCE)
if cap is None:
    raise RuntimeError(
        "Could not open camera. Close other apps using the webcam and try again."
    )

print(f"Camera opened on source index: {active_source}")

# Track previous positions for each person (using person index)
prev_positions = {}
fall_timers = {}
global_fall_timer = 0

# FPS tracking
prev_time = time.time()
fps = 0

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    # Run inference with reduced resolution for better FPS
    results = model(frame, imgsz=INFERENCE_SIZE, verbose=False, max_det=20)
    
    # Calculate FPS
    current_time = time.time()
    fps = 1 / (current_time - prev_time)
    prev_time = current_time

    if len(results) == 0:
        cv2.putText(frame, f"FPS: {int(fps)}", (50, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.imshow("Activity Recognition", frame)
        continue

    r = results[0]
    annotated = r.plot()
    
    # Always display FPS
    cv2.putText(annotated, f"FPS: {int(fps)}", (50, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)

    current_people = len(r.keypoints.xy) if r.keypoints is not None and len(r.keypoints.xy) > 0 else 0

    # Handle people disappearing from camera with high velocity
    for pid in list(prev_positions.keys()):
        if pid >= current_people:
            vel_x_last = prev_positions[pid].get('vel_x', 0)
            if vel_x_last > 15:
                # Trigger a global alert
                global_fall_timer = 30
            
            # Clean up tracking for disappeared person
            del prev_positions[pid]
            if pid in fall_timers:
                del fall_timers[pid]

    if global_fall_timer > 0:
        cv2.putText(annotated, "FALL DETECTED (Out of Frame)!", (50, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
        global_fall_timer -= 1

    # Check if any people detected
    if current_people > 0:
        num_people = current_people
        
        # Display people count
        cv2.putText(annotated, f"People Detected: {num_people}", (50, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 0), 2)

        # Process each person
        for person_id in range(num_people):
            kpts = r.keypoints.xy[person_id].cpu().numpy()
            box = r.boxes.xyxy[person_id].cpu().numpy()

            left_shoulder = kpts[5]
            right_shoulder = kpts[6]
            left_hip = kpts[11]
            right_hip = kpts[12]

            # Check if keypoints are detected (not at origin)
            keypoints_valid = (
                np.sum(left_shoulder) > 0 and np.sum(right_shoulder) > 0 and
                np.sum(left_hip) > 0 and np.sum(right_hip) > 0
            )
            
            if not keypoints_valid:
                continue

            shoulder_mid = (left_shoulder + right_shoulder) / 2
            hip_mid = (left_hip + right_hip) / 2

            # ---------------------
            # FEATURES
            # ---------------------

            # Torso angle (deviation from vertical)
            dx = shoulder_mid[0] - hip_mid[0]
            dy = shoulder_mid[1] - hip_mid[1]
            # Calculate angle from vertical (0° = upright, 90° = horizontal)
            angle = np.degrees(np.arctan2(abs(dx), abs(dy)))

            # Bounding ratio
            x1, y1, x2, y2 = box
            width = x2 - x1
            height = y2 - y1
            ratio = width / height

            # Initialize tracking for this person if not exists
            if person_id not in prev_positions:
                prev_positions[person_id] = {'hip_y': None, 'x': None}
                fall_timers[person_id] = 0

            # Vertical velocity
            if prev_positions[person_id]['hip_y'] is None:
                vel_y = 0
            else:
                vel_y = hip_mid[1] - prev_positions[person_id]['hip_y']

            # Horizontal velocity
            if prev_positions[person_id]['x'] is None:
                vel_x = 0
            else:
                vel_x = hip_mid[0] - prev_positions[person_id]['x']

            # Update previous positions for this person
            prev_positions[person_id]['hip_y'] = hip_mid[1]
            prev_positions[person_id]['x'] = hip_mid[0]
            prev_positions[person_id]['vel_x'] = abs(vel_x)

            # ---------------------
            # RULE-BASED CLASSIFIER
            # ---------------------

            # FALL - Sudden vertical drop + Angle > 60° + Ratio > 1
            if vel_y > 15 and angle > 60 and ratio > 1:
                activity = "Fall"
                fall_timers[person_id] = 15
            else:
                if fall_timers[person_id] == 0:
                    activity = "Non-fall"

            # Keep FALL visible for short duration
            if fall_timers[person_id] > 0:
                activity = "Fall"
                fall_timers[person_id] -= 1

            # Display activity label near person's head/top of bounding box
            label_x = int(x1)
            label_y = int(y1) - 10
            
            # Person number + Activity
            cv2.putText(annotated, f"Person {person_id + 1}: {activity}",
                        (label_x, label_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

            # Display debug info for first person only (to avoid clutter)
            if person_id == 0:
                cv2.putText(annotated, f"P1 - Angle: {int(angle)}", (50, 130),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                cv2.putText(annotated, f"P1 - Vel_Y: {vel_y:.1f}", (50, 160),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                cv2.putText(annotated, f"P1 - Vel_X: {abs(vel_x):.1f}", (50, 190),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                cv2.putText(annotated, f"P1 - Ratio: {ratio:.2f}", (50, 220),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    cv2.imshow("Activity Recognition", annotated)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()