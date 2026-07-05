import { useState, useEffect, useRef } from 'react'

export function useVoiceRecognition({ onResult, onError, expectedWords = [] }) {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(true)
  const recognitionRef = useRef(null)

  useEffect(() => {
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      setIsSupported(false)
      console.warn('Speech recognition not supported in this browser')
      return
    }

    // Initialize speech recognition
    const recognition = new SpeechRecognition()
    recognition.continuous = false // Stop after getting result
    recognition.interimResults = false // Only final results
    recognition.lang = 'en-US'
    recognition.maxAlternatives = 3

    recognition.onstart = () => {
      console.log('Voice recognition started')
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      const results = event.results[0]
      const transcript = results[0].transcript.trim().toUpperCase()
      console.log('Heard:', transcript, 'Confidence:', results[0].confidence)
      
      setTranscript(transcript)
      
      // Check if any of the expected words match
      if (expectedWords.length > 0) {
        const spokenLetters = transcript.replace(/\s+/g, '').split('')
        const matches = spokenLetters.filter(letter => 
          expectedWords.some(expected => expected.toUpperCase() === letter)
        )
        
        if (matches.length > 0) {
          onResult?.(transcript, matches, results[0].confidence)
        } else {
          // Try alternative transcripts
          let foundMatch = false
          for (let i = 1; i < results.length; i++) {
            const altTranscript = results[i].transcript.trim().toUpperCase()
            const altLetters = altTranscript.replace(/\s+/g, '').split('')
            const altMatches = altLetters.filter(letter => 
              expectedWords.some(expected => expected.toUpperCase() === letter)
            )
            if (altMatches.length > 0) {
              onResult?.(altTranscript, altMatches, results[i].confidence)
              foundMatch = true
              break
            }
          }
          if (!foundMatch) {
            onResult?.(transcript, [], results[0].confidence)
          }
        }
      } else {
        onResult?.(transcript, [], results[0].confidence)
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      setIsListening(false)
      
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error)
      }
    }

    recognition.onend = () => {
      console.log('Voice recognition ended')
      setIsListening(false)
    }

    recognitionRef.current = recognition

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [onResult, onError, expectedWords])

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      try {
        setTranscript('')
        recognitionRef.current.start()
      } catch (error) {
        console.error('Failed to start recognition:', error)
      }
    }
  }

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }

  return {
    isListening,
    transcript,
    isSupported,
    startListening,
    stopListening
  }
}
