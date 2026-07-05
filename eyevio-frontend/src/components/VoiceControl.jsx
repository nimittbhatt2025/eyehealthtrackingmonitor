import { useState, useEffect } from 'react'
import voiceRecognition from '../utils/voiceRecognition'

/**
 * VoiceControl Component
 * Enables voice-based answers for hands-free testing
 */
const VoiceControl = ({ options, onAnswer, enabled }) => {
  const [isListening, setIsListening] = useState(false)
  const [lastTranscript, setLastTranscript] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (enabled && !isListening) {
      startListening()
    }
    
    return () => {
      if (isListening) {
        voiceRecognition.stop()
      }
    }
  }, [enabled])

  const startListening = () => {
    const success = voiceRecognition.start(
      (transcript) => {
        setLastTranscript(transcript)
        const parsed = voiceRecognition.parseResponse(transcript, options)
        
        if (parsed) {
          setError(null)
          onAnswer(parsed)
          setIsListening(false)
        } else {
          setError(`Didn't understand "${transcript}". Please try again.`)
          // Restart listening after a brief delay
          setTimeout(() => {
            setError(null)
            startListening()
          }, 2000)
        }
      },
      (err) => {
        setError(`Voice recognition error: ${err}`)
        setIsListening(false)
      }
    )
    
    setIsListening(success)
  }

  if (!enabled) return null

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-600 p-6 max-w-sm">
        {/* Listening Indicator */}
        <div className="flex items-center gap-3 mb-4">
          {isListening ? (
            <>
              <div className="relative">
                <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-4 h-4 bg-red-600 rounded-full animate-ping"></div>
              </div>
              <span className="font-semibold text-gray-900">Listening...</span>
            </>
          ) : (
            <>
              <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
              <span className="font-semibold text-gray-600">Voice Inactive</span>
            </>
          )}
        </div>

        {/* Instructions */}
        <div className="mb-4">
          <p className="text-sm text-gray-700 font-medium mb-2">Say one of:</p>
          <div className="flex flex-wrap gap-2">
            {options.map((option) => (
              <span
                key={option}
                className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200"
              >
                "{option}"
              </span>
            ))}
          </div>
        </div>

        {/* Last Transcript */}
        {lastTranscript && !error && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <p className="text-xs text-green-700 mb-1">Heard:</p>
            <p className="text-sm font-semibold text-green-900">"{lastTranscript}"</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
            <p className="text-sm text-red-900">{error}</p>
          </div>
        )}

        {/* Retry Button */}
        {!isListening && (
          <button
            onClick={startListening}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
          >
            Start Listening
          </button>
        )}

        {/* Tips */}
        <p className="text-xs text-gray-500 mt-3 text-center">
          Speak clearly. Microphone icon indicates active listening.
        </p>
      </div>
    </div>
  )
}

export default VoiceControl
