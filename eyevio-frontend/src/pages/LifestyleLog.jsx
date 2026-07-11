import { useState, useEffect } from 'react'
import { lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function LifestyleLog() {
  const [activeTab, setActiveTab] = useState('today')
  const [loading, setLoading] = useState(false)
  const [recentLogs, setRecentLogs] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  
  // Form state
  const [formData, setFormData] = useState({
    screen_time_hours: '',
    sleep_hours: '',
    sleep_quality: '',
    lighting_condition: '',
    blue_light_exposure_hours: '',
    activity_level: '',
    outdoor_time_hours: '',
    exercise_minutes: '',
    breaks_taken: '',
    eye_drops_used: false,
    eye_strain_level: '',
    headache_level: '',
    dry_eyes: false,
    blurred_vision: false,
    notes: '',
  })

  useEffect(() => {
    if (activeTab === 'history') {
      loadRecentLogs()
    }
  }, [activeTab])

  useEffect(() => {
    loadLogForDate(selectedDate)
  }, [selectedDate])

  const loadLogForDate = async (date) => {
    try {
      const response = await lifestyleAPI.getLogs({ days: 365 })
      const logs = response.data.logs || []
      const logForDate = logs.find(log => log.log_date === date)
      
      if (logForDate) {
        setFormData({
          screen_time_hours: logForDate.screen_time_hours || '',
          sleep_hours: logForDate.sleep_hours || '',
          sleep_quality: logForDate.sleep_quality || '',
          lighting_condition: logForDate.lighting_condition || '',
          blue_light_exposure_hours: logForDate.blue_light_exposure_hours || '',
          activity_level: logForDate.activity_level || '',
          outdoor_time_hours: logForDate.outdoor_time_hours || '',
          exercise_minutes: logForDate.exercise_minutes || '',
          breaks_taken: logForDate.breaks_taken || '',
          eye_drops_used: logForDate.eye_drops_used || false,
          eye_strain_level: logForDate.eye_strain_level || '',
          headache_level: logForDate.headache_level || '',
          dry_eyes: logForDate.dry_eyes || false,
          blurred_vision: logForDate.blurred_vision || false,
          notes: logForDate.notes || '',
        })
      } else {
        // Reset form for new date
        setFormData({
          screen_time_hours: '',
          sleep_hours: '',
          sleep_quality: '',
          lighting_condition: '',
          blue_light_exposure_hours: '',
          activity_level: '',
          outdoor_time_hours: '',
          exercise_minutes: '',
          breaks_taken: '',
          eye_drops_used: false,
          eye_strain_level: '',
          headache_level: '',
          dry_eyes: false,
          blurred_vision: false,
          notes: '',
        })
      }
    } catch (error) {
      console.error('Failed to load log:', error)
    }
  }

  const loadRecentLogs = async () => {
    setLoading(true)
    try {
      const response = await lifestyleAPI.getLogs({ days: 30 })
      setRecentLogs(response.data.logs || [])
    } catch (error) {
      console.error('Failed to load logs:', error)
      toast.error('Failed to load lifestyle logs')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const submitData = {
        log_date: selectedDate,
        ...Object.fromEntries(
          Object.entries(formData).filter(([_, v]) => v !== '' && v !== null)
        )
      }

      await lifestyleAPI.submitLog(submitData)
      toast.success('Lifestyle log saved successfully!')
      
      // Reload history if on history tab
      if (activeTab === 'history') {
        loadRecentLogs()
      }
    } catch (error) {
      console.error('Failed to save log:', error)
      toast.error('Failed to save lifestyle log')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getQualityColor = (level) => {
    if (level <= 2) return 'text-red-600'
    if (level <= 3) return 'text-yellow-600'
    return 'text-green-600'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Lifestyle Log</h1>
        <p className="text-gray-600 mt-2 text-lg">Track daily habits that affect your eye health</p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200 w-fit">
        <button
          onClick={() => setActiveTab('today')}
          className={`px-8 py-3 rounded-full font-semibold text-sm transition-colors ${
            activeTab === 'today'
              ? 'bg-accent-600 text-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Log Entry
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-8 py-3 rounded-full font-semibold text-sm transition-colors ${
            activeTab === 'history'
              ? 'bg-accent-600 text-white'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'today' ? (
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Date Selector */}
          <div className="card p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Log Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>

          {/* Screen Time & Sleep */}
          <div className="card p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Screen Time & Sleep</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Screen Time (hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.screen_time_hours}
                  onChange={(e) => handleChange('screen_time_hours', parseFloat(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="e.g., 8.5"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Blue Light Exposure (hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.blue_light_exposure_hours}
                  onChange={(e) => handleChange('blue_light_exposure_hours', parseFloat(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="e.g., 6"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Sleep (hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.sleep_hours}
                  onChange={(e) => handleChange('sleep_hours', parseFloat(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="e.g., 7.5"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Sleep Quality
                </label>
                <select
                  value={formData.sleep_quality}
                  onChange={(e) => handleChange('sleep_quality', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  <option value="">Select quality</option>
                  <option value="1">Very Poor (1)</option>
                  <option value="2">Poor (2)</option>
                  <option value="3">Fair (3)</option>
                  <option value="4">Good (4)</option>
                  <option value="5">Excellent (5)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Breaks Taken
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.breaks_taken}
                  onChange={(e) => handleChange('breaks_taken', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="Number of breaks"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Lighting Condition
                </label>
                <select
                  value={formData.lighting_condition}
                  onChange={(e) => handleChange('lighting_condition', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  <option value="">Select condition</option>
                  <option value="bright">Bright</option>
                  <option value="dim">Dim</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Physical Activity */}
          <div className="card p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Physical Activity</h2>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Activity Level
                </label>
                <select
                  value={formData.activity_level}
                  onChange={(e) => handleChange('activity_level', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  <option value="">Select level</option>
                  <option value="sedentary">Sedentary</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Outdoor Time (hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={formData.outdoor_time_hours}
                  onChange={(e) => handleChange('outdoor_time_hours', parseFloat(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="e.g., 1.5"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Exercise (minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.exercise_minutes}
                  onChange={(e) => handleChange('exercise_minutes', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  placeholder="e.g., 30"
                />
              </div>
            </div>
          </div>

          {/* Symptoms */}
          <div className="card p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Symptoms & Eye Health</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Eye Strain Level (1-5)
                </label>
                <select
                  value={formData.eye_strain_level}
                  onChange={(e) => handleChange('eye_strain_level', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  <option value="">Select level</option>
                  <option value="1">Minimal (1)</option>
                  <option value="2">Mild (2)</option>
                  <option value="3">Moderate (3)</option>
                  <option value="4">Severe (4)</option>
                  <option value="5">Very Severe (5)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Headache Level (1-5)
                </label>
                <select
                  value={formData.headache_level}
                  onChange={(e) => handleChange('headache_level', parseInt(e.target.value))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                >
                  <option value="">Select level</option>
                  <option value="0">None (0)</option>
                  <option value="1">Minimal (1)</option>
                  <option value="2">Mild (2)</option>
                  <option value="3">Moderate (3)</option>
                  <option value="4">Severe (4)</option>
                  <option value="5">Very Severe (5)</option>
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="dry_eyes"
                  checked={formData.dry_eyes}
                  onChange={(e) => handleChange('dry_eyes', e.target.checked)}
                  className="w-5 h-5 text-accent-600 border-gray-300 rounded focus:ring-accent-500"
                />
                <label htmlFor="dry_eyes" className="ml-3 text-sm font-semibold text-gray-900">
                  Dry Eyes
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="blurred_vision"
                  checked={formData.blurred_vision}
                  onChange={(e) => handleChange('blurred_vision', e.target.checked)}
                  className="w-5 h-5 text-accent-600 border-gray-300 rounded focus:ring-accent-500"
                />
                <label htmlFor="blurred_vision" className="ml-3 text-sm font-semibold text-gray-900">
                  Blurred Vision
                </label>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="eye_drops_used"
                  checked={formData.eye_drops_used}
                  onChange={(e) => handleChange('eye_drops_used', e.target.checked)}
                  className="w-5 h-5 text-accent-600 border-gray-300 rounded focus:ring-accent-500"
                />
                <label htmlFor="eye_drops_used" className="ml-3 text-sm font-semibold text-gray-900">
                  Used Eye Drops
                </label>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Additional Notes</h2>
            
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              placeholder="Any additional observations about your eye health today..."
            />
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className={`px-8 py-4 rounded-full font-semibold text-lg transition-colors ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'btn-primary'
              } text-white`}
            >
              {loading ? 'Saving...' : 'Save Log Entry'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Recent Logs</h2>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600 mx-auto"></div>
            </div>
          ) : recentLogs.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Logs Yet</h3>
              <p className="text-gray-600 mb-6">Start tracking your daily lifestyle to see patterns</p>
              <button
                onClick={() => setActiveTab('today')}
                className="px-6 py-3 btn-primary transition-colors"
              >
                Create First Log
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentLogs.map((log) => (
                <div key={log.id} className="p-6 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {formatDate(log.log_date)}
                    </h3>
                    <button
                      onClick={() => {
                        setSelectedDate(log.log_date)
                        setActiveTab('today')
                      }}
                      className="text-accent-600 hover:text-accent-700 text-sm font-semibold"
                    >
                      Edit
                    </button>
                  </div>
                  
                  <div className="grid md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Screen Time:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {log.screen_time_hours ? `${log.screen_time_hours}h` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Sleep:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {log.sleep_hours ? `${log.sleep_hours}h` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Exercise:</span>
                      <span className="ml-2 font-semibold text-gray-900">
                        {log.exercise_minutes ? `${log.exercise_minutes}m` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Eye Strain:</span>
                      <span className={`ml-2 font-semibold ${getQualityColor(log.eye_strain_level)}`}>
                        {log.eye_strain_level ? `Level ${log.eye_strain_level}` : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {log.notes && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-700 italic">{log.notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default LifestyleLog
