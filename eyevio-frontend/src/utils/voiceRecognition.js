/**
 * Voice Recognition Utility
 * Enables hands-free test interaction for distance viewing
 */

class VoiceRecognition {
  constructor() {
    this.recognition = null
    this.isListening = false
    this.onResultCallback = null
    this.onErrorCallback = null
    this.fatalError = false
    this.lastLoggedError = null
    
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition()
      this.recognition.continuous = true  // Keep listening
      this.recognition.interimResults = true  // Get interim results
      this.recognition.lang = 'en-US'
      this.recognition.maxAlternatives = 3  // Get multiple alternatives
      
      this.recognition.onresult = (event) => {
        // Get the most recent result
        const lastResultIndex = event.results.length - 1
        const result = event.results[lastResultIndex]
        
        if (result.isFinal) {
          // Try all alternatives for best match
          for (let i = 0; i < result.length; i++) {
            const transcript = result[i].transcript.trim()
            
            if (this.onResultCallback) {
              this.onResultCallback(transcript)
              break  // Use first result
            }
          }
        }
      }
      
      this.recognition.onerror = (event) => {
        const fatalErrors = ['network', 'not-allowed', 'service-not-allowed', 'audio-capture', 'aborted']
        const isFatal = fatalErrors.includes(event.error)

        if (isFatal) {
          this.fatalError = true
          this.isListening = false
          try {
            this.recognition.stop()
          } catch {
            // ignore
          }
        }

        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          // Avoid console spam from repeated network errors
          if (this.lastLoggedError !== event.error) {
            this.lastLoggedError = event.error
            if (event.error !== 'network') {
              console.error('Speech recognition error:', event.error)
            }
          }
          if (this.onErrorCallback) {
            this.onErrorCallback(event.error)
          }
        }
      }
      
      this.recognition.onend = () => {
        // Auto-restart only if still active and no fatal error
        if (this.isListening && !this.fatalError) {
          try {
            this.recognition.start()
          } catch {
            // Recognition may already be starting
          }
        }
      }
    }
  }
  
  isSupported() {
    return this.recognition !== null
  }
  
  start(onResult, onError) {
    if (!this.recognition) {
      console.error('Speech recognition not supported')
      return false
    }
    
    this.fatalError = false
    this.lastLoggedError = null
    this.onResultCallback = onResult
    this.onErrorCallback = onError
    
    try {
      this.recognition.start()
      this.isListening = true
      return true
    } catch (error) {
      console.error('Failed to start recognition:', error)
      return false
    }
  }
  
  stop() {
    if (this.recognition && this.isListening) {
      this.isListening = false
      try {
        this.recognition.stop()
      } catch {
        // ignore
      }
    }
  }
  
  // Parse spoken input to match expected answers
  parseResponse(transcript) {
    const original = transcript.toLowerCase().trim()
    console.log('Parsing voice input:', original)
    
    // Handle multi-digit numbers (e.g., "forty-five", "seventy-three")
    const numberWords = {
      'zero': '0', 'oh': '0',
      'one': '1', 'won': '1',
      'two': '2', 'to': '2', 'too': '2',
      'three': '3', 'tree': '3',
      'four': '4', 'for': '4', 'fore': '4',
      'five': '5', 'fife': '5',
      'six': '6', 'sex': '6',
      'seven': '7',
      'eight': '8', 'ate': '8',
      'nine': '9',
      'ten': '10',
      'eleven': '11',
      'twelve': '12',
      'thirteen': '13',
      'fourteen': '14',
      'fifteen': '15',
      'sixteen': '16',
      'seventeen': '17',
      'eighteen': '18',
      'nineteen': '19',
      'twenty': '20',
      'thirty': '30',
      'forty': '40',
      'fifty': '50',
      'sixty': '60',
      'seventy': '70',
      'eighty': '80',
      'ninety': '90'
    }
    
    // Check for "nothing" variations
    if (original.includes('nothing') || original.includes('none') || 
        original.includes("can't see") || original.includes('cant see') ||
        original.includes('blank') || original === 'no') {
      return 'nothing'
    }
    
    // Check if it's already a number
    const numericMatch = original.match(/\d+/)
    if (numericMatch) {
      return numericMatch[0]
    }
    
    // Handle compound numbers like "forty-five" or "forty five"
    const words = original.split(/[\s-]+/)
    
    // Single word number
    if (words.length === 1 && numberWords[words[0]]) {
      return numberWords[words[0]]
    }
    
    // Two word number (e.g., "forty five")
    if (words.length === 2) {
      const tens = numberWords[words[0]]
      const ones = numberWords[words[1]]
      if (tens && ones && parseInt(tens) >= 20) {
        return (parseInt(tens) + parseInt(ones)).toString()
      }
    }
    
    // Try each word individually
    for (const word of words) {
      if (numberWords[word]) {
        return numberWords[word]
      }
    }
    
    // Handle letters (for vision acuity test)
    const cleaned = original.toUpperCase().replace(/[^A-Z]/g, '')
    if (cleaned.length === 1) {
      return cleaned
    }
    
    console.warn('Could not parse voice input:', original)
    return null
  }

  /** Spoken commands to confirm / continue (distance calibration, etc.) */
  parseConfirmCommand(transcript) {
    const t = transcript.toLowerCase().trim()
    const phrases = [
      'ready', 'continue', 'begin', 'start', 'proceed', 'confirm',
      'go ahead', 'done', 'next', 'okay', 'ok',
    ]
    return phrases.some((phrase) => t.includes(phrase))
  }
}

export default new VoiceRecognition()
