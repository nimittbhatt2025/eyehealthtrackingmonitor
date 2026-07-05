// 🔧 Eye Tracking Analysis - Browser Console Debug Commands
// Copy and paste these into your browser console (F12) for debugging

// ============================================
// 1. CHECK IF MEDIAPIPE IS LOADED
// ============================================
console.log('=== MediaPipe Status ===');
console.log('FaceMesh loaded:', typeof FaceMesh !== 'undefined' ? '✅ YES' : '❌ NO');
console.log('Camera loaded:', typeof Camera !== 'undefined' ? '✅ YES' : '❌ NO');

// ============================================
// 2. TEST CAMERA ACCESS
// ============================================
console.log('\n=== Testing Camera Access ===');
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
  .then(stream => {
    console.log('✅ Camera access OK');
    console.log('Stream:', stream);
    console.log('Video tracks:', stream.getVideoTracks());
    // Stop the test stream
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(error => {
    console.error('❌ Camera access FAILED');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.name === 'NotAllowedError') {
      console.log('💡 Solution: Allow camera permissions in browser settings');
    } else if (error.name === 'NotFoundError') {
      console.log('💡 Solution: Connect a camera to your device');
    } else if (error.name === 'NotReadableError') {
      console.log('💡 Solution: Close other apps using the camera');
    }
  });

// ============================================
// 3. CHECK CURRENT TRACKING STATE (run on tracking page)
// ============================================
console.log('\n=== Current Tracking State ===');
// Note: These variables are only available on the EyeTrackingAnalysis page
try {
  console.log('Is tracking:', typeof isTracking !== 'undefined' ? isTracking : 'N/A (not on tracking page)');
  console.log('Face detected:', typeof faceDetected !== 'undefined' ? faceDetected : 'N/A');
  console.log('Current metrics:', typeof metrics !== 'undefined' ? metrics : 'N/A');
  console.log('Session progress:', typeof sessionProgress !== 'undefined' ? sessionProgress + '%' : 'N/A');
  console.log('Time remaining:', typeof timeRemaining !== 'undefined' ? timeRemaining + 's' : 'N/A');
} catch (e) {
  console.log('ℹ️ Tracking state variables not available (normal if not on tracking page)');
}

// ============================================
// 4. CHECK TRACKER INSTANCE (run on tracking page)
// ============================================
console.log('\n=== Tracker Instance ===');
try {
  if (typeof trackerRef !== 'undefined' && trackerRef.current) {
    console.log('✅ Tracker exists');
    console.log('Tracker running:', trackerRef.current.isRunning);
    console.log('Session data:', trackerRef.current.sessionData);
    console.log('Blink state:', trackerRef.current.blinkState);
  } else {
    console.log('ℹ️ Tracker not initialized (normal before starting session)');
  }
} catch (e) {
  console.log('ℹ️ TrackerRef not available (normal if not on tracking page)');
}

// ============================================
// 5. MANUAL BLINK TEST (run during active session)
// ============================================
console.log('\n=== Manual Blink Test ===');
console.log('Instructions:');
console.log('1. Start the eye tracking session');
console.log('2. Wait for face detection (green indicator)');
console.log('3. Blink 5 times slowly (1-2 seconds between blinks)');
console.log('4. Check if "Total Blinks" counter increases');
console.log('5. Expected: Counter should increase by ~5 (±1)');

// ============================================
// 6. CHECK BACKEND API
// ============================================
console.log('\n=== Backend API Test ===');
fetch('http://localhost:5002/api/auth/profile', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Backend API responding');
    console.log('User:', data);
  })
  .catch(err => {
    console.error('❌ Backend API failed');
    console.error(err);
    console.log('💡 Make sure backend is running on port 5002');
  });

// ============================================
// 7. CHECK STORED TEST RESULTS
// ============================================
console.log('\n=== Recent Test Results ===');
fetch('http://localhost:5002/api/vision-tests?test_type=eye_tracking&limit=5', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Test results loaded');
    console.log('Recent tests:', data.tests);
    if (data.tests && data.tests.length > 0) {
      console.log('Latest test:', data.tests[0]);
    } else {
      console.log('ℹ️ No eye tracking tests found yet');
    }
  })
  .catch(err => {
    console.error('❌ Failed to load test results');
    console.error(err);
  });

// ============================================
// 8. SIMULATE DIFFERENT FATIGUE LEVELS (for testing)
// ============================================
console.log('\n=== Fatigue Simulation Guide ===');
console.log('To test different fatigue scores:');
console.log('');
console.log('✅ NORMAL (Score 0-30):');
console.log('   - Blink naturally (12-20 times/min)');
console.log('   - Normal blink speed (200-300ms)');
console.log('   - Move eyes normally');
console.log('');
console.log('⚠️ MILD STRAIN (Score 31-60):');
console.log('   - Reduce blinking (<10 times/min)');
console.log('   - Stare more, blink less');
console.log('   - Expected: "Mild Strain" status');
console.log('');
console.log('🔴 HIGH FATIGUE (Score 61-100):');
console.log('   - Blink frequently (>25 times/min)');
console.log('   - Slow, prolonged blinks (>300ms)');
console.log('   - Reduce eye movements');
console.log('   - Expected: "High Fatigue" status');

// ============================================
// 9. ENABLE VERBOSE LOGGING (run before starting session)
// ============================================
console.log('\n=== Enable Verbose Logging ===');
console.log('To see detailed tracking logs, the code already includes console.log statements');
console.log('Look for these prefixes in console:');
console.log('  🎯 - Initialization');
console.log('  ✅ - Success');
console.log('  ❌ - Errors');
console.log('  👁️ - Blink detection');
console.log('  📊 - Session complete');

// ============================================
// 10. PERFORMANCE CHECK
// ============================================
console.log('\n=== Performance Metrics ===');
if (performance.memory) {
  console.log('Memory usage:', {
    used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
    total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
    limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
  });
} else {
  console.log('ℹ️ Memory metrics not available (enable in Chrome: --enable-precise-memory-info)');
}

// ============================================
// SUMMARY
// ============================================
console.log('\n=== Debug Summary ===');
console.log('✓ Copy and paste this entire script into your browser console');
console.log('✓ It will check everything automatically');
console.log('✓ Look for ✅ (good) and ❌ (needs fixing) symbols');
console.log('✓ Run this before and during your eye tracking session');
console.log('\n🎯 Ready to debug! Check the output above for any issues.');
