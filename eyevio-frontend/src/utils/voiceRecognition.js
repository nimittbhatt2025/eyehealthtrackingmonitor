/**
 * Voice Recognition Utility
 * Enables hands-free test interaction for distance viewing
 */

const ACUITY_LETTER_PHONETICS = {
  E: ['E', 'EE', 'SEE', 'SEA', 'SI', 'CEE', 'HE', 'EACH'],
  F: ['F', 'EF', 'EFF', 'EFS', 'IF'],
  L: ['L', 'EL', 'ELL', 'ELLE', 'AL'],
  O: ['O', 'OH', 'OWE', 'OHH', 'ZERO', 'OSCAR'],
  P: ['P', 'PEE', 'PEA', 'PI', 'PE'],
  T: ['T', 'TEE', 'TEA', 'TI', 'TE'],
  Z: ['Z', 'ZEE', 'ZED', 'ZED', 'ZED'],
}

function normalizeSpokenText(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchLetterFromToken(token, allowedSet) {
  if (!token) return null
  if (token.length === 1 && allowedSet.has(token)) return token

  for (const [letter, forms] of Object.entries(ACUITY_LETTER_PHONETICS)) {
    if (!allowedSet.has(letter)) continue
    if (forms.includes(token)) return letter
  }
  return null
}

class VoiceRecognition {
  constructor() {
    this.recognition = null
    this.isListening = false
    this.onResultCallback = null
    this.onErrorCallback = null
    this.onStartCallback = null
    this.fatalError = false
    this.lastLoggedError = null
    this.micPrimed = false

    this._initRecognition()
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    this.recognition = new SpeechRecognition()
    this.recognition.continuous = true
    this.recognition.interimResults = false
    this.recognition.lang = 'en-US'
    this.recognition.maxAlternatives = 5

    this.recognition.onstart = () => {
      this.isListening = true
      this.onStartCallback?.()
    }

    this.recognition.onresult = (event) => {
      const transcripts = []
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result.isFinal) continue
        for (let alt = 0; alt < result.length; alt++) {
          const text = result[alt].transcript?.trim()
          if (text) transcripts.push(text)
        }
      }
      if (!transcripts.length || !this.onResultCallback) return
      this.onResultCallback(transcripts)
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
        if (this.lastLoggedError !== event.error) {
          this.lastLoggedError = event.error
          if (event.error !== 'network') {
            console.error('Speech recognition error:', event.error)
          }
        }
        this.onErrorCallback?.(event.error)
      }
    }

    this.recognition.onend = () => {
      const shouldRestart = this.isListening && !this.fatalError
      this.isListening = false
      if (shouldRestart) {
        window.setTimeout(() => {
          if (!this.isListening && !this.fatalError && this.onResultCallback) {
            try {
              this.recognition.start()
              this.isListening = true
            } catch {
              // already starting
            }
          }
        }, 120)
      }
    }
  }

  createRecognitionInstance() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 5
    return recognition
  }

  async primeMicrophone(force = false) {
    if (!navigator.mediaDevices?.getUserMedia) return true
    if (this.micPrimed && !force) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      this.micPrimed = true
      return true
    } catch (err) {
      console.warn('Microphone permission failed:', err)
      // Speech recognition may still work — do not hard-block the test.
      return false
    }
  }

  isSupported() {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start(onResult, onError, onStart) {
    if (!this.recognition) {
      console.error('Speech recognition not supported')
      return false
    }

    this.fatalError = false
    this.lastLoggedError = null
    this.onResultCallback = onResult
    this.onErrorCallback = onError
    this.onStartCallback = onStart

    try {
      try {
        this.recognition.stop()
      } catch {
        // ignore
      }
      this.isListening = false
      this.recognition.start()
      return true
    } catch (error) {
      console.error('Failed to start recognition:', error)
      this.isListening = false
      return false
    }
  }

  stop() {
    this.onResultCallback = null
    this.onErrorCallback = null
    this.onStartCallback = null
    if (!this.recognition) return
    this.isListening = false
    try {
      this.recognition.stop()
    } catch {
      // ignore
    }
  }

  parseOptotypeLetter(transcript, allowedLetters = ['E', 'F', 'L', 'O', 'P', 'T', 'Z']) {
    const allowedSet = new Set(allowedLetters.map((l) => l.toUpperCase()))
    const transcripts = Array.isArray(transcript) ? transcript : [transcript]

    for (const raw of transcripts) {
      const normalized = normalizeSpokenText(raw)
      if (!normalized) continue

      const direct = matchLetterFromToken(normalized.replace(/\s/g, ''), allowedSet)
      if (direct) return direct

      for (const token of normalized.split(' ')) {
        const letter = matchLetterFromToken(token, allowedSet)
        if (letter) return letter
      }

      const compact = normalized.replace(/\s/g, '')
      if (compact.length === 1) {
        const letter = matchLetterFromToken(compact, allowedSet)
        if (letter) return letter
      }
    }

    return null
  }

  // Parse spoken input to match expected answers
  parseResponse(transcript) {
    const texts = Array.isArray(transcript) ? transcript : [transcript]

    for (const text of texts) {
      const letter = this.parseOptotypeLetter(text)
      if (letter) return letter
    }

    const original = String(texts[0] || '').toLowerCase().trim()
    console.log('Parsing voice input:', original)

    // Check for "nothing" variations
    if (
      original.includes('nothing') ||
      original.includes('none') ||
      original.includes("can't see") ||
      original.includes('cant see') ||
      original.includes('blank') ||
      original === 'no'
    ) {
      return 'nothing'
    }

    // Check if it's already a number
    const numericMatch = original.match(/\d+/)
    if (numericMatch) {
      return numericMatch[0]
    }

    const numberWords = {
      zero: '0', oh: '0',
      one: '1', won: '1',
      two: '2', to: '2', too: '2',
      three: '3', tree: '3',
      four: '4', for: '4', fore: '4',
      five: '5', fife: '5',
      six: '6', sex: '6',
      seven: '7',
      eight: '8', ate: '8',
      nine: '9',
      ten: '10',
      eleven: '11',
      twelve: '12',
      thirteen: '13',
      fourteen: '14',
      fifteen: '15',
      sixteen: '16',
      seventeen: '17',
      eighteen: '18',
      nineteen: '19',
      twenty: '20',
      thirty: '30',
      forty: '40',
      fifty: '50',
      sixty: '60',
      seventy: '70',
      eighty: '80',
      ninety: '90',
    }

    const words = original.split(/[\s-]+/)

    if (words.length === 1 && numberWords[words[0]]) {
      return numberWords[words[0]]
    }

    if (words.length === 2) {
      const tens = numberWords[words[0]]
      const ones = numberWords[words[1]]
      if (tens && ones && parseInt(tens, 10) >= 20) {
        return (parseInt(tens, 10) + parseInt(ones, 10)).toString()
      }
    }

    for (const word of words) {
      if (numberWords[word]) {
        return numberWords[word]
      }
    }

    console.warn('Could not parse voice input:', original)
    return null
  }

  /** Spoken commands to confirm / continue (distance calibration, etc.) */
  parseConfirmCommand(transcript) {
    const t = String(transcript || '').toLowerCase().trim()
    const phrases = [
      'ready', 'continue', 'begin', 'start', 'proceed', 'confirm',
      'go ahead', 'done', 'next', 'okay', 'ok',
    ]
    const texts = Array.isArray(transcript) ? transcript : [transcript]
    return texts.some((raw) => {
      const line = String(raw || '').toLowerCase().trim()
      return phrases.some((phrase) => line.includes(phrase))
    })
  }
}

export default new VoiceRecognition()
