import { useState, useEffect } from 'react'
import { reportsAPI, visionTestAPI, authAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Reports() {
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState('30')
  const [userProfile, setUserProfile] = useState(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    loadUserProfile()
    loadReportData()
  }, [selectedPeriod])

  const loadUserProfile = async () => {
    try {
      const response = await authAPI.getProfile()
      setUserProfile(response.data)
    } catch (error) {
      console.error('Failed to load profile:', error)
    }
  }

  const loadReportData = async () => {
    setLoading(true)
    try {
      const response = await reportsAPI.getJSON({ days: parseInt(selectedPeriod), format: 'json' })
      console.log('Report data loaded:', response.data)
      setReportData(response.data)
    } catch (error) {
      console.error('Failed to load report data:', error)
      // Don't show error toast, just set empty data so UI shows "No Data Available"
      setReportData(null)
    } finally {
      setLoading(false)
    }
  }

  const downloadPDF = async () => {
    setGenerating(true)
    try {
      const response = await reportsAPI.generate({ days: parseInt(selectedPeriod), format: 'pdf' })
      
      // Create blob and download
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `eyevio-report-${selectedPeriod}days-${new Date().toISOString().split('T')[0]}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      toast.success('Report downloaded successfully!')
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      toast.error('Failed to generate PDF report')
    } finally {
      setGenerating(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getTrendIcon = (trend) => {
    if (trend === 'improving') {
      return (
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      )
    }
    if (trend === 'declining') {
      return (
        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      )
    }
    return (
      <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900">Health Reports</h1>
          <p className="text-gray-600 mt-2 text-lg">Comprehensive analysis of your vision health</p>
        </div>

        <button
          onClick={downloadPDF}
          disabled={generating || !reportData}
          className={`flex items-center px-6 py-3 rounded-full font-semibold transition-colors ${
            generating || !reportData
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-accent-600 hover:bg-accent-700'
          } text-white`}
        >
          {generating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF
            </>
          )}
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200 w-fit">
        {['7', '30', '90', '180'].map((days) => (
          <button
            key={days}
            onClick={() => setSelectedPeriod(days)}
            className={`px-6 py-3 rounded-full font-semibold text-sm transition-colors ${
              selectedPeriod === days
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
      ) : !reportData ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h3>
          <p className="text-gray-600">Complete vision tests and lifestyle logs to generate reports</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Report Header Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-serif font-bold text-gray-900">Report Summary</h2>
              <div className="text-sm text-gray-600">
                {formatDate(reportData.report_period.start_date)} - {formatDate(reportData.report_period.end_date)}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-cream-200 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-2">Patient Name</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.user.name}</div>
              </div>
              <div className="bg-cream-200 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-2">Age</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.user.age || 'N/A'}</div>
              </div>
              <div className="bg-cream-200 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-2">Lens Type</div>
                <div className="text-lg font-semibold text-gray-900 capitalize">
                  {reportData.user.lens_type || 'None'}
                </div>
              </div>
              <div className="bg-cream-200 rounded-xl p-6">
                <div className="text-sm text-gray-600 mb-2">Report Period</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.report_period.days} Days</div>
              </div>
            </div>
          </div>

          {/* Vision Summary */}
          {reportData.vision_summary && Object.keys(reportData.vision_summary).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Vision Health Summary</h2>
              
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="bg-primary-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Average Score</div>
                  <div className="text-3xl font-bold text-primary-700">
                    {reportData.vision_summary.average_score?.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-green-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Best Score</div>
                  <div className="text-3xl font-bold text-green-700">
                    {reportData.vision_summary.max_score?.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-orange-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Lowest Score</div>
                  <div className="text-3xl font-bold text-orange-700">
                    {reportData.vision_summary.min_score?.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Total Tests</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {reportData.vision_summary.total_tests}
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-accent-100 rounded-full flex items-center justify-center">
                      <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Trend</div>
                      <div className="flex items-center space-x-2">
                        {getTrendIcon(reportData.vision_summary.trend)}
                        <span className="text-2xl font-bold text-gray-900 capitalize">
                          {reportData.vision_summary.trend}
                        </span>
                      </div>
                    </div>
                    <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                      <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fatigue Summary */}
          {reportData.fatigue_summary && Object.keys(reportData.fatigue_summary).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Eye Fatigue Analysis</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-orange-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Average Fatigue</div>
                  <div className="text-3xl font-bold text-orange-700">
                    {reportData.fatigue_summary.average_fatigue?.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-red-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Peak Fatigue</div>
                  <div className="text-3xl font-bold text-red-700">
                    {reportData.fatigue_summary.max_fatigue?.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-accent-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Avg Blink Rate</div>
                  <div className="text-3xl font-bold text-accent-700">
                    {reportData.fatigue_summary.average_blink_rate?.toFixed(0) || 'N/A'}
                    {reportData.fatigue_summary.average_blink_rate && <span className="text-lg">/min</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lifestyle Summary */}
          {reportData.lifestyle_summary && Object.keys(reportData.lifestyle_summary).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Lifestyle Patterns</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-blue-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Avg Screen Time</div>
                  <div className="text-3xl font-bold text-blue-700">
                    {reportData.lifestyle_summary.avg_screen_time?.toFixed(1) || 'N/A'}
                    {reportData.lifestyle_summary.avg_screen_time && <span className="text-lg"> hrs</span>}
                  </div>
                </div>
                <div className="bg-purple-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Avg Sleep</div>
                  <div className="text-3xl font-bold text-purple-700">
                    {reportData.lifestyle_summary.avg_sleep_hours?.toFixed(1) || 'N/A'}
                    {reportData.lifestyle_summary.avg_sleep_hours && <span className="text-lg"> hrs</span>}
                  </div>
                </div>
                <div className="bg-green-50 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">Days Logged</div>
                  <div className="text-3xl font-bold text-green-700">
                    {reportData.lifestyle_summary.days_logged}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lens Summary */}
          {reportData.lens_summary && Object.keys(reportData.lens_summary).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Lens Information</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-2">Lens Type & Brand</div>
                  <div className="text-xl font-semibold text-gray-900 capitalize">
                    {reportData.lens_summary.lens_type} - {reportData.lens_summary.lens_brand}
                  </div>
                </div>
                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-2">Days Since Purchase</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {reportData.lens_summary.days_since_purchase} days
                  </div>
                </div>
                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-2">Effectiveness Score</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {reportData.lens_summary.effectiveness_score?.toFixed(1)}%
                  </div>
                </div>
                <div className="p-6 bg-gray-50 rounded-xl">
                  <div className="text-sm text-gray-600 mb-2">Status</div>
                  <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
                    reportData.lens_summary.replacement_recommended
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {reportData.lens_summary.replacement_recommended ? 'Replacement Recommended' : 'In Good Condition'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {reportData.recommendations && reportData.recommendations.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Recommendations</h2>
              
              <div className="space-y-4">
                {reportData.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="ml-4 text-gray-700 leading-relaxed">{recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Reports
