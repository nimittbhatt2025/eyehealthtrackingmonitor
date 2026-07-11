/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable dark mode with class strategy
  theme: {
    extend: {
      colors: {
        // Earthy wellness palette from your designs
        primary: {
          50: '#f8f7f4',
          100: '#eeece6',
          200: '#e0ddd3',
          300: '#cec9ba',
          400: '#b8b29e',
          500: '#a39c85',  // Main olive/sage
          600: '#8a8470',
          700: '#726d5d',
          800: '#5e5a4e',
          900: '#4d4a42',
        },
        accent: {
          50: '#f0f9f7',
          100: '#d9f1eb',
          200: '#b3e3d7',
          300: '#7dcab9',  // Teal accent
          400: '#4dac96',
          500: '#33927b',
          600: '#267563',
          700: '#205f52',
          800: '#1d4d43',
          900: '#1a4038',
        },
        cream: {
          50: '#fcfbf9',
          100: '#f9f7f3',
          200: '#f3f0e9',  // Main cream background
          300: '#ebe7dc',
          400: '#ddd7c7',
          500: '#cdc5b0',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        // Softer, more refined elevation system
        soft: '0 1px 2px rgba(45, 42, 35, 0.04), 0 1px 3px rgba(45, 42, 35, 0.06)',
        card: '0 2px 4px rgba(45, 42, 35, 0.04), 0 4px 12px rgba(45, 42, 35, 0.06)',
        elevated: '0 8px 24px rgba(45, 42, 35, 0.08), 0 2px 6px rgba(45, 42, 35, 0.05)',
        glow: '0 8px 30px rgba(38, 117, 99, 0.18)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #33927b 0%, #205f52 100%)',
        'brand-soft': 'linear-gradient(135deg, #f0f9f7 0%, #f8f7f4 100%)',
        'app-bg': 'linear-gradient(180deg, #fcfbf9 0%, #f3f0e9 100%)',
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
}
