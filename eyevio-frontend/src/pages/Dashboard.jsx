import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { trendAPI, visionTestAPI, webcamAPI, reportsAPI, eyePhotoAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [photoStatus, setPhotoStatus] = useState(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      const [summaryRes, testsRes, metricsRes, photoStatusRes] = await Promise.all([
        trendAPI.getSummary({ period: '30d' }),
        visionTestAPI.getStats({ period: '30d' }),
        webcamAPI.getMetrics({ limit: 1 }),
        eyePhotoAPI.getStatus({ condition_type: 'all' }).catch(() => ({ data: null })),
      ])

      setStats({
        summary: summaryRes.data,
        tests: testsRes.data,
        metrics: metricsRes.data?.metrics?.[0],
      })
      setPhotoStatus(photoStatusRes.data)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600"></div>
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
      {/* Header */}
      <div className="animate-fade-in-up">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="page-title">Vision Dashboard</h1>
            <p className="page-subtitle">Welcome back, <span className="font-semibold text-gray-900">{user?.full_name || 'User'}</span></p>
          </div>
          <div className="flex items-center">
            <div className="badge badge-success py-2 px-3.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              All systems operational
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid — one brand hero + clean neutral cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Health Score — hero */}
        <div className="relative overflow-hidden bg-brand-gradient rounded-2xl p-6 shadow-glow animate-fade-in-up">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full"></div>
          <div className="relative z-10">
            <div className="icon-tile bg-white/15 mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div className="text-sm font-medium text-white/80 mb-1">Health Score</div>
            <div className="text-4xl font-bold text-white mb-1">
              {stats?.summary?.health_score || 0}
              {stats?.summary?.health_score ? <span className="text-2xl text-white/70">/100</span> : ''}
            </div>
            <div className="text-xs font-medium text-white/70">
              {stats?.summary?.health_score ? 'Excellent condition' : 'No data yet'}
            </div>
          </div>
        </div>

        {/* Tests Taken */}
        <div className="card hover:shadow-elevated transition-shadow animate-fade-in-up">
          <div className="icon-tile bg-accent-50 text-accent-600 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-500 mb-1">Tests Taken</div>
          <div className="text-4xl font-bold text-gray-900 mb-1">{stats?.tests?.total_tests || 0}</div>
          <div className="text-xs font-medium text-gray-400">Last 30 days</div>
        </div>

        {/* Average Score */}
        <div className="card hover:shadow-elevated transition-shadow animate-fade-in-up">
          <div className="icon-tile bg-primary-100 text-accent-700 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="text-sm font-medium text-gray-500 mb-1">Avg Score</div>
          <div className="text-4xl font-bold text-gray-900 mb-1">
            {stats?.tests?.average_score ? `${Math.round(stats.tests.average_score)}%` : '0%'}
          </div>
          <div className="text-xs font-medium text-gray-400">
            {stats?.tests?.average_score ? 'This month' : 'No tests yet'}
          </div>
        </div>

        {/* Active Alerts */}
        <Link to="/alerts" className="card-hover group animate-fade-in-up">
          <div className="flex items-start justify-between mb-4">
            <div className="icon-tile bg-amber-50 text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="badge badge-neutral group-hover:bg-gray-200 transition-colors">View</span>
          </div>
          <div className="text-sm font-medium text-gray-500 mb-1">Active Alerts</div>
          <div className="text-4xl font-bold text-gray-900 mb-1">0</div>
          <div className="text-xs font-medium text-gray-400">All clear</div>
        </Link>
      </div>

      {photoStatus?.check_due && (
        <Link
          to="/eye-health-monitor"
          className="block card p-5 border-l-4 border-l-amber-500 hover:shadow-elevated transition-shadow animate-fade-in-up"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-800">Monthly eye photo due</p>
              <p className="text-gray-700 text-sm mt-1">
                {photoStatus.message || 'Compare this month\'s photo to prior months and get alerted if your condition worsens.'}
              </p>
            </div>
            <span className="btn-primary min-h-[44px] inline-flex items-center">Take photo</span>
          </div>
        </Link>
      )}

      {photoStatus?.has_photos && !photoStatus.check_due && (
        <div className="card p-4 border-l-4 border-l-emerald-500 bg-emerald-50/50 animate-fade-in-up">
          <p className="text-sm font-medium text-emerald-900">Eye photo up to date</p>
          <p className="text-sm text-emerald-800 mt-1">
            {photoStatus.message}
            {photoStatus.last_health_score != null && (
              <> · Last score: <strong>{photoStatus.last_health_score}</strong>/100</>
            )}
          </p>
        </div>
      )}

      {/* Shareable Reports */}
      <div className="animate-fade-in-up">
        <div className="mb-6">
          <h2 className="section-title">Shareable Reports</h2>
          <p className="text-gray-500 mt-1">Export and share your eye health data</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {/* Monthly Summary */}
          <div className="card hover:shadow-elevated transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-5">
              <div className="icon-tile bg-accent-50 text-accent-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="badge badge-brand">Monthly</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Monthly Summary</h3>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed flex-1">Comprehensive monthly eye health report with detailed insights</p>
            <button 
              onClick={handleDownloadReport}
              disabled={downloading}
              className="btn-primary w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? 'Downloading...' : 'Download PDF'}
            </button>
          </div>

          {/* Trend Analysis */}
          <div className="card hover:shadow-elevated transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-5">
              <div className="icon-tile bg-primary-100 text-accent-700">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <span className="badge badge-neutral">Quarterly</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Trend Analysis</h3>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed flex-1">Visual trends and progress tracking over time</p>
            <button onClick={handleViewTrends} className="btn-secondary w-full">
              View Trends
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Prescription Report */}
          <div className="card hover:shadow-elevated transition-shadow flex flex-col">
            <div className="flex items-start justify-between mb-5">
              <div className="icon-tile bg-green-50 text-green-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="badge badge-success">Medical</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Prescription Report</h3>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed flex-1">Medical-grade health assessment for professionals</p>
            <button onClick={handleGeneratePrescription} className="btn-secondary w-full">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="animate-fade-in-up">
        <div className="mb-6">
          <h2 className="section-title">Quick Actions</h2>
          <p className="text-gray-500 mt-1">Start testing your vision health now</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <Link
            to="/vision-tests"
            className="group relative overflow-hidden bg-brand-gradient rounded-2xl p-8 md:p-10 text-white shadow-glow hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center ring-1 ring-white/20">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <span className="badge bg-white/15 text-white ring-1 ring-white/20">5 mins</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-bold mb-2 text-white">Take Vision Test</h3>
              <p className="text-white/85 mb-8 leading-relaxed">Complete a comprehensive eye health assessment with multiple diagnostic tests</p>
              <div className="inline-flex items-center font-semibold text-white group-hover:translate-x-1.5 transition-transform duration-300">
                <span>Start Test Now</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            to="/eye-tracking-analysis"
            className="group relative overflow-hidden bg-white rounded-2xl p-8 md:p-10 border border-gray-100/80 shadow-card hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-accent-50 rounded-full opacity-60 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <div className="icon-tile w-14 h-14 bg-accent-50 text-accent-600">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <span className="badge badge-brand">AI Powered</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-bold mb-2 text-gray-900">Eye Tracking Analysis</h3>
              <p className="text-gray-500 mb-8 leading-relaxed">Advanced eye tracking with AI feedback, fatigue detection, and real-time monitoring</p>
              <div className="inline-flex items-center font-semibold text-accent-700 group-hover:translate-x-1.5 transition-transform duration-300">
                <span>Launch Camera</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>

          <Link
            to="/eye-health-monitor"
            className="group relative overflow-hidden bg-white rounded-2xl p-8 md:p-10 border border-gray-100/80 shadow-card hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-amber-50 rounded-full opacity-60 group-hover:scale-110 transition-transform duration-700" />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-8">
                <div className="icon-tile w-14 h-14 bg-amber-50 text-amber-700">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="badge badge-warning">Monthly</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-serif font-bold mb-2 text-gray-900">Eye Photo Monitor</h3>
              <p className="text-gray-500 mb-8 leading-relaxed">
                Track dry eye, cornea, or glaucoma signs month-over-month with deterioration alerts
              </p>
              <div className="inline-flex items-center font-semibold text-amber-800 group-hover:translate-x-1.5 transition-transform duration-300">
                <span>Open monitor</span>
                <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* AI Features */}
      <div className="relative overflow-hidden bg-brand-soft rounded-2xl p-8 md:p-10 border border-accent-100 animate-fade-in-up">
        <div className="relative z-10">
          <div className="mb-8">
            <div className="badge badge-brand mb-4">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
              Powered by AI
            </div>
            <h3 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 mb-2">
              AI-Powered Eye Health Features
            </h3>
            <p className="text-gray-600 max-w-2xl">Personalized insights and educational resources powered by advanced machine learning</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            <Link
              to="/eye-conditions"
              className="group bg-white rounded-2xl p-6 shadow-soft hover:shadow-elevated transition-all duration-300 border border-gray-100/80 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="icon-tile w-12 h-12 bg-accent-50 text-accent-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-900 mb-1.5 text-lg group-hover:text-accent-700 transition-colors">
                    Eye Conditions Library
                  </h4>
                  <p className="text-sm text-gray-500 leading-relaxed">Learn about symptoms, risk factors, and prevention tips for common eye conditions</p>
                </div>
              </div>
              <div className="inline-flex items-center text-accent-700 font-semibold text-sm group-hover:translate-x-1.5 transition-transform duration-300">
                <span>Explore Library</span>
                <svg className="w-4 h-4 ml-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>

            <div className="bg-white/60 rounded-2xl p-6 border border-dashed border-gray-300">
              <div className="flex items-start gap-4">
                <div className="icon-tile w-12 h-12 bg-gray-100 text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-600 mb-1.5 text-lg flex items-center gap-2">
                    More Features Coming Soon
                    <span className="badge badge-neutral">Soon</span>
                  </h4>
                  <p className="text-sm text-gray-400 leading-relaxed">We're working on exciting new AI features to enhance your eye health journey</p>
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
