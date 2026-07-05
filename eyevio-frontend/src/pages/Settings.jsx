import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import { useAuthStore } from '../store/authStore'

function Settings() {
  const { user, setUser } = useAuthStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('notifications')
  
  const [settings, setSettings] = useState({
    // Notifications
    emailNotifications: true,
    testReminders: true,
    weeklyReport: true,
    achievementAlerts: true,
    lensReminders: true,
    
    // Preferences
    units: 'metric', // metric or imperial
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    
    // Privacy
    shareAnonymousData: false,
    publicProfile: false,
    dataRetention: '1year',
    
    // Test Settings
    testDifficulty: 'standard',
    autoSaveTests: true,
    testSoundEffects: true,
    reminderFrequency: 'weekly'
  })

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    // In a real app, this would load from backend
    const savedSettings = localStorage.getItem('app_settings')
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings)
      setSettings(parsed)
    }
  }

  const saveSettings = async () => {
    setLoading(true)
    try {
      // Save to local storage (in production, would save to backend)
      localStorage.setItem('app_settings', JSON.stringify(settings))
      toast.success('Settings saved successfully!')
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return
    }
    
    const confirmation = prompt('Type "DELETE" to confirm account deletion:')
    if (confirmation !== 'DELETE') {
      toast.error('Account deletion cancelled')
      return
    }

    try {
      // In production, would call API to delete account
      toast.success('Account deleted successfully')
      // Logout and redirect
      setTimeout(() => {
        localStorage.clear()
        window.location.href = '/'
      }, 2000)
    } catch (error) {
      console.error('Failed to delete account:', error)
      toast.error('Failed to delete account')
    }
  }

  const exportData = () => {
    // Export user data as JSON
    const data = {
      user: user,
      settings: settings,
      exportedAt: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `eyevio-data-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    
    toast.success('Data exported successfully!')
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-serif font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2 text-lg">Customize your EyeVio experience</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'notifications', label: 'Notifications' },
            { id: 'preferences', label: 'Preferences' },
            { id: 'privacy', label: 'Privacy & Data' },
            { id: 'tests', label: 'Test Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Notification Preferences</h2>
            
            {[
              { key: 'emailNotifications', label: 'Email Notifications', desc: 'Receive email updates about your vision health' },
              { key: 'testReminders', label: 'Test Reminders', desc: 'Get reminders to take regular vision tests' },
              { key: 'weeklyReport', label: 'Weekly Reports', desc: 'Receive weekly summary of your progress' },
              { key: 'achievementAlerts', label: 'Achievement Alerts', desc: 'Get notified when you unlock achievements' },
              { key: 'lensReminders', label: 'Lens Replacement Reminders', desc: 'Remind me when it\'s time to replace contact lenses' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-semibold text-gray-900">{item.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{item.desc}</div>
                </div>
                <button
                  onClick={() => handleToggle(item.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[item.key] ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[item.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">App Preferences</h2>
            
            {/* Units */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Units</label>
              <div className="grid grid-cols-2 gap-4">
                {['metric', 'imperial'].map((unit) => (
                  <button
                    key={unit}
                    onClick={() => handleChange('units', unit)}
                    className={`p-4 rounded-xl border-2 font-semibold capitalize transition-colors ${
                      settings.units === unit
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Format */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Date Format</label>
              <select
                value={settings.dateFormat}
                onChange={(e) => handleChange('dateFormat', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Privacy & Data</h2>
            
            {[
              { key: 'shareAnonymousData', label: 'Share Anonymous Data', desc: 'Help improve EyeVio by sharing anonymized usage data' },
              { key: 'publicProfile', label: 'Public Profile', desc: 'Allow others to see your achievements and progress' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-semibold text-gray-900">{item.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{item.desc}</div>
                </div>
                <button
                  onClick={() => handleToggle(item.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[item.key] ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[item.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}

            {/* Data Retention */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Data Retention</label>
              <select
                value={settings.dataRetention}
                onChange={(e) => handleChange('dataRetention', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="6months">6 Months</option>
                <option value="1year">1 Year</option>
                <option value="2years">2 Years</option>
                <option value="forever">Forever</option>
              </select>
            </div>

            {/* Data Export */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Management</h3>
              <div className="space-y-3">
                <button
                  onClick={exportData}
                  className="w-full px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                >
                  Export My Data
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Test Settings Tab */}
        {activeTab === 'tests' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Test Settings</h2>
            
            {/* Blink Calibration Card */}
            <div className="bg-gradient-to-br from-teal-50 to-blue-50 border-2 border-teal-200 rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Blink Detection Calibration</h3>
                  <p className="text-gray-700 mb-4">
                    Personalize blink counting for accurate webcam analysis. Takes only 30 seconds.
                  </p>
                  <button
                    onClick={() => navigate('/calibrate-blink')}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Start Calibration
                  </button>
                </div>
              </div>
            </div>
            
            {/* Difficulty */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Test Difficulty</label>
              <select
                value={settings.testDifficulty}
                onChange={(e) => handleChange('testDifficulty', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="easy">Easy</option>
                <option value="standard">Standard</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Reminder Frequency */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Test Reminder Frequency</label>
              <select
                value={settings.reminderFrequency}
                onChange={(e) => handleChange('reminderFrequency', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="never">Never</option>
              </select>
            </div>

            {[
              { key: 'autoSaveTests', label: 'Auto-save Tests', desc: 'Automatically save test progress' },
              { key: 'testSoundEffects', label: 'Sound Effects', desc: 'Play sound effects during tests' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="font-semibold text-gray-900">{item.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{item.desc}</div>
                </div>
                <button
                  onClick={() => handleToggle(item.key)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings[item.key] ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[item.key] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Save Button */}
        <div className="mt-8 pt-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={saveSettings}
            disabled={loading}
            className="px-8 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings
