import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Onboarding() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    // Step 1: Health History
    wears_glasses: false,
    wears_contacts: false,
    last_eye_exam: '',
    eye_conditions: [],
    family_history: [],
    
    // Step 2: Lifestyle
    screen_time_daily: 8,
    outdoor_time_daily: 1,
    sleep_hours: 7,
    occupation: '',
    
    // Step 3: Goals
    primary_goal: '',
    test_frequency: 'weekly',
    notifications_enabled: true,
    
    // Step 4: Profile
    age: '',
    date_of_birth: '',
    preferred_units: 'metric'
  })

  const totalSteps = 5

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }))
  }

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSkip = () => {
    completeOnboarding()
  }

  const completeOnboarding = async () => {
    try {
      // Save onboarding data to profile
      await authAPI.updateProfile({
        onboarding_completed: true,
        onboarding_data: formData,
        date_of_birth: formData.date_of_birth,
        preferred_units: formData.preferred_units
      })
      
      toast.success('Welcome to EyeVio! Your profile is all set.')
      navigate('/dashboard')
    } catch (error) {
      console.error('Error saving onboarding data:', error)
      toast.error('Error saving your information. Please try again.')
    }
  }

  const handleFinish = async () => {
    // Navigate to first vision test
    try {
      await authAPI.updateProfile({
        onboarding_completed: true,
        onboarding_data: formData,
        date_of_birth: formData.date_of_birth,
        preferred_units: formData.preferred_units
      })
      
      toast.success('Welcome to EyeVio! Let\'s start with your first vision test.')
      navigate('/vision-tests/snellen')
    } catch (error) {
      console.error('Error saving onboarding data:', error)
      toast.error('Error saving your information. Please try again.')
    }
  }

  const progressPercentage = ((currentStep - 1) / (totalSteps - 1)) * 100

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f3f0e9] to-white flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Step {currentStep} of {totalSteps}</span>
            <span className="text-sm text-gray-500">{Math.round(progressPercentage)}% complete</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-[#7dcab9] to-[#a39c85] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>

        {/* Onboarding Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-[#7dcab9] to-[#a39c85] rounded-full mb-4">
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <h1 className="text-4xl font-serif font-bold text-gray-900 mb-3">Welcome to EyeVio</h1>
                <p className="text-lg text-gray-600">Your personal vision health companion</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 bg-[#f3f0e9] rounded-xl">
                  <svg className="w-6 h-6 text-[#7dcab9] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-gray-900">Track Your Vision</h3>
                    <p className="text-sm text-gray-600">Take quick vision tests and monitor changes over time</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 bg-[#f3f0e9] rounded-xl">
                  <svg className="w-6 h-6 text-[#7dcab9] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-gray-900">Analyze Trends</h3>
                    <p className="text-sm text-gray-600">Get AI-powered insights and predictions about your eye health</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 bg-[#f3f0e9] rounded-xl">
                  <svg className="w-6 h-6 text-[#7dcab9] flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <div>
                    <h3 className="font-semibold text-gray-900">Improve Habits</h3>
                    <p className="text-sm text-gray-600">Log lifestyle factors and see how they impact your vision</p>
                  </div>
                </div>
              </div>

              <p className="text-center text-sm text-gray-500 mt-6">
                Let's set up your profile to personalize your experience
              </p>
            </div>
          )}

          {/* Step 2: Health History */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">Your Eye Health History</h2>
                <p className="text-gray-600">This helps us provide better recommendations</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Vision Correction</label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={formData.wears_glasses}
                        onChange={(e) => handleInputChange('wears_glasses', e.target.checked)}
                        className="w-4 h-4 text-[#7dcab9] rounded"
                      />
                      <span className="text-gray-700">I wear glasses</span>
                    </label>
                    <label className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={formData.wears_contacts}
                        onChange={(e) => handleInputChange('wears_contacts', e.target.checked)}
                        className="w-4 h-4 text-[#7dcab9] rounded"
                      />
                      <span className="text-gray-700">I wear contact lenses</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Eye Exam</label>
                  <select
                    value={formData.last_eye_exam}
                    onChange={(e) => handleInputChange('last_eye_exam', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7dcab9] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="within_6_months">Within 6 months</option>
                    <option value="6_12_months">6-12 months ago</option>
                    <option value="1_2_years">1-2 years ago</option>
                    <option value="over_2_years">Over 2 years ago</option>
                    <option value="never">Never had one</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Eye Conditions (if any)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Myopia', 'Hyperopia', 'Astigmatism', 'Presbyopia', 'Dry Eyes', 'Cataracts', 'Glaucoma', 'Other'].map(condition => (
                      <label key={condition} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.eye_conditions.includes(condition)}
                          onChange={() => handleArrayToggle('eye_conditions', condition)}
                          className="w-4 h-4 text-[#7dcab9] rounded"
                        />
                        <span className="text-sm text-gray-700">{condition}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Family History</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Glaucoma', 'Macular Degeneration', 'Cataracts', 'Diabetes', 'None'].map(condition => (
                      <label key={condition} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData.family_history.includes(condition)}
                          onChange={() => handleArrayToggle('family_history', condition)}
                          className="w-4 h-4 text-[#7dcab9] rounded"
                        />
                        <span className="text-sm text-gray-700">{condition}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Lifestyle */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">Your Daily Habits</h2>
                <p className="text-gray-600">Understanding your lifestyle helps us provide better insights</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Daily Screen Time: <span className="text-[#7dcab9] font-semibold">{formData.screen_time_daily} hours</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="16"
                    step="0.5"
                    value={formData.screen_time_daily}
                    onChange={(e) => handleInputChange('screen_time_daily', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0 hrs</span>
                    <span>8 hrs</span>
                    <span>16 hrs</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Daily Outdoor Time: <span className="text-[#7dcab9] font-semibold">{formData.outdoor_time_daily} hours</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="8"
                    step="0.5"
                    value={formData.outdoor_time_daily}
                    onChange={(e) => handleInputChange('outdoor_time_daily', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0 hrs</span>
                    <span>4 hrs</span>
                    <span>8 hrs</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Average Sleep: <span className="text-[#7dcab9] font-semibold">{formData.sleep_hours} hours</span>
                  </label>
                  <input
                    type="range"
                    min="4"
                    max="12"
                    step="0.5"
                    value={formData.sleep_hours}
                    onChange={(e) => handleInputChange('sleep_hours', parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>4 hrs</span>
                    <span>8 hrs</span>
                    <span>12 hrs</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Occupation Type</label>
                  <select
                    value={formData.occupation}
                    onChange={(e) => handleInputChange('occupation', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7dcab9] focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="office_computer">Office / Computer work</option>
                    <option value="outdoor">Outdoor / Physical</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="education">Education</option>
                    <option value="creative">Creative / Design</option>
                    <option value="student">Student</option>
                    <option value="retired">Retired</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Goals & Preferences */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">Your Goals</h2>
                <p className="text-gray-600">Let's customize EyeVio for your needs</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Goal</label>
                  <div className="space-y-2">
                    {[
                      { value: 'monitor_vision', label: 'Monitor vision changes', icon: '' },
                      { value: 'reduce_fatigue', label: 'Reduce eye fatigue', icon: '💤' },
                      { value: 'improve_habits', label: 'Improve eye health habits', icon: '💪' },
                      { value: 'prevent_issues', label: 'Prevent future issues', icon: '🛡' },
                      { value: 'track_prescription', label: 'Track prescription changes', icon: '👓' }
                    ].map(goal => (
                      <label
                        key={goal.value}
                        className={`flex items-center space-x-3 p-4 border-2 rounded-xl cursor-pointer transition-all ${
                          formData.primary_goal === goal.value
                            ? 'border-[#7dcab9] bg-[#7dcab9]/5'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="primary_goal"
                          value={goal.value}
                          checked={formData.primary_goal === goal.value}
                          onChange={(e) => handleInputChange('primary_goal', e.target.value)}
                          className="w-4 h-4 text-[#7dcab9]"
                        />
                        <span className="text-gray-700">{goal.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Test Frequency</label>
                  <select
                    value={formData.test_frequency}
                    onChange={(e) => handleInputChange('test_frequency', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7dcab9] focus:border-transparent"
                  >
                    <option value="daily">Daily</option>
                    <option value="every_3_days">Every 3 days</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center space-x-3 p-4 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.notifications_enabled}
                      onChange={(e) => handleInputChange('notifications_enabled', e.target.checked)}
                      className="w-4 h-4 text-[#7dcab9] rounded"
                    />
                    <div>
                      <span className="font-medium text-gray-900">Enable Notifications</span>
                      <p className="text-sm text-gray-600">Get reminders for vision tests and health tips</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Complete Profile */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-3xl font-serif font-bold text-gray-900 mb-2">Final Details</h2>
                <p className="text-gray-600">Just a few more things to personalize your experience</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                  <input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7dcab9] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Units</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center justify-center space-x-2 p-4 border-2 rounded-xl cursor-pointer ${
                      formData.preferred_units === 'metric' ? 'border-[#7dcab9] bg-[#7dcab9]/5' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="units"
                        value="metric"
                        checked={formData.preferred_units === 'metric'}
                        onChange={(e) => handleInputChange('preferred_units', e.target.value)}
                        className="w-4 h-4 text-[#7dcab9]"
                      />
                      <span className="font-medium text-gray-700">Metric (cm, kg)</span>
                    </label>
                    <label className={`flex items-center justify-center space-x-2 p-4 border-2 rounded-xl cursor-pointer ${
                      formData.preferred_units === 'imperial' ? 'border-[#7dcab9] bg-[#7dcab9]/5' : 'border-gray-200 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio"
                        name="units"
                        value="imperial"
                        checked={formData.preferred_units === 'imperial'}
                        onChange={(e) => handleInputChange('preferred_units', e.target.value)}
                        className="w-4 h-4 text-[#7dcab9]"
                      />
                      <span className="font-medium text-gray-700">Imperial (ft, lb)</span>
                    </label>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-[#7dcab9]/10 to-[#a39c85]/10 rounded-xl p-6 mt-6">
                  <h3 className="font-semibold text-gray-900 mb-3">You're All Set!</h3>
                  <p className="text-gray-700 mb-4">
                    Ready to start your vision health journey? We recommend taking your first vision test to establish a baseline.
                  </p>
                  <div className="flex items-start space-x-3 text-sm text-gray-600">
                    <svg className="w-5 h-5 text-[#7dcab9] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>The test takes about 2 minutes and will help us track your vision over time.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
            <div>
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  className="px-6 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {currentStep < totalSteps && (
                <button
                  onClick={handleSkip}
                  className="px-6 py-2 text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  Skip for now
                </button>
              )}
              
              {currentStep < totalSteps ? (
                <button
                  onClick={handleNext}
                  className="px-8 py-3 bg-gradient-to-r from-[#7dcab9] to-[#a39c85] text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  Continue
                </button>
              ) : (
                <button
                  onClick={handleFinish}
                  className="px-8 py-3 bg-gradient-to-r from-[#7dcab9] to-[#a39c85] text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                >
                  Start First Test
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Skip All */}
        {currentStep === 1 && (
          <div className="text-center mt-6">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Skip onboarding and go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Onboarding
