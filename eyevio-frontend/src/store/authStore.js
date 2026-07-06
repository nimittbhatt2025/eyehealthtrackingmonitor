import { create } from 'zustand'
import { authAPI } from '../services/api'
import { toast } from 'react-hot-toast'

const readStoredUser = () => {
  try {
    const user = localStorage.getItem('user')
    return user ? JSON.parse(user) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set) => ({
  user: readStoredUser(),
  token: localStorage.getItem('access_token') || null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,

  hydrate: () => {
    const token = localStorage.getItem('access_token')
    if (token) {
      set({
        token,
        user: readStoredUser(),
        isAuthenticated: true,
      })
    }
  },

  clearAuth: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    })
  },

  login: async (credentials) => {
    set({ loading: true })
    try {
      const response = await authAPI.login(credentials)
      const { access_token, user } = response.data
      
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({
        user,
        token: access_token,
        isAuthenticated: true,
        loading: false,
      })
      
      toast.success('Login successful!')
      return true
    } catch (error) {
      set({ loading: false })
      throw error
    }
  },

  register: async (userData) => {
    set({ loading: true })
    try {
      console.log('Attempting registration with:', userData) // Debug log
      const response = await authAPI.register(userData)
      console.log('Registration response:', response) // Debug log
      const { access_token, user } = response.data
      
      localStorage.setItem('access_token', access_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({
        user,
        token: access_token,
        isAuthenticated: true,
        loading: false,
      })
      
      toast.success('Registration successful!')
      return true
    } catch (error) {
      console.error('Registration error:', error) // Debug log
      console.error('Error response:', error.response) // Debug log
      set({ loading: false })
      
      // Show specific error message if available
      if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else {
        toast.error('Registration failed. Please try again.')
      }
      
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    })
    toast.success('Logged out successfully')
  },

  updateUser: (userData) => {
    const updatedUser = { ...useAuthStore.getState().user, ...userData }
    localStorage.setItem('user', JSON.stringify(updatedUser))
    set({ user: updatedUser })
  },
}))
