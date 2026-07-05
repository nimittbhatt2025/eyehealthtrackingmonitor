"""
Personalized Blink Detection Calibration

This module allows users to calibrate blink detection specifically for their eyes.
Different people have different eye shapes, so we need personalized thresholds.
"""

import numpy as np
from typing import Dict, Any, List, Tuple
from collections import deque
import cv2


class BlinkCalibrator:
    """
    Calibration system for personalized blink detection
    
    The user performs calibration by:
    1. Looking normally for 5 seconds (establishes baseline EAR)
    2. Performing 10 deliberate blinks (records blink EAR values)
    3. System calculates personalized threshold
    """
    
    def __init__(self):
        self.baseline_ears = []  # EAR values when eyes are open
        self.blink_ears = []     # EAR values during blinks
        self.personalized_threshold = None
        self.calibrated = False
        
    def add_baseline_sample(self, ear: float):
        """Add EAR value when eyes are open (normal state)"""
        self.baseline_ears.append(ear)
        
    def add_blink_sample(self, ear: float):
        """Add EAR value during a blink"""
        self.blink_ears.append(ear)
        
    def calculate_threshold(self) -> Dict[str, Any]:
        """
        Calculate personalized blink threshold based on collected data
        
        Returns:
            Dictionary with threshold and calibration statistics
        """
        if len(self.baseline_ears) < 30 or len(self.blink_ears) < 10:
            return {
                'success': False,
                'error': 'Not enough calibration data',
                'baseline_samples': len(self.baseline_ears),
                'blink_samples': len(self.blink_ears)
            }
        
        # Calculate statistics
        baseline_mean = np.mean(self.baseline_ears)
        baseline_std = np.std(self.baseline_ears)
        blink_mean = np.mean(self.blink_ears)
        blink_std = np.std(self.blink_ears)
        
        # Threshold = midpoint between blink mean and (baseline mean - 2 std)
        # This ensures we're clearly below normal but above noise
        threshold = (blink_mean + (baseline_mean - 2 * baseline_std)) / 2
        
        # Safety bounds (never go below 0.1 or above 0.25)
        threshold = max(0.1, min(0.25, threshold))
        
        self.personalized_threshold = threshold
        self.calibrated = True
        
        return {
            'success': True,
            'threshold': round(threshold, 3),
            'baseline_mean': round(baseline_mean, 3),
            'baseline_std': round(baseline_std, 3),
            'blink_mean': round(blink_mean, 3),
            'blink_std': round(blink_std, 3),
            'confidence': self._calculate_confidence(baseline_mean, blink_mean, baseline_std)
        }
    
    def _calculate_confidence(self, baseline_mean: float, blink_mean: float, baseline_std: float) -> str:
        """Calculate calibration confidence level"""
        separation = baseline_mean - blink_mean
        
        if separation > 0.15 and baseline_std < 0.03:
            return 'excellent'
        elif separation > 0.10 and baseline_std < 0.05:
            return 'good'
        elif separation > 0.08:
            return 'fair'
        else:
            return 'poor'
    
    def save_calibration(self, user_id: int) -> Dict[str, Any]:
        """Save calibration data to database"""
        from app.models import db, User
        from datetime import datetime
        
        if not self.calibrated:
            return {'success': False, 'error': 'Not calibrated yet'}
        
        try:
            user = User.query.get(user_id)
            if not user:
                return {'success': False, 'error': 'User not found'}
            
            # Save threshold to user profile
            user.blink_threshold = float(self.personalized_threshold)
            user.blink_threshold_updated_at = datetime.utcnow()
            db.session.commit()
            
            print(f"[SAVE] Saved threshold {user.blink_threshold:.3f} for user {user_id}")
            
            return {
                'success': True,
                'threshold': float(self.personalized_threshold),
                'baseline_mean': float(np.mean(self.baseline_ears)),
                'calibrated_at': user.blink_threshold_updated_at.isoformat()
            }
        except Exception as e:
            db.session.rollback()
            print(f"[SAVE ERROR] Failed to save calibration: {e}")
            return {'success': False, 'error': str(e)}


class AdaptiveBlinkDetector:
    """
    Smart blink detector that uses calibrated threshold and adapts over time
    """
    
    def __init__(self, personalized_threshold: float = 0.15):
        self.threshold = personalized_threshold
        self.blink_count = 0
        self.frames_since_last_blink = 0
        self.current_blink_frames = 0
        self.is_blinking = False
        
        # Adaptive parameters
        self.recent_ears = deque(maxlen=300)  # Last 10 seconds at 30fps
        self.recent_blinks = deque(maxlen=50)  # Last 50 blinks
        
        # Strict validation parameters
        self.MIN_FRAMES_BETWEEN_BLINKS = 8   # At least 8 frames between blinks
        self.MIN_BLINK_FRAMES = 3             # Must last at least 3 frames
        self.MAX_BLINK_FRAMES = 12            # Must not exceed 12 frames
        
    def detect_blink(self, ear: float) -> Tuple[bool, Dict[str, Any]]:
        """
        Detect if a blink occurred in this frame
        
        Args:
            ear: Eye Aspect Ratio value
            
        Returns:
            Tuple of (blink_detected, metadata)
        """
        self.recent_ears.append(ear)
        self.frames_since_last_blink += 1
        blink_detected = False
        metadata = {}
        
        # Check if eyes are closed (EAR below threshold)
        if ear < self.threshold:
            self.current_blink_frames += 1
            
            # If blink is too long, it's probably not a blink (looking away, squinting)
            if self.current_blink_frames > self.MAX_BLINK_FRAMES:
                self.is_blinking = False
                self.current_blink_frames = 0
                metadata['rejected'] = 'too_long'
            
        else:  # Eyes open
            # Check if we just finished a blink
            if self.is_blinking:
                # Validate the blink
                if (self.current_blink_frames >= self.MIN_BLINK_FRAMES and 
                    self.current_blink_frames <= self.MAX_BLINK_FRAMES and
                    self.frames_since_last_blink >= self.MIN_FRAMES_BETWEEN_BLINKS):
                    
                    # Valid blink!
                    self.blink_count += 1
                    self.recent_blinks.append({
                        'duration_frames': self.current_blink_frames,
                        'time_since_last': self.frames_since_last_blink
                    })
                    blink_detected = True
                    self.frames_since_last_blink = 0
                    
                    metadata['blink_duration_frames'] = self.current_blink_frames
                else:
                    # Invalid blink - too soon after last one or wrong duration
                    if self.frames_since_last_blink < self.MIN_FRAMES_BETWEEN_BLINKS:
                        metadata['rejected'] = 'too_soon_after_last'
                    else:
                        metadata['rejected'] = 'invalid_duration'
                
                self.is_blinking = False
                self.current_blink_frames = 0
            
            # Check if this is the start of a new blink
            elif self.current_blink_frames >= self.MIN_BLINK_FRAMES:
                self.is_blinking = True
        
        metadata['current_blink_frames'] = self.current_blink_frames
        metadata['frames_since_last'] = self.frames_since_last_blink
        metadata['total_blinks'] = self.blink_count
        
        return blink_detected, metadata
    
    def get_blink_rate(self, duration_seconds: float) -> float:
        """Calculate blinks per minute"""
        if duration_seconds <= 0:
            return 0.0
        return (self.blink_count / duration_seconds) * 60
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get current detection statistics"""
        if not self.recent_blinks:
            return {
                'total_blinks': self.blink_count,
                'avg_blink_duration_frames': 0,
                'avg_time_between_blinks_frames': 0
            }
        
        durations = [b['duration_frames'] for b in self.recent_blinks]
        times_between = [b['time_since_last'] for b in self.recent_blinks]
        
        return {
            'total_blinks': self.blink_count,
            'recent_blinks': len(self.recent_blinks),
            'avg_blink_duration_frames': round(np.mean(durations), 1),
            'avg_time_between_blinks_frames': round(np.mean(times_between), 1),
            'threshold_used': self.threshold
        }
