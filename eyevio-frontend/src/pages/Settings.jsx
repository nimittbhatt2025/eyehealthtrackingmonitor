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
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  
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
    if (deleteConfirmText !== 'DELETE') {
      toast.error('Please type DELETE to confirm')
      return
    }

    try {
      // In production, would call API to delete account
      toast.success('Account deleted successfully')
      setShowDeleteModal(false)
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
      <div className="animate-fade-in-up">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Customize your EyeVio experience</p>
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
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-8">
        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <h2 className="section-title mb-6">Notification Preferences</h2>
            
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
                  role="switch"
                  aria-checked={settings[item.key]}
                  aria-label={`${item.label}: ${settings[item.key] ? 'on' : 'off'}`}
                  className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 ${
                    settings[item.key] ? 'bg-accent-600' : 'bg-gray-400'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
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
            <h2 className="section-title mb-6">App Preferences</h2>
            
            {/* Units */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-3">Units</label>
              <div className="grid grid-cols-2 gap-4">
                {['metric', 'imperial'].map((unit) => (
                  <button
                    key={unit}
                    onClick={() => handleChange('units', unit)}
                    className={`p-4 rounded-xl border-2 font-semibold capitalize transition-colors ${
                      settings.units === unit
                        ? 'border-accent-600 bg-accent-50 text-accent-700'
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
              <label className="block text-sm font-medium text-gray-600 mb-3">Date Format</label>
              <select
                value={settings.dateFormat}
                onChange={(e) => handleChange('dateFormat', e.target.value)}
                className="input"
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
            <h2 className="section-title mb-6">Privacy & Data</h2>
            
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
                  role="switch"
                  aria-checked={settings[item.key]}
                  aria-label={`${item.label}: ${settings[item.key] ? 'on' : 'off'}`}
                  className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 ${
                    settings[item.key] ? 'bg-accent-600' : 'bg-gray-400'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}

            {/* Data Retention */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-3">Data Retention</label>
              <select
                value={settings.dataRetention}
                onChange={(e) => handleChange('dataRetention', e.target.value)}
                className="input"
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
                  className="btn-primary w-full"
                >
                  Export My Data
                </button>
                <button
                  onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true) }}
                  className="w-full inline-flex items-center justify-center px-6 py-3 min-h-[44px] bg-red-600 text-white rounded-full font-semibold hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
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
            <h2 className="section-title mb-6">Test Settings</h2>
            
            {/* Blink Calibration Card */}
            <div className="bg-brand-soft border border-accent-100 rounded-xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Blink Detection Calibration</h3>
                  <p className="text-gray-700 mb-4">
                    Personalize blink counting for accurate webcam analysis. Takes only 30 seconds.
                  </p>
                  <button
                    onClick={() => navigate('/calibrate-blink')}
                    className="btn-primary"
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
              <label className="block text-sm font-medium text-gray-600 mb-3">Test Difficulty</label>
              <select
                value={settings.testDifficulty}
                onChange={(e) => handleChange('testDifficulty', e.target.value)}
                className="input"
              >
                <option value="easy">Easy</option>
                <option value="standard">Standard</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Reminder Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-3">Test Reminder Frequency</label>
              <select
                value={settings.reminderFrequency}
                onChange={(e) => handleChange('reminderFrequency', e.target.value)}
                className="input"
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
                  role="switch"
                  aria-checked={settings[item.key]}
                  aria-label={`${item.label}: ${settings[item.key] ? 'on' : 'off'}`}
                  className={`relative inline-flex h-7 w-14 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-2 ${
                    settings[item.key] ? 'bg-accent-600' : 'bg-gray-400'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      settings[item.key] ? 'translate-x-8' : 'translate-x-1'
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
            className="btn-primary"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-elevated max-w-md w-full p-6 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-modal-title" className="text-2xl font-serif font-bold text-gray-900 mb-3">
              Delete your account?
            </h2>
            <p className="text-gray-700 mb-4">
              This permanently deletes your account and all of your vision test
              history. This <span className="font-semibold">cannot be undone</span>.
            </p>
            <label htmlFor="delete-confirm" className="block text-base font-medium text-gray-800 mb-2">
              Type <span className="font-bold">DELETE</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl mb-6 focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              placeholder="DELETE"
            />
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-6 py-3 min-h-[44px] bg-gray-100 text-gray-800 rounded-xl font-semibold hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE'}
                className="px-6 py-3 min-h-[44px] bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
