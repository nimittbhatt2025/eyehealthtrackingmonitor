import { createContext, useContext, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'

const KeyboardShortcutsContext = createContext()

export function KeyboardShortcutsProvider({ children }) {
  const navigate = useNavigate()

  const shortcuts = {
    // Navigation
    'g d': () => navigate('/dashboard'),
    'g t': () => navigate('/vision-tests'),
    'g r': () => navigate('/trends'),
    'g e': () => navigate('/eye-tracking-analysis'),
    'g l': () => navigate('/lifestyle'),
    'g a': () => navigate('/achievements'),
    'g c': () => navigate('/community'),
    'g s': () => navigate('/settings'),
    'g h': () => navigate('/help'),
    'g p': () => navigate('/profile'),
    
    // Actions
    '?': () => showShortcutsHelp(),
    '/': () => focusSearch(),
    'n': () => navigate('/vision-tests'), // New test
  }

  const showShortcutsHelp = () => {
    toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-2xl pointer-events-auto flex flex-col p-6 border border-gray-200 dark:border-gray-700`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif font-bold text-lg text-gray-900 dark:text-white">Keyboard Shortcuts</h3>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">g d</kbd>
              <span className="text-gray-600 dark:text-gray-300">Dashboard</span>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">g t</kbd>
              <span className="text-gray-600 dark:text-gray-300">Tests</span>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">g r</kbd>
              <span className="text-gray-600 dark:text-gray-300">Trends</span>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">g l</kbd>
              <span className="text-gray-600 dark:text-gray-300">Lifestyle</span>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">n</kbd>
              <span className="text-gray-600 dark:text-gray-300">New Test</span>
            </div>
            <div className="flex items-center space-x-2">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs">?</kbd>
              <span className="text-gray-600 dark:text-gray-300">This Help</span>
            </div>
          </div>
        </div>
      </div>
    ), { duration: 6000 })
  }

  const focusSearch = () => {
    const searchInput = document.querySelector('input[type="search"]')
    if (searchInput) {
      searchInput.focus()
    }
  }

  useEffect(() => {
    let keySequence = ''
    let sequenceTimer = null

    const handleKeyDown = (e) => {
      // Ignore if typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return
      }

      // Handle single key shortcuts
      if (shortcuts[e.key]) {
        e.preventDefault()
        shortcuts[e.key]()
        return
      }

      // Build key sequence for multi-key shortcuts (like "g d")
      keySequence += e.key
      clearTimeout(sequenceTimer)

      // Check if current sequence matches any shortcut
      if (shortcuts[keySequence]) {
        e.preventDefault()
        shortcuts[keySequence]()
        keySequence = ''
      } else {
        // Reset sequence after 1 second
        sequenceTimer = setTimeout(() => {
          keySequence = ''
        }, 1000)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(sequenceTimer)
    }
  }, []) // Remove navigate dependency to fix the shortcuts

  return (
    <KeyboardShortcutsContext.Provider value={{ showShortcutsHelp }}>
      {children}
    </KeyboardShortcutsContext.Provider>
  )
}

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext)
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within KeyboardShortcutsProvider')
  }
  return context
}
