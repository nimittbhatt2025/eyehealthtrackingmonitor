import { create } from 'zustand'
import { authAPI } from '../services/api'
import { toast } from 'react-hot-toast'

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('access_token') || null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  loading: false,

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
      return false
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
      
      return false
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
