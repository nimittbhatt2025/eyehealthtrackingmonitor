import { useState, useEffect } from 'react'
import { lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function Lifestyle() {
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [trends, setTrends] = useState([])
  const [showLogForm, setShowLogForm] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [period, setPeriod] = useState('30')
  
  const [formData, setFormData] = useState({
    screen_time: '',
    sleep_hours: '',
    outdoor_time: '',
    exercise_minutes: '',
    diet_quality: 3,
    water_intake: '',
    notes: ''
  })

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    setLoading(true)
    try {
      const [logsResponse, trendsResponse] = await Promise.all([
        lifestyleAPI.getLogs({ days: 7 }),
        lifestyleAPI.getTrends({ days: parseInt(period) })
      ])
      setLogs(logsResponse.data.logs || [])
      setTrends(trendsResponse.data.trends || [])
    } catch (error) {
      console.error('Failed to load lifestyle data:', error)
      setLogs([])
      setTrends([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await lifestyleAPI.createLog({
        ...formData,
        date: selectedDate,
        screen_time: parseFloat(formData.screen_time),
        sleep_hours: parseFloat(formData.sleep_hours),
        outdoor_time: parseFloat(formData.outdoor_time),
        exercise_minutes: parseInt(formData.exercise_minutes),
        diet_quality: parseInt(formData.diet_quality),
        water_intake: parseFloat(formData.water_intake)
      })
      
      toast.success('Lifestyle log saved!')
      setShowLogForm(false)
      setFormData({
        screen_time: '',
        sleep_hours: '',
        outdoor_time: '',
        exercise_minutes: '',
        diet_quality: 3,
        water_intake: '',
        notes: ''
      })
      loadData()
    } catch (error) {
      console.error('Failed to save log:', error)
      toast.error('Failed to save lifestyle log')
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const getQualityLabel = (quality) => {
    const labels = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent']
    return labels[quality - 1] || 'Average'
  }

  const getQualityColor = (quality) => {
    if (quality <= 2) return 'text-red-600'
    if (quality === 3) return 'text-yellow-600'
    return 'text-green-600'
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900">Lifestyle Tracking</h1>
          <p className="text-gray-600 mt-2 text-lg">Log daily habits and see their impact on vision health</p>
        </div>

        <button
          onClick={() => setShowLogForm(!showLogForm)}
          className="flex items-center px-6 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Log Today
        </button>
      </div>

      {/* Log Form */}
      {showLogForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Daily Log</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Date */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Screen Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Screen Time (hours)
                </label>
                <input
                  type="number"
                  name="screen_time"
                  value={formData.screen_time}
                  onChange={handleInputChange}
                  step="0.5"
                  min="0"
                  max="24"
                  placeholder="8.0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Sleep Hours */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sleep (hours)
                </label>
                <input
                  type="number"
                  name="sleep_hours"
                  value={formData.sleep_hours}
                  onChange={handleInputChange}
                  step="0.5"
                  min="0"
                  max="24"
                  placeholder="7.5"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Outdoor Time */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Outdoor Time (hours)
                </label>
                <input
                  type="number"
                  name="outdoor_time"
                  value={formData.outdoor_time}
                  onChange={handleInputChange}
                  step="0.5"
                  min="0"
                  max="24"
                  placeholder="2.0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Exercise */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Exercise (minutes)
                </label>
                <input
                  type="number"
                  name="exercise_minutes"
                  value={formData.exercise_minutes}
                  onChange={handleInputChange}
                  min="0"
                  max="1440"
                  placeholder="30"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Water Intake */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Water Intake (liters)
                </label>
                <input
                  type="number"
                  name="water_intake"
                  value={formData.water_intake}
                  onChange={handleInputChange}
                  step="0.1"
                  min="0"
                  max="10"
                  placeholder="2.0"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Diet Quality Slider */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Diet Quality: <span className={`font-bold ${getQualityColor(formData.diet_quality)}`}>
                  {getQualityLabel(formData.diet_quality)}
                </span>
              </label>
              <input
                type="range"
                name="diet_quality"
                value={formData.diet_quality}
                onChange={handleInputChange}
                min="1"
                max="5"
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Poor</span>
                <span>Below Avg</span>
                <span>Average</span>
                <span>Good</span>
                <span>Excellent</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                rows="3"
                placeholder="Any symptoms, events, or observations..."
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-full font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
              >
                Save Log
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Period Selector */}
      <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200 w-fit">
        {['7', '30', '90'].map((days) => (
          <button
            key={days}
            onClick={() => setPeriod(days)}
            className={`px-6 py-3 rounded-full font-semibold text-sm transition-colors ${
              period === days
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {days} Days
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Trends Charts */}
          {trends.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Screen Time & Sleep */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-serif font-bold text-gray-900 mb-6">Screen Time & Sleep</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      stroke="#9ca3af"
                    />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="screen_time" stroke="#ef4444" strokeWidth={2} name="Screen Time (hrs)" />
                    <Line type="monotone" dataKey="sleep_hours" stroke="#3b82f6" strokeWidth={2} name="Sleep (hrs)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Exercise & Outdoor Time */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-serif font-bold text-gray-900 mb-6">Activity Levels</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      stroke="#9ca3af"
                    />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="outdoor_time" fill="#10b981" name="Outdoor (hrs)" />
                    <Bar dataKey="exercise_minutes" fill="#8b5cf6" name="Exercise (min)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Diet & Water */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-serif font-bold text-gray-900 mb-6">Diet & Hydration</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      stroke="#9ca3af"
                    />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="diet_quality" stroke="#f59e0b" strokeWidth={2} name="Diet Quality (1-5)" />
                    <Line type="monotone" dataKey="water_intake" stroke="#06b6d4" strokeWidth={2} name="Water (L)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Averages Summary */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
                <h2 className="text-xl font-serif font-bold text-gray-900 mb-6">Period Averages</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-cream-200 rounded-xl p-4">
                    <div className="text-sm text-gray-600 mb-1">Avg Screen Time</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {trends.length > 0 ? (trends.reduce((acc, t) => acc + t.screen_time, 0) / trends.length).toFixed(1) : '0'} hrs
                    </div>
                  </div>
                  <div className="bg-cream-200 rounded-xl p-4">
                    <div className="text-sm text-gray-600 mb-1">Avg Sleep</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {trends.length > 0 ? (trends.reduce((acc, t) => acc + t.sleep_hours, 0) / trends.length).toFixed(1) : '0'} hrs
                    </div>
                  </div>
                  <div className="bg-cream-200 rounded-xl p-4">
                    <div className="text-sm text-gray-600 mb-1">Avg Outdoor</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {trends.length > 0 ? (trends.reduce((acc, t) => acc + t.outdoor_time, 0) / trends.length).toFixed(1) : '0'} hrs
                    </div>
                  </div>
                  <div className="bg-cream-200 rounded-xl p-4">
                    <div className="text-sm text-gray-600 mb-1">Avg Exercise</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {trends.length > 0 ? (trends.reduce((acc, t) => acc + t.exercise_minutes, 0) / trends.length).toFixed(0) : '0'} min
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Logs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Recent Logs</h2>
            
            {logs.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No logs yet</h3>
                <p className="text-gray-600 mb-6">Start tracking your daily habits to see patterns</p>
                <button
                  onClick={() => setShowLogForm(true)}
                  className="px-6 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
                >
                  Create First Log
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="border border-gray-200 rounded-xl p-6 hover:border-primary-300 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-lg font-semibold text-gray-900">{formatDate(log.date)}</div>
                      <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        log.diet_quality >= 4 ? 'bg-green-100 text-green-700' :
                        log.diet_quality === 3 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        Diet: {getQualityLabel(log.diet_quality)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm text-gray-600">{log.screen_time}h screen</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        <span className="text-sm text-gray-600">{log.sleep_hours}h sleep</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span className="text-sm text-gray-600">{log.outdoor_time}h outdoor</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span className="text-sm text-gray-600">{log.exercise_minutes}min exercise</span>
                      </div>
                    </div>
                    
                    {log.notes && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600 italic">"{log.notes}"</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Lifestyle
