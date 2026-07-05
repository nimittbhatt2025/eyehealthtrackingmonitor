"""
Eye Detection and Fatigue Analysis using Computer Vision

This module contains AI models for:
1. Eye detection using MediaPipe Face Mesh
2. Blink detection using Eye Aspect Ratio (EAR)
3. Squint detection
4. Redness detection
5. Fatigue score calculation
"""

import cv2
import numpy as np
from typing import Dict, Any, Tuple, Optional, List
from collections import deque

# Placeholder for MediaPipe - will be initialized when needed
_face_mesh = None
_mp_face_mesh = None

# Eye landmarks for MediaPipe Face Mesh
LEFT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]

# EAR threshold for blink detection
# Lower threshold = more strict (only counts clear blinks)
# Typical EAR values: open eye ~0.3, closed eye ~0.1-0.15
# Making this VERY strict to avoid false positives
EAR_THRESHOLD = 0.15  # Much stricter - only clear eye closures
CONSEC_FRAMES = 4     # Require 4 consecutive frames (was 3)

def get_face_mesh():
    """Lazy load MediaPipe Face Mesh"""
    global _face_mesh, _mp_face_mesh
    if _face_mesh is None:
        try:
            import mediapipe as mp
            _mp_face_mesh = mp.solutions.face_mesh
            _face_mesh = _mp_face_mesh.FaceMesh(
                static_image_mode=False,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5
            )
        except ImportError:
            print("Warning: MediaPipe not installed. Install with: pip install mediapipe")
    return _face_mesh


def calculate_ear(eye_landmarks: np.ndarray) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) for blink detection
    
    EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
    
    Args:
        eye_landmarks: Array of 6 (x,y) coordinates for eye landmarks
        
    Returns:
        Eye aspect ratio value
    """
    # Vertical eye distances
    A = np.linalg.norm(eye_landmarks[1] - eye_landmarks[5])
    B = np.linalg.norm(eye_landmarks[2] - eye_landmarks[4])
    
    # Horizontal eye distance  
    C = np.linalg.norm(eye_landmarks[0] - eye_landmarks[3])
    
    # EAR formula
    ear = (A + B) / (2.0 * C)
    return ear


def detect_eyes(frame: np.ndarray) -> Dict[str, Any]:
    """
    Detect eyes and calculate EAR in a video frame using MediaPipe
    
    Args:
        frame: Video frame as numpy array (BGR format)
        
    Returns:
        Dictionary containing eye detection results and EAR values
    """
    mesh = get_face_mesh()
    
    if mesh is None:
        return {'detected': False, 'error': 'Face mesh not available'}
    
    try:
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = mesh.process(rgb_frame)
        
        if not results.multi_face_landmarks:
            return {'detected': False}
        
        # Get first face landmarks
        face_landmarks = results.multi_face_landmarks[0]
        h, w = frame.shape[:2]
        
        # Extract left eye landmarks
        left_eye = np.array([
            (face_landmarks.landmark[idx].x * w, face_landmarks.landmark[idx].y * h)
            for idx in LEFT_EYE_LANDMARKS
        ])
        
        # Extract right eye landmarks
        right_eye = np.array([
            (face_landmarks.landmark[idx].x * w, face_landmarks.landmark[idx].y * h)
            for idx in RIGHT_EYE_LANDMARKS
        ])
        
        # Calculate EAR for each eye
        left_ear = calculate_ear(left_eye)
        right_ear = calculate_ear(right_eye)
        avg_ear = (left_ear + right_ear) / 2.0
        
        return {
            'detected': True,
            'left_eye': left_eye.tolist(),
            'right_eye': right_eye.tolist(),
            'left_ear': float(left_ear),
            'right_ear': float(right_ear),
            'avg_ear': float(avg_ear),
            'is_blinking': avg_ear < EAR_THRESHOLD
        }
        
    except Exception as e:
        return {'detected': False, 'error': str(e)}


def analyze_blink(frames: List[np.ndarray], fps: int = 30) -> Dict[str, Any]:
    """
    Analyze blinking patterns from video frames using EAR algorithm
    
    Args:
        frames: List of video frames
        fps: Frames per second of video
        
    Returns:
        Dictionary containing blink analysis
    """
    if not frames:
        return {'error': 'No frames provided'}
    
    blink_count = 0
    blink_started = False
    blink_frame_count = 0
    blink_durations = []
    ear_values = []
    frames_since_last_blink = 0
    MIN_FRAMES_BETWEEN_BLINKS = 10  # Increased from 5 - prevent micro-movements
    MAX_BLINK_DURATION_FRAMES = 15  # Maximum frames for a valid blink
    
    for frame in frames:
        eye_data = detect_eyes(frame)
        
        if not eye_data.get('detected'):
            continue
            
        ear = eye_data.get('avg_ear', 0.3)
        ear_values.append(ear)
        frames_since_last_blink += 1
        
        # Detect blink using EAR threshold
        if ear < EAR_THRESHOLD:
            blink_frame_count += 1
            # Reset if blink is too long (probably looking away, not blinking)
            if blink_frame_count > MAX_BLINK_DURATION_FRAMES:
                blink_started = False
                blink_frame_count = 0
            # Only count as new blink if:
            # 1. Sustained for CONSEC_FRAMES
            # 2. Enough time passed since last blink  
            # 3. Not too long (to filter out looking away)
            elif not blink_started and blink_frame_count >= CONSEC_FRAMES and frames_since_last_blink >= MIN_FRAMES_BETWEEN_BLINKS:
                blink_started = True
                blink_count += 1
                frames_since_last_blink = 0
        else:
            if blink_started:
                # Blink ended - record duration
                duration_ms = (blink_frame_count / fps) * 1000
                # Only record if it's a valid blink duration (100-300ms is typical)
                if 80 <= duration_ms <= 500:  # Stricter range
                    blink_durations.append(duration_ms)
                blink_started = False
            blink_frame_count = 0
    
    duration_seconds = len(frames) / fps
    blink_rate = (blink_count / duration_seconds) * 60 if duration_seconds > 0 else 0
    
    # Detect incomplete blinks (very short duration)
    incomplete_blinks = sum(1 for d in blink_durations if d < 100)
    
    # Normal blink: 100-400ms
    # Incomplete: < 100ms  
    # Prolonged: > 400ms
    normal_blinks = sum(1 for d in blink_durations if 100 <= d <= 400)
    prolonged_blinks = sum(1 for d in blink_durations if d > 400)
    
    return {
        'blink_count': blink_count,
        'blink_rate': round(blink_rate, 2),
        'incomplete_blinks': incomplete_blinks,
        'normal_blinks': normal_blinks,
        'prolonged_blinks': prolonged_blinks,
        'avg_blink_duration_ms': round(np.mean(blink_durations), 2) if blink_durations else 0,
        'avg_ear': round(np.mean(ear_values), 3) if ear_values else 0,
        'min_ear': round(np.min(ear_values), 3) if ear_values else 0,
        'max_ear': round(np.max(ear_values), 3) if ear_values else 0
    }


def detect_squinting(frames: List[np.ndarray]) -> Dict[str, Any]:
    """
    Detect squinting behavior using sustained low EAR values
    
    Args:
        frames: List of video frames
        
    Returns:
        Dictionary containing squint detection results
    """
    if not frames:
        return {'error': 'No frames provided'}
    
    squint_count = 0
    squinting = False
    squint_frames = 0
    total_squint_frames = 0
    
    # Squint threshold (lower than blink, but not a full blink)
    SQUINT_THRESHOLD = 0.25
    SQUINT_MIN_FRAMES = 10  # Must last at least 10 frames
    
    for frame in frames:
        eye_data = detect_eyes(frame)
        
        if not eye_data.get('detected'):
            continue
        
        ear = eye_data.get('avg_ear', 0.3)
        
        # Detect squinting (EAR between blink and normal)
        if EAR_THRESHOLD < ear < SQUINT_THRESHOLD:
            squint_frames += 1
            total_squint_frames += 1
            if squint_frames >= SQUINT_MIN_FRAMES and not squinting:
                squinting = True
                squint_count += 1
        else:
            squinting = False
            squint_frames = 0
    
    fps = 30  # Default FPS
    squint_duration_seconds = total_squint_frames / fps
    
    return {
        'squint_count': squint_count,
        'squint_duration_seconds': round(squint_duration_seconds, 2),
        'squint_percentage': round((total_squint_frames / len(frames)) * 100, 2) if frames else 0
    }


def measure_redness(eye_region: np.ndarray) -> float:
    """
    Measure sclera redness level
    
    Args:
        eye_region: Cropped eye region image
        
    Returns:
        Redness level (0-100)
    """
    # Placeholder implementation
    # In production, this would analyze RGB values in sclera region
    
    try:
        # Convert to RGB if needed
        if len(eye_region.shape) == 2:
            return 0.0
        
        # Calculate red channel dominance
        red_channel = eye_region[:, :, 2] if eye_region.shape[2] == 3 else eye_region[:, :, 0]
        green_channel = eye_region[:, :, 1]
        blue_channel = eye_region[:, :, 0] if eye_region.shape[2] == 3 else eye_region[:, :, 2]
        
        # Simple redness metric
        redness = (np.mean(red_channel) - np.mean(green_channel)) / 255.0 * 100
        return max(0, min(100, redness))
        
    except Exception:
        return 0.0


def analyze_tear_film(eye_region: np.ndarray) -> float:
    """
    Analyze tear film quality
    
    Args:
        eye_region: Cropped eye region image
        
    Returns:
        Tear film quality score (0-100)
    """
    # Placeholder implementation
    # In production, this would analyze reflection patterns
    
    return 80.0  # Default good tear film


def calculate_fatigue_score(
    blink_rate: float,
    incomplete_blinks: int,
    squint_count: int,
    avg_ear: float,
    duration_minutes: float
) -> Dict[str, Any]:
    """
    Calculate eye fatigue score based on multiple metrics
    
    Args:
        blink_rate: Blinks per minute
        incomplete_blinks: Number of incomplete blinks
        squint_count: Number of squint episodes
        avg_ear: Average eye aspect ratio
        duration_minutes: Session duration in minutes
        
    Returns:
        Dictionary with fatigue score and assessment
    """
    fatigue_score = 0
    factors = []
    
    # Normal blink rate: 15-20 per minute
    if blink_rate < 10:
        fatigue_score += 25
        factors.append("Low blink rate (dry eyes)")
    elif blink_rate > 30:
        fatigue_score += 15
        factors.append("High blink rate (irritation)")
    
    # Incomplete blinks indicate fatigue
    if incomplete_blinks > 5:
        fatigue_score += 20
        factors.append("Incomplete blinks detected")
    
    # Squinting indicates strain
    if squint_count > 3:
        fatigue_score += 25
        factors.append("Frequent squinting")
    
    # Low average EAR indicates strain
    if avg_ear < 0.25:
        fatigue_score += 15
        factors.append("Reduced eye opening")
    
    # Duration factor (prolonged use increases fatigue)
    if duration_minutes > 30:
        fatigue_score += 15
        factors.append("Extended screen time")
    
    # Determine fatigue level
    if fatigue_score >= 70:
        level = "High"
        recommendation = "Take a 15-minute break. Rest your eyes."
    elif fatigue_score >= 40:
        level = "Moderate"
        recommendation = "Consider taking a short break soon."
    else:
        level = "Low"
        recommendation = "Eyes are healthy. Keep up good habits!"
    
    return {
        'fatigue_score': min(100, fatigue_score),
        'level': level,
        'factors': factors,
        'recommendation': recommendation
    }


def process_webcam_session(
    video_path: Optional[str] = None,
    frames: Optional[List[np.ndarray]] = None,
    fps: int = 30
) -> Dict[str, Any]:
    """
    Process a complete webcam session and return comprehensive analysis
    
    Args:
        video_path: Path to video file (optional)
        frames: List of frames (optional, used if video_path not provided)
        fps: Frames per second
        
    Returns:
        Complete analysis dictionary
    """
    if video_path:
        # Load video and extract frames
        cap = cv2.VideoCapture(video_path)
        frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frames.append(frame)
        cap.release()
    
    if not frames:
        return {'error': 'No frames to analyze'}
    
    duration_seconds = len(frames) / fps
    duration_minutes = duration_seconds / 60
    
    # Analyze blinks
    blink_analysis = analyze_blink(frames, fps)
    
    # Analyze squinting
    squint_analysis = detect_squinting(frames)
    
    # Sample frames for redness analysis
    sample_indices = np.linspace(0, len(frames) - 1, min(10, len(frames)), dtype=int)
    redness_values = []
    
    for idx in sample_indices:
        frame = frames[int(idx)]
        eye_detection = detect_eyes(frame)
        
        if eye_detection.get('detected'):
            # Simplified redness detection (can be enhanced)
            redness_values.append(20.0)  # Placeholder for now
    
    # Calculate fatigue score
    fatigue = calculate_fatigue_score(
        blink_rate=blink_analysis.get('blink_rate', 15),
        incomplete_blinks=blink_analysis.get('incomplete_blinks', 0),
        squint_count=squint_analysis.get('squint_count', 0),
        avg_ear=blink_analysis.get('avg_ear', 0.3),
        duration_minutes=duration_minutes
    )
    
    return {
        # Blink metrics
        'blink_rate': blink_analysis.get('blink_rate', 0),
        'blink_count': blink_analysis.get('blink_count', 0),
        'incomplete_blinks': blink_analysis.get('incomplete_blinks', 0),
        'normal_blinks': blink_analysis.get('normal_blinks', 0),
        'prolonged_blinks': blink_analysis.get('prolonged_blinks', 0),
        'avg_blink_duration_ms': blink_analysis.get('avg_blink_duration_ms', 0),
        
        # EAR metrics
        'avg_ear': blink_analysis.get('avg_ear', 0),
        'min_ear': blink_analysis.get('min_ear', 0),
        'max_ear': blink_analysis.get('max_ear', 0),
        
        # Squint metrics
        'squint_count': squint_analysis.get('squint_count', 0),
        'squint_duration_seconds': squint_analysis.get('squint_duration_seconds', 0),
        'squint_percentage': squint_analysis.get('squint_percentage', 0),
        
        # Other metrics
        'sclera_redness_level': np.mean(redness_values) if redness_values else 20.0,
        'tear_film_quality': 80.0,  # Placeholder
        
        # Fatigue
        'fatigue_score': fatigue['fatigue_score'],
        'fatigue_level': fatigue['level'],
        'fatigue_factors': fatigue['factors'],
        'recommendation': fatigue['recommendation'],
        
        # Session info
        'session_duration_minutes': round(duration_minutes, 2),
        'analysis_frames': len(frames),
        'fps': fps
    }


# Training functions for future implementation
def train_fatigue_model(training_data_path: str):
    """Train fatigue detection model (placeholder)"""
    raise NotImplementedError("Model training not yet implemented")


def train_blink_detector(training_data_path: str):
    """Train blink detection model (placeholder)"""
    raise NotImplementedError("Model training not yet implemented")
