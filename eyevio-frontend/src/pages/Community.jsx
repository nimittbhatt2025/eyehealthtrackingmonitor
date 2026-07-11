import { useState } from 'react'

function Community() {
  const [shareProgress, setShareProgress] = useState(false)

  // Welcome message from EyeCareDoc
  const welcomeMessage = {
    id: 1,
    author: 'EyeCareDoc',
    tip: 'Welcome to the EyeVio Community! This platform is designed to help you monitor and improve your vision health through regular testing, lifestyle tracking, and AI-powered insights. Key features include: Vision Tests (Acuity, Astigmatism, Color Blindness, Contrast Sensitivity), Webcam Analysis for eye health monitoring, Lifestyle Tracking to understand how sleep, screen time, and exercise affect your vision, AI Predictions to forecast your vision trends, and Achievement System to keep you motivated. Remember, EyeVio is a screening tool and should not replace professional eye care. If you notice any concerning changes in your vision, please consult an eye care professional. We\'re excited to have you on this journey to better vision health!',
    category: 'Platform Info',
    date: 'Welcome',
    isOfficial: true
  }

  const handleShareProgress = () => {
    setShareProgress(!shareProgress)
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Community</h1>
        <p className="page-subtitle">Welcome to EyeVio - Your Vision Health Platform</p>
      </div>

      {/* Welcome Message */}
      <div className="bg-brand-gradient rounded-2xl p-6 md:p-8 text-white">
        <div className="flex items-start space-x-4">
          <div className="w-12 h-12 md:w-16 md:h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 md:w-8 md:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-serif font-bold mb-2">Welcome to EyeVio!</h2>
            <p className="text-sm md:text-base text-white text-opacity-95 mb-3">
              Community features are coming soon. For now, explore all that EyeVio has to offer:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm md:text-base">
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Vision Tests (Acuity, Astigmatism, Color Blindness, Contrast)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Webcam Analysis for eye health monitoring</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Lifestyle Tracking (sleep, screen time, exercise)</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>AI-Powered Predictions and Trends</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Achievement System to stay motivated</span>
              </div>
              <div className="flex items-start space-x-2">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Data Export and Privacy Controls</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About EyeVio Section */}
      <div className="card p-6 md:p-8">
        <div className="flex items-start space-x-4 mb-6">
          <div className="w-10 h-10 md:w-12 md:h-12 bg-brand-gradient rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl flex-shrink-0">
            E
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <div className="font-semibold text-gray-900 text-base md:text-lg">{welcomeMessage.author}</div>
              <span className="px-2 py-0.5 bg-[#7dcab9] bg-opacity-20 text-[#7dcab9] text-xs font-medium rounded-full">
                Official
              </span>
            </div>
            <div className="text-xs md:text-sm text-gray-500">{welcomeMessage.date}</div>
          </div>
        </div>
        
        <p className="text-sm md:text-base text-gray-700 leading-relaxed mb-4">
          {welcomeMessage.tip}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <span className="px-3 py-1 bg-[#f3f0e9] text-[#a39c85] text-xs font-medium rounded-full">
            {welcomeMessage.category}
          </span>
          <div className="text-sm text-gray-500">
            Platform Information
          </div>
        </div>
      </div>

      {/* Important Note */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 md:p-8">
        <div className="flex items-start space-x-3">
          <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 text-base md:text-lg">Important Reminder</h3>
            <p className="text-sm md:text-base text-gray-700">
              EyeVio is a screening and monitoring tool designed to help you track your vision health over time. 
              It is <strong>not a substitute for professional medical advice</strong>, diagnosis, or treatment. 
              If you experience any vision changes, discomfort, or concerns, please consult with a qualified eye care professional.
            </p>
          </div>
        </div>
      </div>

      {/* Coming Soon */}
      <div className="bg-brand-soft rounded-2xl p-6 md:p-8 border border-gray-200">
        <h2 className="section-title text-xl md:text-2xl mb-3">Community Features Coming Soon</h2>
        <p className="text-sm md:text-base text-gray-600 mb-4">
          We're working on exciting community features to help you connect with others on their vision health journey:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-[#7dcab9] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm md:text-base">Community Tips</div>
              <div className="text-xs md:text-sm text-gray-600">Share and discover eye health tips</div>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-[#7dcab9] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm md:text-base">Success Stories</div>
              <div className="text-xs md:text-sm text-gray-600">Get inspired by others' journeys</div>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-[#7dcab9] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm md:text-base">Community Trends</div>
              <div className="text-xs md:text-sm text-gray-600">Compare anonymized progress data</div>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-[#7dcab9] bg-opacity-20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm md:text-base">Progress Sharing</div>
              <div className="text-xs md:text-sm text-gray-600">Share your journey anonymously</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Community
