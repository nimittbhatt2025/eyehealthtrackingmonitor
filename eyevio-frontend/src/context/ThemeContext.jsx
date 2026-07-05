import { createContext, useContext, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  // Always use light theme
  const theme = 'light'
  const setTheme = () => {} // No-op function
  const toggleTheme = () => {} // No-op function
  const setSystemTheme = () => {} // No-op function

  // Ensure dark mode is removed on mount and stays removed
  useEffect(() => {
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('eyevio-theme')
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, setSystemTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
