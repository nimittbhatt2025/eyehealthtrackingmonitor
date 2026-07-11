import axios from 'axios'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api'

console.log('🔧 [API] Initializing with base URL:', API_BASE_URL)

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    console.log('📤 [API] Outgoing request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      headers: config.headers,
      data: config.data
    })
    
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      console.log('🔑 [API] Added auth token')
    }
    return config
  },
  (error) => {
    console.error(' [API] Request interceptor error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => {
    console.log(' [API] Response received:', {
      status: response.status,
      url: response.config.url,
      data: response.data
    })
    return response
  },
  (error) => {
    console.error(' [API] Response error:', {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      data: error.response?.data
    })
    const isAuthRequest = error.config?.url?.includes('/auth/login') ||
      error.config?.url?.includes('/auth/register')

    if (error.response?.status === 401 && !isAuthRequest) {
      // Token expired or invalid (not a failed login attempt)
      useAuthStore.getState().clearAuth()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
        toast.error('Session expired. Please login again.')
      }
    } else if (error.response?.data?.error) {
      toast.error(error.response.data.error)
    } else {
      toast.error('An error occurred. Please try again.')
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.post('/auth/change-password', data),
  refreshToken: () => api.post('/auth/refresh'),
}

// Vision Tests API
export const visionTestAPI = {
  submit: (data) => api.post('/vision-test/', data),
  getAll: (params) => api.get('/vision-test/', { params }),
  getById: (id) => api.get(`/vision-test/${id}`),
  getTestById: (id) => api.get(`/vision-test/${id}`),
  getHistory: (params) => api.get('/vision-test/', { params }),
  getStats: (params) => api.get('/vision-test/stats', { params }),
  analyzeDryEye: (data) => api.post('/vision-test/analyze-dry-eye', data),
}

// Webcam API
export const webcamAPI = {
  submitAnalysis: (data) => api.post('/webcam/analysis', data),
  getMetrics: (params) => api.get('/webcam/metrics', { params }),
  getFatigueTrend: (params) => api.get('/webcam/fatigue-trend', { params }),
}

// Lens API
export const lensAPI = {
  submitData: (data) => api.post('/lens/data', data),
  getEffectiveness: () => api.get('/lens/effectiveness'),
  getHistory: () => api.get('/lens/history'),
}

// Lifestyle API
export const lifestyleAPI = {
  createLog: (data) => api.post('/lifestyle/log', data),
  submitLog: (data) => api.post('/lifestyle/log', data),
  getLogs: (params) => api.get('/lifestyle/logs', { params }),
  getTrends: (params) => api.get('/lifestyle/trends', { params }),
  getCorrelations: (params) => api.get('/lifestyle/correlations', { params }),
}

// Trend API
export const trendAPI = {
  getTrend: (params) => api.get('/trend/', { params }),
  getPrediction: () => api.get('/trend/prediction'),
  getSummary: (params) => api.get('/trend/summary', { params }),
}

// Alerts API
export const alertsAPI = {
  getAll: (params) => api.get('/alerts/', { params }),
  markRead: (id) => api.put(`/alerts/${id}/read`),
  dismiss: (id) => api.put(`/alerts/${id}/dismiss`),
  markAction: (id) => api.put(`/alerts/${id}/action`),
  markAllRead: () => api.put('/alerts/mark-all-read'),
}

// Reports API
export const reportsAPI = {
  generate: (params) => api.get('/report/', { params, responseType: 'blob' }),
  getJSON: (params) => api.get('/report/', { params }),
}

// Calibration API
export const calibrationAPI = {
  start: () => api.post('/calibration/start'),
  submitBaseline: (data) => api.post('/calibration/baseline', data),
  submitBlink: (data) => api.post('/calibration/blink', data),
  finalize: () => api.post('/calibration/finalize'),
  getStatus: () => api.get('/calibration/status'),
  test: (data) => api.post('/calibration/test', data),
}

export default api
