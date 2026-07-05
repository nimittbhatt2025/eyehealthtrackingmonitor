import { useState, useEffect } from 'react'
import { authAPI, visionTestAPI, lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Profile() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState('personal')
  
  // Form states
  const [personalInfo, setPersonalInfo] = useState({
    full_name: '',
    email: '',
    age: '',
    gender: ''
  })
  
  const [prescription, setPrescription] = useState({
    od: { sph: '', cyl: '', axis: '' },
    os: { sph: '', cyl: '', axis: '' }
  })
  
  const [lensInfo, setLensInfo] = useState({
    lens_type: '',
    lens_brand: '',
    lens_purchase_date: ''
  })
  
  const [lifestyle, setLifestyle] = useState({
    avg_screen_time_hours: '',
    avg_sleep_hours: '',
    lighting_condition: '',
    activity_level: ''
  })
  
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const response = await authAPI.getProfile()
      const profile = response.data
      
      setPersonalInfo({
        full_name: profile.full_name || '',
        email: profile.email || '',
        age: profile.age || '',
        gender: profile.gender || ''
      })
      
      setPrescription(profile.current_prescription || {
        od: { sph: '', cyl: '', axis: '' },
        os: { sph: '', cyl: '', axis: '' }
      })
      
      setLensInfo({
        lens_type: profile.lens_type || '',
        lens_brand: profile.lens_brand || '',
        lens_purchase_date: profile.lens_purchase_date || ''
      })
      
      setLifestyle(profile.lifestyle || {
        avg_screen_time_hours: '',
        avg_sleep_hours: '',
        lighting_condition: '',
        activity_level: ''
      })
    } catch (error) {
      console.error('Failed to load profile:', error)
      toast.error('Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      await authAPI.updateProfile({
        full_name: personalInfo.full_name,
        age: parseInt(personalInfo.age) || null,
        gender: personalInfo.gender,
        current_prescription: prescription,
        lens_type: lensInfo.lens_type,
        lens_brand: lensInfo.lens_brand,
        lens_purchase_date: lensInfo.lens_purchase_date || null,
        avg_screen_time_hours: parseFloat(lifestyle.avg_screen_time_hours) || null,
        avg_sleep_hours: parseFloat(lifestyle.avg_sleep_hours) || null,
        lighting_condition: lifestyle.lighting_condition,
        activity_level: lifestyle.activity_level
      })
      
      toast.success('Profile updated successfully')
    } catch (error) {
      console.error('Failed to update profile:', error)
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('New passwords do not match')
      return
    }
    
    if (passwordForm.new_password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    try {
      await authAPI.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      })
      
      toast.success('Password changed successfully')
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (error) {
      console.error('Failed to change password:', error)
      toast.error(error.response?.data?.error || 'Failed to change password')
    }
  }

  // Export Functions
  const convertToCSV = (data, headers) => {
    if (!data || data.length === 0) return ''
    
    const csvHeaders = headers.join(',')
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header] ?? ''
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value
      }).join(',')
    )
    
    return [csvHeaders, ...csvRows].join('\n')
  }

  const downloadCSV = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportVisionTests = async () => {
    setExporting(true)
    try {
      const response = await visionTestAPI.getHistory({ limit: 1000 })
      const tests = response.data.tests || []
      
      if (tests.length === 0) {
        toast.error('No vision test data to export')
        return
      }
      
      const csvData = tests.map(test => ({
        date: new Date(test.test_date).toLocaleDateString(),
        test_type: test.test_type,
        score: test.score,
        correct_answers: test.correct_answers,
        total_questions: test.total_questions,
        time_taken_seconds: test.time_taken_seconds,
        accuracy: test.accuracy,
        avg_response_time: test.avg_response_time
      }))
      
      const headers = ['date', 'test_type', 'score', 'correct_answers', 'total_questions', 'time_taken_seconds', 'accuracy', 'avg_response_time']
      const csv = convertToCSV(csvData, headers)
      downloadCSV(csv, `eyevio_vision_tests_${new Date().toISOString().split('T')[0]}.csv`)
      
      toast.success('Vision tests exported successfully')
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export vision tests')
    } finally {
      setExporting(false)
    }
  }

  const handleExportLifestyle = async () => {
    setExporting(true)
    try {
      const response = await lifestyleAPI.getLogs({ limit: 1000 })
      const logs = response.data.logs || []
      
      if (logs.length === 0) {
        toast.error('No lifestyle data to export')
        return
      }
      
      const csvData = logs.map(log => ({
        date: new Date(log.log_date).toLocaleDateString(),
        screen_time_hours: log.screen_time,
        sleep_hours: log.sleep_hours,
        outdoor_time_hours: log.outdoor_time,
        exercise_minutes: log.exercise_minutes,
        diet_quality: log.diet_quality,
        water_intake_glasses: log.water_intake,
        notes: log.notes || ''
      }))
      
      const headers = ['date', 'screen_time_hours', 'sleep_hours', 'outdoor_time_hours', 'exercise_minutes', 'diet_quality', 'water_intake_glasses', 'notes']
      const csv = convertToCSV(csvData, headers)
      downloadCSV(csv, `eyevio_lifestyle_${new Date().toISOString().split('T')[0]}.csv`)
      
      toast.success('Lifestyle data exported successfully')
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export lifestyle data')
    } finally {
      setExporting(false)
    }
  }

  const handleExportAll = async () => {
    setExporting(true)
    try {
      // Export vision tests
      await handleExportVisionTests()
      
      // Wait a moment before next export
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Export lifestyle data
      await handleExportLifestyle()
      
      toast.success('All data exported successfully')
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export all data')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-serif font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-2 text-lg">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {['personal', 'prescription', 'lens', 'lifestyle', 'security', 'export'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} {tab !== 'export' ? 'Info' : 'Data'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        
        {/* Personal Information */}
        {activeTab === 'personal' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Personal Information</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                <input
                  type="text"
                  value={personalInfo.full_name}
                  onChange={(e) => setPersonalInfo({...personalInfo, full_name: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter your full name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  type="email"
                  value={personalInfo.email}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Age</label>
                <input
                  type="number"
                  value={personalInfo.age}
                  onChange={(e) => setPersonalInfo({...personalInfo, age: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter your age"
                  min="1"
                  max="120"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                <select
                  value={personalInfo.gender}
                  onChange={(e) => setPersonalInfo({...personalInfo, gender: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
            
            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Prescription Information */}
        {activeTab === 'prescription' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">Current Prescription</h2>
              <p className="text-gray-600 text-sm">Enter your current eyeglass or contact lens prescription</p>
            </div>
            
            {/* Right Eye (OD) */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Right Eye (OD)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sphere (SPH)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={prescription.od.sph}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      od: {...prescription.od, sph: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cylinder (CYL)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={prescription.od.cyl}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      od: {...prescription.od, cyl: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Axis</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={prescription.od.axis}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      od: {...prescription.od, axis: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Left Eye (OS) */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Left Eye (OS)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Sphere (SPH)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={prescription.os.sph}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      os: {...prescription.os, sph: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cylinder (CYL)</label>
                  <input
                    type="number"
                    step="0.25"
                    value={prescription.os.cyl}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      os: {...prescription.os, cyl: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Axis</label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={prescription.os.axis}
                    onChange={(e) => setPrescription({
                      ...prescription,
                      os: {...prescription.os, axis: e.target.value}
                    })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Prescription'}
              </button>
            </div>
          </div>
        )}

        {/* Lens Information */}
        {activeTab === 'lens' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Lens Information</h2>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lens Type</label>
                <select
                  value={lensInfo.lens_type}
                  onChange={(e) => setLensInfo({...lensInfo, lens_type: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select type</option>
                  <option value="glasses">Glasses</option>
                  <option value="contacts">Contact Lenses</option>
                  <option value="none">No Correction</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Brand</label>
                <input
                  type="text"
                  value={lensInfo.lens_brand}
                  onChange={(e) => setLensInfo({...lensInfo, lens_brand: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Acuvue, Ray-Ban"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
                <input
                  type="date"
                  value={lensInfo.lens_purchase_date}
                  onChange={(e) => setLensInfo({...lensInfo, lens_purchase_date: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Lens Info'}
              </button>
            </div>
          </div>
        )}

        {/* Lifestyle */}
        {activeTab === 'lifestyle' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">Lifestyle Information</h2>
              <p className="text-gray-600 text-sm">Help us provide better insights by sharing your daily habits</p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Avg Screen Time (hours/day)</label>
                <input
                  type="number"
                  step="0.5"
                  value={lifestyle.avg_screen_time_hours}
                  onChange={(e) => setLifestyle({...lifestyle, avg_screen_time_hours: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="8"
                  min="0"
                  max="24"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Avg Sleep (hours/day)</label>
                <input
                  type="number"
                  step="0.5"
                  value={lifestyle.avg_sleep_hours}
                  onChange={(e) => setLifestyle({...lifestyle, avg_sleep_hours: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="8"
                  min="0"
                  max="24"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Lighting Condition</label>
                <select
                  value={lifestyle.lighting_condition}
                  onChange={(e) => setLifestyle({...lifestyle, lighting_condition: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select condition</option>
                  <option value="bright">Bright</option>
                  <option value="dim">Dim</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Activity Level</label>
                <select
                  value={lifestyle.activity_level}
                  onChange={(e) => setLifestyle({...lifestyle, activity_level: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select level</option>
                  <option value="sedentary">Sedentary</option>
                  <option value="moderate">Moderate</option>
                  <option value="active">Active</option>
                </select>
              </div>
            </div>
            
            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-full transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Lifestyle Info'}
              </button>
            </div>
          </div>
        )}

        {/* Security */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Change Password</h2>
            </div>
            
            <form onSubmit={handleChangePassword} className="space-y-6 max-w-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({...passwordForm, current_password: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter current password"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({...passwordForm, new_password: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter new password"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Confirm new password"
                  required
                />
              </div>
              
              <div className="pt-4">
                <button
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-3 rounded-full transition-colors"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Data Export */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-2">Export Your Data</h2>
              <p className="text-gray-600">Download your vision tests and lifestyle data in CSV format</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Vision Tests Export */}
              <div className="border border-gray-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#7dcab9] to-[#a39c85] rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Vision Tests</h3>
                    <p className="text-sm text-gray-600">All your vision test results</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Includes test dates, types, scores, accuracy, and response times for all completed vision tests.
                </p>
                <button
                  onClick={handleExportVisionTests}
                  disabled={exporting}
                  className="w-full bg-white border-2 border-[#7dcab9] text-[#7dcab9] hover:bg-[#7dcab9] hover:text-white font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? 'Exporting...' : 'Export Vision Tests'}
                </button>
              </div>

              {/* Lifestyle Export */}
              <div className="border border-gray-200 rounded-2xl p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-[#7dcab9] to-[#a39c85] rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Lifestyle Data</h3>
                    <p className="text-sm text-gray-600">All your daily habit logs</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Includes screen time, sleep hours, outdoor time, exercise, diet quality, and water intake logs.
                </p>
                <button
                  onClick={handleExportLifestyle}
                  disabled={exporting}
                  className="w-full bg-white border-2 border-[#7dcab9] text-[#7dcab9] hover:bg-[#7dcab9] hover:text-white font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exporting ? 'Exporting...' : 'Export Lifestyle Data'}
                </button>
              </div>
            </div>

            {/* Export All */}
            <div className="border-2 border-[#a39c85] rounded-2xl p-6 bg-gradient-to-r from-[#f3f0e9] to-white">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-lg mb-2">Export Complete Dataset</h3>
                  <p className="text-gray-600 mb-4">
                    Download all your data in one go. This will create separate CSV files for vision tests and lifestyle data.
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600 mb-4">
                    <li className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>All vision test history with detailed metrics</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Complete lifestyle tracking logs</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>CSV format compatible with Excel and Google Sheets</span>
                    </li>
                  </ul>
                </div>
                <div className="ml-6">
                  <button
                    onClick={handleExportAll}
                    disabled={exporting}
                    className="bg-gradient-to-r from-[#7dcab9] to-[#a39c85] text-white font-semibold px-8 py-3 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {exporting ? 'Exporting...' : 'Export All Data'}
                  </button>
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">About Your Data</p>
                  <p>Exported files contain all your historical data. Files are downloaded directly to your device and are not shared with anyone. You can import these files into spreadsheet applications for further analysis.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Profile
