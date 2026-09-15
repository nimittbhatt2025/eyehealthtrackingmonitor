/**
 * Lazily load WebGazer (and its TF.js dependency) only when gaze tracking is needed.
 * Avoids loading TF on every route — which also caused "kernel already registered" spam.
 */

const WEBGAZER_SRC = 'https://webgazer.cs.brown.edu/webgazer.js'

let loadPromise = null

export function loadWebGazer() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('WebGazer requires a browser'))
  }
  if (window.webgazer) {
    return Promise.resolve(window.webgazer)
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${WEBGAZER_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.webgazer))
      existing.addEventListener('error', () => {
        loadPromise = null
        reject(new Error('Failed to load WebGazer'))
      })
      return
    }

    const script = document.createElement('script')
    script.src = WEBGAZER_SRC
    script.async = true
    script.onload = () => {
      if (window.webgazer) resolve(window.webgazer)
      else {
        loadPromise = null
        reject(new Error('WebGazer script loaded but window.webgazer is missing'))
      }
    }
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Failed to load WebGazer script'))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}

export default loadWebGazer
