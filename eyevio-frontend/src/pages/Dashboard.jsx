import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { trendAPI, visionTestAPI, webcamAPI, reportsAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [summaryRes, testsRes, metricsRes] = await Promise.all([
        trendAPI.getSummary({ period: '30d' }),
        visionTestAPI.getStats({ period: '30d' }),
        webcamAPI.getMetrics({ limit: 1 }),
      ])

      setStats({
        summary: summaryRes.data,
        tests: testsRes.data,
        metrics: metricsRes.data?.metrics?.[0],
      })
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
      </div>
    )
  }

  const handleDownloadReport = async () => {
    setDownloading(true)
    try {
      const response = await reportsAPI.generate({ days: 30, format: 'pdf' })
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `eyevio-monthly-report-${new Date().toISOString().split('T')[0]}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Report downloaded successfully!')
    } catch (error) {
      console.error('Failed to download report:', error)
      toast.error('Failed to download report')
    } finally {
      setDownloading(false)
    }
  }

  const handleViewTrends = () => {
    navigate('/trends')
  }

  const handleGeneratePrescription = () => {
    navigate('/reports')
  }

  const hasData = stats?.tests?.total_tests > 0

  return (
    <div className="space-y-8 md:space-y-12 pb-8">
      {/* Modern Header with Gradient */}
      <div className="animate-fadeInUp">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
              Vision Dashboard
            </h1>
            <p className="text-lg text-gray-600">Welcome back, <span className="font-semibold text-gray-900">{user?.full_name || 'User'}</span></p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-2">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-2 rounded-full">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-green-700">All Systems Operational</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Stats Grid with Gradients */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
        {/* Health Score Card */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-fadeInUp stagger-1">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-white/90 mb-2">Health Score</div>
            <div className="text-4xl font-bold text-white mb-2">
              {stats?.summary?.health_score || 0}
              {stats?.summary?.health_score ? '/100' : ''}
            </div>
            <div className="text-xs font-medium text-white/80">
              {stats?.summary?.health_score ? 'Excellent condition' : 'No data yet'}
            </div>
          </div>
        </div>

        {/* Tests Taken Card */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-fadeInUp stagger-2">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-white/90 mb-2">Tests Taken</div>
            <div className="text-4xl font-bold text-white mb-2">
              {stats?.tests?.total_tests || 0}
            </div>
            <div className="text-xs font-medium text-white/80">Last 30 days</div>
          </div>
        </div>

        {/* Average Score Card */}
        <div className="group relative overflow-hidden bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-fadeInUp stagger-3">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="text-sm font-medium text-white/90 mb-2">Avg Score</div>
            <div className="text-4xl font-bold text-white mb-2">
              {stats?.tests?.average_score ? `${Math.round(stats.tests.average_score)}%` : '0%'}
            </div>
            <div className="text-xs font-medium text-white/80">
              {stats?.tests?.average_score ? 'This month' : 'No tests yet'}
            </div>
          </div>
        </div>

        {/* Active Alerts Card */}
        <Link to="/alerts" className="group relative overflow-hidden bg-gradient-to-br from-rose-500 via-pink-500 to-red-600 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 animate-fadeInUp stagger-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-white bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                View
              </span>
            </div>
            <div className="text-sm font-medium text-white/90 mb-2">Active Alerts</div>
            <div className="text-4xl font-bold text-white mb-2">0</div>
            <div className="text-xs font-medium text-white/80">All clear</div>
          </div>
        </Link>
      </div>

      {/* Shareable Reports - Modern Design */}
      <div className="animate-fadeInUp stagger-2">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-1">Shareable Reports</h2>
            <p className="text-gray-600">Export and share your eye health data</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
          {/* Monthly Summary */}
          <div className="group relative bg-white rounded-2xl p-7 shadow-md border border-gray-200 hover:shadow-2xl hover:border-blue-300 transition-all duration-500 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">Monthly</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Monthly Summary</h3>
              <p className="text-sm text-gray-600 mb-5 leading-relaxed">Comprehensive monthly eye health report with detailed insights</p>
              <button 
                onClick={handleDownloadReport}
                disabled={downloading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloading ? 'Downloading...' : 'Download PDF'}
              </button>
            </div>
          </div>

          {/* Trend Analysis */}
          <div className="group relative bg-white rounded-2xl p-7 shadow-md border border-gray-200 hover:shadow-2xl hover:border-purple-300 transition-all duration-500 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">Quarterly</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Trend Analysis</h3>
              <p className="text-sm text-gray-600 mb-5 leading-relaxed">Visual trends and progress tracking over time</p>
              <button 
                onClick={handleViewTrends}
                className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:from-purple-700 hover:to-purple-800 transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
                View Trends
              </button>
            </div>
          </div>

          {/* Prescription Report */}
          <div className="group relative bg-white rounded-2xl p-7 shadow-md border border-gray-200 hover:shadow-2xl hover:border-green-300 transition-all duration-500 hover:-translate-y-1">
            <div className="absolute top-0 right-0 w-24 h-24 bg-green-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700 opacity-50"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-5">
                <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">Medical</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Prescription Report</h3>
              <p className="text-sm text-gray-600 mb-5 leading-relaxed">Medical-grade health assessment for professionals</p>
              <button 
                onClick={handleGeneratePrescription}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 text-white px-5 py-3 rounded-xl text-sm font-semibold hover:from-green-700 hover:to-green-800 transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Generate Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Enhanced Hero Cards */}
      <div className="animate-fadeInUp stagger-3">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-1">Quick Actions</h2>
            <p className="text-gray-600">Start testing your vision health now</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <Link
            to="/vision-tests"
            className="group relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-3xl p-10 text-white hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-1000"></div>
            
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center shadow-xl ring-2 ring-white/30">
                  <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-white bg-white/20 backdrop-blur-lg px-4 py-2 rounded-full shadow-lg">
                  5 mins
                </span>
              </div>
              
              <h3 className="text-3xl font-bold mb-3 text-white">Take Vision Test</h3>
              <p className="text-white/95 mb-8 text-base leading-relaxed">Complete a comprehensive eye health assessment with multiple diagnostic tests</p>
              
              <div className="inline-flex items-center font-bold text-white group-hover:translate-x-3 transition-transform duration-300 text-lg">
                <span>Start Test Now</span>
                <svg className="w-6 h-6 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            to="/eye-tracking-analysis"
            className="group relative overflow-hidden bg-gradient-to-br from-teal-600 via-cyan-600 to-blue-700 rounded-3xl p-10 text-white hover:shadow-2xl transition-all duration-500 hover:scale-[1.02]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-teal-400/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 group-hover:scale-150 transition-transform duration-1000"></div>
            
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-lg rounded-2xl flex items-center justify-center shadow-xl ring-2 ring-white/30">
                  <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-white bg-white/20 backdrop-blur-lg px-4 py-2 rounded-full shadow-lg">
                  AI Powered
                </span>
              </div>
              
              <h3 className="text-3xl font-bold mb-3 text-white">Eye Tracking Analysis</h3>
              <p className="text-white/95 mb-8 text-base leading-relaxed">Advanced eye tracking with AI feedback, fatigue detection, and real-time monitoring</p>
              
              <div className="inline-flex items-center font-bold text-white group-hover:translate-x-3 transition-transform duration-300 text-lg">
                <span>Launch Camera</span>
                <svg className="w-6 h-6 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* AI Features - Modern Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-3xl p-8 md:p-10 border-2 border-purple-200 shadow-xl animate-fadeInUp stagger-4">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-200/30 to-purple-300/30 rounded-full -mr-48 -mt-48 blur-3xl"></div>
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-100 border border-purple-300 px-4 py-2 rounded-full mb-4">
                <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                </svg>
                <span className="text-sm font-bold text-purple-700">Powered by AI</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
                AI-Powered Eye Health Features
              </h3>
              <p className="text-lg text-gray-700 max-w-2xl">Personalized insights and educational resources powered by advanced machine learning</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 mt-8">
            <Link
              to="/eye-conditions"
              className="group bg-white/80 backdrop-blur-sm rounded-2xl p-7 hover:shadow-2xl transition-all duration-500 border-2 border-purple-200 hover:border-purple-400 hover:-translate-y-2"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-2 text-xl group-hover:text-purple-600 transition-colors">
                    Eye Conditions Library
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed">Learn about symptoms, risk factors, and prevention tips for common eye conditions</p>
                </div>
              </div>
              <div className="inline-flex items-center text-purple-600 font-bold text-sm group-hover:translate-x-3 transition-transform duration-300 mt-2">
                <span>Explore Library</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <div className="group bg-white/80 backdrop-blur-sm rounded-2xl p-7 border-2 border-gray-200 opacity-75">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 bg-gradient-to-br from-gray-400 to-gray-500 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-700 mb-2 text-xl flex items-center gap-2">
                    More Features Coming Soon
                    <span className="text-xs font-semibold bg-gray-200 px-2 py-1 rounded">Soon</span>
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">We're working on exciting new AI features to enhance your eye health journey</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
