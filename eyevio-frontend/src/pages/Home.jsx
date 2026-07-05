import { Link } from 'react-router-dom'

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-lg border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <span className="text-2xl font-bold text-gray-900">eyevio</span>
            </div>
            <div className="flex items-center space-x-8">
              <a href="#home" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Home
              </a>
              <a href="#about" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                About
              </a>
              <a href="#tests" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Tests
              </a>
              <Link to="/login" className="text-gray-700 hover:text-gray-900 font-medium transition-colors">
                Dashboard
              </Link>
              <Link
                to="/register"
                className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-2.5 rounded-full font-semibold hover:from-teal-600 hover:to-cyan-700 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                Take Vision Test
              </Link>
              <Link
                to="/login"
                className="bg-white text-gray-700 px-6 py-2.5 rounded-full font-semibold hover:bg-gray-50 transition-all duration-300 border-2 border-gray-200"
              >
                Login
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-24" id="home">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <div className="animate-fadeInUp">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-6">
              Interactive Vision Tests
            </h1>
            <p className="text-lg md:text-xl text-gray-700 mb-10 leading-relaxed">
              Comprehensive vision assessments powered by AI to detect and track eye health concerns accurately. 
              Take science-backed tests from the comfort of your home.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/register"
                className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-8 py-4 rounded-full text-lg font-bold hover:from-teal-600 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-[1.02] text-center"
              >
                Take Vision Test
              </Link>
              <Link
                to="/login"
                className="bg-white text-gray-700 px-8 py-4 rounded-full text-lg font-bold hover:bg-gray-50 transition-all duration-300 border-2 border-gray-300 hover:border-gray-400 text-center"
              >
                View Dashboard
              </Link>
            </div>
          </div>

          {/* Right Image - AI Eye with Tech Elements */}
          <div className="relative animate-fadeInUp stagger-1">
            <div className="relative bg-gradient-to-br from-blue-100 via-purple-100 to-pink-100 rounded-3xl p-8 shadow-2xl border border-gray-200">
              {/* Main Eye Illustration */}
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-white to-gray-50 flex items-center justify-center shadow-inner">
                <svg viewBox="0 0 600 450" className="w-full h-full p-8">
                  {/* Circuit board pattern background */}
                  <defs>
                    <pattern id="circuit" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                      <path d="M10,10 L50,10 M30,10 L30,50" stroke="#E0E7FF" strokeWidth="1" fill="none" opacity="0.3"/>
                      <circle cx="10" cy="10" r="2" fill="#818CF8" opacity="0.3"/>
                      <circle cx="50" cy="10" r="2" fill="#818CF8" opacity="0.3"/>
                      <circle cx="30" cy="50" r="2" fill="#818CF8" opacity="0.3"/>
                    </pattern>
                    <radialGradient id="eyeGradient">
                      <stop offset="0%" stopColor="#06B6D4" />
                      <stop offset="50%" stopColor="#0891B2" />
                      <stop offset="100%" stopColor="#0E7490" />
                    </radialGradient>
                    <radialGradient id="irisGradient">
                      <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.8"/>
                      <stop offset="100%" stopColor="#0891B2" stopOpacity="1"/>
                    </radialGradient>
                    <linearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.2"/>
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.2"/>
                    </linearGradient>
                  </defs>
                  
                  <rect width="600" height="450" fill="url(#circuit)"/>
                  
                  {/* Glow effect */}
                  <ellipse cx="300" cy="225" rx="200" ry="120" fill="url(#glowGradient)" opacity="0.5"/>
                  
                  {/* Eye outline */}
                  <ellipse cx="300" cy="225" rx="180" ry="90" fill="none" stroke="url(#eyeGradient)" strokeWidth="4"/>
                  
                  {/* Iris outer ring */}
                  <circle cx="300" cy="225" r="75" fill="#0891B2" opacity="0.3"/>
                  <circle cx="300" cy="225" r="65" fill="url(#irisGradient)"/>
                  
                  {/* Iris details */}
                  <g opacity="0.4">
                    <line x1="300" y1="160" x2="300" y2="195" stroke="#164E63" strokeWidth="2"/>
                    <line x1="335" y1="180" x2="315" y2="205" stroke="#164E63" strokeWidth="2"/>
                    <line x1="350" y1="225" x2="320" y2="225" stroke="#164E63" strokeWidth="2"/>
                    <line x1="335" y1="270" x2="315" y2="245" stroke="#164E63" strokeWidth="2"/>
                    <line x1="300" y1="290" x2="300" y2="255" stroke="#164E63" strokeWidth="2"/>
                    <line x1="265" y1="270" x2="285" y2="245" stroke="#164E63" strokeWidth="2"/>
                    <line x1="250" y1="225" x2="280" y2="225" stroke="#164E63" strokeWidth="2"/>
                    <line x1="265" y1="180" x2="285" y2="205" stroke="#164E63" strokeWidth="2"/>
                  </g>
                  
                  {/* Pupil */}
                  <circle cx="300" cy="225" r="35" fill="#0C4A6E"/>
                  
                  {/* Light reflections */}
                  <circle cx="320" cy="205" r="12" fill="white" opacity="0.9"/>
                  <circle cx="285" cy="220" r="6" fill="white" opacity="0.7"/>
                  
                  {/* Tech elements around eye */}
                  <g opacity="0.6">
                    {/* Top left */}
                    <circle cx="150" cy="150" r="4" fill="#8B5CF6"/>
                    <line x1="150" y1="150" x2="180" y2="180" stroke="#8B5CF6" strokeWidth="2"/>
                    
                    {/* Top right */}
                    <circle cx="450" cy="150" r="4" fill="#06B6D4"/>
                    <line x1="450" y1="150" x2="420" y2="180" stroke="#06B6D4" strokeWidth="2"/>
                    
                    {/* Bottom left */}
                    <circle cx="150" cy="300" r="4" fill="#EC4899"/>
                    <line x1="150" y1="300" x2="180" y2="270" stroke="#EC4899" strokeWidth="2"/>
                    
                    {/* Bottom right */}
                    <circle cx="450" cy="300" r="4" fill="#10B981"/>
                    <line x1="450" y1="300" x2="420" y2="270" stroke="#10B981" strokeWidth="2"/>
                  </g>
                  
                  {/* Scanning lines */}
                  <line x1="120" y1="225" x2="180" y2="225" stroke="#06B6D4" strokeWidth="2" opacity="0.5">
                    <animate attributeName="x1" values="120;100;120" dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="x2" values="180;160;180" dur="2s" repeatCount="indefinite"/>
                  </line>
                  <line x1="420" y1="225" x2="480" y2="225" stroke="#8B5CF6" strokeWidth="2" opacity="0.5">
                    <animate attributeName="x1" values="420;440;420" dur="2s" repeatCount="indefinite"/>
                    <animate attributeName="x2" values="480;500;480" dur="2s" repeatCount="indefinite"/>
                  </line>
                </svg>
              </div>

              {/* Decorative dots */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <div className="absolute top-2/3 left-1/3 w-2 h-2 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-pink-400 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
                <div className="absolute bottom-1/4 right-1/3 w-2 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '1.5s' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Available Vision Tests */}
        <div className="mt-24 md:mt-32" id="tests">
          <div className="text-center mb-12 md:mb-16 animate-fadeInUp">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Available Vision Tests
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Choose from our selection of medically validated tests to assess different aspects of your vision.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fadeInUp stagger-1">
            {[
              { 
                name: 'Visual Acuity Test', 
                time: '3-4 minutes',
                description: 'Professional eye chart with LogMAR & Snellen scoring',
                color: 'from-blue-500 to-indigo-600',
                icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
              },
              { 
                name: 'Color Vision Test', 
                time: '2-3 minutes',
                description: 'Ishihara plates for red-green color deficiencies',
                color: 'from-pink-500 to-rose-600',
                icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01'
              },
              { 
                name: 'Amsler Grid Test', 
                time: '2-3 minutes',
                description: 'Macular degeneration & distortion screening',
                color: 'from-purple-500 to-violet-600',
                icon: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z'
              },
              { 
                name: 'Contrast Sensitivity', 
                time: '3-4 minutes',
                description: 'Pelli-Robson functional vision assessment',
                color: 'from-gray-500 to-slate-600',
                icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z'
              },
              { 
                name: 'Peripheral Field Screen', 
                time: '4-5 minutes',
                description: 'Glaucoma detection & neural health',
                color: 'from-teal-500 to-cyan-600',
                icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'
              },
              { 
                name: 'Glare Sensitivity', 
                time: '4-5 minutes',
                description: 'Cataract screening with light scatter detection',
                color: 'from-yellow-500 to-orange-600',
                icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'
              },
              { 
                name: 'Red Glow Analyzer', 
                time: '3-4 minutes',
                description: 'Digital Bruckner test for retinal health',
                color: 'from-red-500 to-pink-600',
                icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
              },
              { 
                name: 'Eye Burnout Meter', 
                time: '30 seconds',
                description: 'Ciliary muscle fatigue from screen time',
                color: 'from-amber-500 to-yellow-600',
                icon: 'M13 10V3L4 14h7v7l9-11h-7z',
                badge: 'AI Camera'
              },
              { 
                name: 'Peripheral Vision Trainer', 
                time: '60 seconds',
                description: 'Gamified visual field assessment',
                color: 'from-green-500 to-emerald-600',
                icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
                badge: 'Game'
              },
              { 
                name: 'Ocular Ergonomics AI', 
                time: 'Continuous',
                description: 'Real-time posture & lighting monitor',
                color: 'from-indigo-500 to-blue-600',
                icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
                badge: 'AI Camera'
              },
            ].map((test, idx) => (
              <div key={idx} className="group bg-white rounded-2xl p-6 shadow-md hover:shadow-2xl transition-all duration-500 border-2 border-gray-100 hover:border-gray-300 hover:-translate-y-2">
                <div className="flex items-start justify-between mb-5">
                  <div className={`w-14 h-14 bg-gradient-to-br ${test.color} rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={test.icon} />
                    </svg>
                  </div>
                  {test.badge && (
                    <span className="text-xs font-bold bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 px-3 py-1 rounded-full border border-purple-200">
                      {test.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {test.name}
                </h3>
                <p className="text-gray-600 text-sm mb-3 leading-relaxed min-h-[40px]">{test.description}</p>
                <p className="text-gray-500 text-xs font-semibold mb-4 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {test.time}
                </p>
                <Link
                  to="/register"
                  className="inline-flex items-center text-gray-700 font-bold hover:text-gray-900 group-hover:translate-x-2 transition-transform duration-300"
                >
                  Take Test
                  <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gradient-to-br from-gray-900 via-slate-900 to-gray-800 text-white py-16 mt-32" id="about">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-12 mb-12">
            <div>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span className="text-2xl font-bold">Eyevio</span>
              </div>
              <p className="text-gray-300 leading-relaxed">
                Advanced AI-powered vision health monitoring for a clearer tomorrow.
              </p>
              <div className="flex items-center gap-4 mt-6">
                <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/>
                  </svg>
                </a>
                <a href="#" className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Quick Links
              </h4>
              <ul className="space-y-3 text-gray-300">
                <li><a href="#home" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Features</a></li>
                <li><Link to="/login" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Dashboard</Link></li>
                <li><a href="#about" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Contact</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
                Legal
              </h4>
              <ul className="space-y-3 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors hover:translate-x-1 inline-block">Support</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-700 pt-8 text-center text-gray-400">
            <p>&copy; 2025 EyeVio. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Home
