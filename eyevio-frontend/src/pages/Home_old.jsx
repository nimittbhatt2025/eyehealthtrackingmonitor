import { Link } from 'react-router-dom'

function Home() {
  return (
    <div className="min-h-screen bg-cream-200">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Logo - you'll replace this with actual logo image */}
              <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center">
                <span className="text-white font-serif font-bold text-xl">E</span>
              </div>
              <span className="text-2xl font-serif font-semibold text-gray-900">EyeVio</span>
            </div>
            <div className="flex items-center space-x-8">
              <Link to="/login" className="text-gray-700 hover:text-primary-700 font-medium">
                Features
              </Link>
              <Link to="/login" className="text-gray-700 hover:text-primary-700 font-medium">
                About Us
              </Link>
              <Link to="/login" className="text-gray-700 hover:text-primary-700 font-medium">
                Dashboard
              </Link>
              <Link to="/login" className="text-gray-700 hover:text-primary-700 font-medium">
                Health
              </Link>
              <Link
                to="/login"
                className="bg-primary-600 text-white px-6 py-2 rounded-full font-medium hover:bg-primary-700 transition-colors"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <h1 className="text-6xl font-serif font-bold text-gray-900 leading-tight mb-6">
              Interactive Vision Tests
            </h1>
            <p className="text-xl text-gray-700 mb-8 leading-relaxed">
              Comprehensive vision assessments powered by AI to detect and track eye health concerns accurately. 
              Take science-backed tests from the comfort of your home.
            </p>
            <div className="flex space-x-4">
              <Link
                to="/register"
                className="bg-primary-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-primary-700 transition-colors shadow-md"
              >
                Take Vision Test
              </Link>
              <Link
                to="/login"
                className="bg-white text-primary-800 px-8 py-4 rounded-full text-lg font-semibold hover:bg-cream-100 transition-colors border-2 border-primary-400"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="bg-gradient-to-br from-primary-100 to-accent-100 rounded-3xl p-8 shadow-2xl">
              {/* Placeholder for professional photo */}
              <div className="aspect-[4/3] bg-gray-300 rounded-2xl flex items-center justify-center">
                <span className="text-gray-600 font-serif text-lg">Professional Photo Here</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Webcam Analysis */}
            <div className="relative">
              <div className="bg-white rounded-3xl p-8 shadow-lg">
                <div className="aspect-[4/3] bg-gray-200 rounded-2xl flex items-center justify-center">
                  <span className="text-gray-500">Eye Analysis Visual</span>
                </div>
              </div>
            </div>
            
            <div>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mb-6">
                <svg className="w-10 h-10 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-4xl font-serif font-bold text-gray-900 mb-4">
                Webcam Eye Analysis
              </h2>
              <p className="text-lg text-gray-700 mb-6 leading-relaxed">
                Advanced AI examines your eyes using only your webcam, detecting subtle changes in eye health over time. 
                Non-invasive, convenient, and accurate.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center bg-primary-600 text-white px-6 py-3 rounded-full font-medium hover:bg-primary-700 transition-colors"
              >
                <span>Start Webcam Analysis</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Available Vision Tests */}
        <div className="mt-32">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-serif font-bold text-gray-900 mb-4">
              Available Vision Tests
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose from our selection of medically validated tests to assess different aspects of your vision.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: 'Visual Acuity Test', time: '5 minutes', icon: '' },
              { name: 'Color Blindness Test', time: '3 minutes', icon: '' },
              { name: 'Astigmatism Test', time: '4 minutes', icon: '⭕' },
              { name: 'Eye Tracking Analysis', time: '8 minutes', icon: '' },
            ].map((test, idx) => (
              <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100">
                <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center text-3xl mb-4">
                  {test.icon}
                </div>
                <h3 className="text-xl font-serif font-semibold text-gray-900 mb-2">
                  {test.name}
                </h3>
                <p className="text-gray-600 text-sm mb-4">{test.time}</p>
                <Link
                  to="/register"
                  className="inline-flex items-center text-primary-700 font-medium hover:text-primary-800"
                >
                  Take Test
                  <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary-800 text-white py-12 mt-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-white rounded-full"></div>
                <span className="text-xl font-serif font-semibold">EyeVio</span>
              </div>
              <p className="text-gray-300">
                Advanced AI-powered vision health monitoring for a clearer tomorrow.
              </p>
            </div>
            
            <div>
              <h4 className="font-serif font-semibold text-lg mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-300">
                <li><Link to="/login" className="hover:text-white">Features</Link></li>
                <li><Link to="/login" className="hover:text-white">Dashboard</Link></li>
                <li><Link to="/login" className="hover:text-white">Contact</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-serif font-semibold text-lg mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-300">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Support</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-primary-700 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 EyeVio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-2xl font-bold text-gray-900">EyeVio</span>
            </div>
            <div className="flex items-center space-x-6">
              <Link to="/login" className="text-gray-700 hover:text-gray-900 font-medium">
                About
              </Link>
              <Link to="/login" className="text-gray-700 hover:text-gray-900 font-medium">
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div>
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Monitor Your Vision Health with AI
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Track eye test scores, lifestyle habits, and more with our AI-powered vision health monitoring platform.
            </p>
            <Link
              to="/register"
              className="inline-block bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors shadow-lg"
            >
              Start Your Free Vision Assessment
            </Link>
          </div>

          {/* Right Mockup */}
          <div className="relative">
            <div className="bg-gradient-to-br from-blue-50 to-teal-50 rounded-2xl p-8 shadow-xl">
              {/* Health Score Circle */}
              <div className="flex items-center justify-center mb-8">
                <div className="relative">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="#E5E7EB"
                      strokeWidth="12"
                      fill="none"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      stroke="#14B8A6"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={`${85 * 3.51} 351.86`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">85</div>
                      <div className="text-teal-600 text-xl">+</div>
                    </div>
                  </div>
                </div>
                <div className="ml-8 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                  <div className="h-3 bg-gray-200 rounded w-28"></div>
                </div>
              </div>

              {/* Mini Charts */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-lg p-4">
                  <svg className="w-full h-16" viewBox="0 0 100 40">
                    <path
                      d="M 0,30 Q 25,20 50,25 T 100,15"
                      stroke="#14B8A6"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d="M 0,30 Q 25,20 50,25 T 100,15 L 100,40 L 0,40 Z"
                      fill="#14B8A6"
                      fillOpacity="0.1"
                    />
                  </svg>
                </div>
                <div className="bg-white rounded-lg p-4">
                  <svg className="w-full h-16" viewBox="0 0 100 40">
                    <path
                      d="M 0,25 Q 25,15 50,20 T 100,10"
                      stroke="#3B82F6"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d="M 0,25 Q 25,15 50,20 T 100,10 L 100,40 L 0,40 Z"
                      fill="#3B82F6"
                      fillOpacity="0.1"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Features */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Key Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-teal-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">AI-Powered Tests</h3>
              <p className="text-gray-600">
                Get personalized insights with AI vision exams
              </p>
            </div>

            {/* Feature 2 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-teal-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Webcam Analysis</h3>
              <p className="text-gray-600">
                Analyze your eyes using your device camera
              </p>
            </div>

            {/* Feature 3 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-teal-100 rounded-full mb-4">
                <svg className="w-10 h-10 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Trend Analytics</h3>
              <p className="text-gray-600">
                Track changes and predict eye health
              </p>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-24">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-12">
            {/* Step 1 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-400 to-teal-400 rounded-full mb-6">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Take the Eye Test</h3>
              <p className="text-gray-600">
                Complete the online eye test with your computer or smartphone
              </p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-400 to-teal-400 rounded-full mb-6">
                <div className="relative">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    83
                  </div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Get Your Score</h3>
              <p className="text-gray-600">
                Receive an instant score and detailed recommendations
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-blue-400 to-teal-400 rounded-full mb-6">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  <circle cx="18" cy="6" r="3" fill="#10B981" stroke="white" strokeWidth="2" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Track Your Progress</h3>
              <p className="text-gray-600">
                Monitor your vision health over time
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 bg-gradient-to-r from-blue-600 to-teal-500 rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to start monitoring your vision health?
          </h2>
          <p className="text-blue-100 text-lg mb-8">
            Join thousands of users who trust EyeVio for their eye health tracking
          </p>
          <Link
            to="/register"
            className="inline-block bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-100 transition-colors shadow-lg"
          >
            Get Started Free
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 mt-24">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p>&copy; 2025 EyeVio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default Home
