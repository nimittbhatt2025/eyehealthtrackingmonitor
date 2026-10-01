import { useState, useEffect } from 'react'
import { reportsAPI, authAPI, triggerPdfDownload } from '../services/api'
import { toast } from 'react-hot-toast'
import SamdDisclaimer from '../components/SamdDisclaimer'
import { DISPLAY_INDEX_LABEL } from '../utils/displayIndex'

function Reports() {
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState('90')
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
      triggerPdfDownload(
        response.data,
        `eyevio-report-${selectedPeriod}days-${new Date().toISOString().split('T')[0]}.pdf`
      )
      toast.success('Report downloaded successfully!')
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      toast.error('Failed to generate PDF report')
    } finally {
      setGenerating(false)
    }
  }

  const downloadClinicianPDF = async () => {
    setGenerating(true)
    try {
      const response = await reportsAPI.clinician({ days: parseInt(selectedPeriod) })
      triggerPdfDownload(
        response.data,
        `eyevio-clinician-${selectedPeriod}d-${new Date().toISOString().split('T')[0]}.pdf`
      )
      toast.success('Clinician one-pager downloaded')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to generate clinician PDF')
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Health Reports</h1>
          <p className="page-subtitle">Share a one-page snapshot with an optometrist, or download the longer summary</p>
          <SamdDisclaimer className="mt-3 max-w-2xl" />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={downloadClinicianPDF}
            disabled={generating}
            className="btn-primary min-h-[44px]"
          >
            {generating ? 'Generating…' : 'Clinician one-pager'}
          </button>
          <button
            onClick={downloadPDF}
            disabled={generating || !reportData}
            className="btn-ghost min-h-[44px]"
          >
            Longer PDF
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 max-w-2xl">
        The clinician one-pager is a single page: the latest measurement from each test in its own unit, an
        acuity sparkline, and up to five automated notes. It is a research prototype output, not a clinical
        report. Use the window below; 90 days is typical for an appointment packet.
      </p>

      {/* Period Selector */}
      <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200 w-fit">
        {['7', '30', '90', '180'].map((days) => (
          <button
            key={days}
            onClick={() => setSelectedPeriod(days)}
            className={`min-h-[44px] px-6 py-3 rounded-full font-semibold text-sm transition-colors ${
              selectedPeriod === days
                ? 'bg-accent-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {days} Days
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600"></div>
        </div>
      ) : !reportData ? (
        <div className="card p-12 text-center">
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
          <div className="card p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="section-title">Report Summary</h2>
              <div className="text-sm text-gray-500">
                {formatDate(reportData.report_period.start_date)} - {formatDate(reportData.report_period.end_date)}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="bg-cream-100 rounded-xl p-6 border border-gray-100/80">
                <div className="text-sm text-gray-500 mb-2">Patient Name</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.user.name}</div>
              </div>
              <div className="bg-cream-100 rounded-xl p-6 border border-gray-100/80">
                <div className="text-sm text-gray-500 mb-2">Age</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.user.age || 'N/A'}</div>
              </div>
              <div className="bg-cream-100 rounded-xl p-6 border border-gray-100/80">
                <div className="text-sm text-gray-500 mb-2">Lens Type</div>
                <div className="text-lg font-semibold text-gray-900 capitalize">
                  {reportData.user.lens_type || 'None'}
                </div>
              </div>
              <div className="bg-cream-100 rounded-xl p-6 border border-gray-100/80">
                <div className="text-sm text-gray-500 mb-2">Report Period</div>
                <div className="text-lg font-semibold text-gray-900">{reportData.report_period.days} Days</div>
              </div>
            </div>
          </div>

          {/* Vision Summary */}
          {reportData.vision_summary && Object.keys(reportData.vision_summary).length > 0 && (
            <div className="card p-8">
              <h2 className="section-title mb-2">Vision checks</h2>
              <p className="text-sm text-gray-500 mb-6">
                {reportData.vision_summary.total_tests} tests in this period. {reportData.vision_summary.note}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-4 font-medium">Test</th>
                      <th className="py-2 pr-4 font-medium">Latest measurement</th>
                      <th className="py-2 pr-4 font-medium">Right eye</th>
                      <th className="py-2 pr-4 font-medium">Left eye</th>
                      <th className="py-2 font-medium">Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.vision_summary.by_test || []).map((row) => (
                      <tr key={row.test_type} className="border-b border-gray-50">
                        <td className="py-2 pr-4 text-gray-900">{row.label}</td>
                        <td className="py-2 pr-4 font-semibold text-gray-900">{row.measure}</td>
                        <td className="py-2 pr-4 text-gray-700">{row.od}</td>
                        <td className="py-2 pr-4 text-gray-700">{row.os}</td>
                        <td className="py-2 text-gray-700">{row.sessions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fatigue Summary */}
          {reportData.fatigue_summary && Object.keys(reportData.fatigue_summary).length > 0 && (
            <div className="card p-8">
              <h2 className="section-title mb-6">Webcam blink sessions</h2>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-accent-50 rounded-xl p-6 border border-accent-100">
                  <div className="text-sm text-gray-500 mb-2">Avg Blink Rate</div>
                  <div className="text-3xl font-bold text-accent-700">
                    {reportData.fatigue_summary.average_blink_rate?.toFixed(0) || 'N/A'}
                    {reportData.fatigue_summary.average_blink_rate && <span className="text-lg">/min</span>}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <div className="text-sm text-gray-500 mb-2">Sessions</div>
                  <div className="text-3xl font-bold text-gray-900">{reportData.fatigue_summary.total_metrics}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                  <div className="text-sm text-gray-500 mb-2">Fatigue index</div>
                  <div className="text-xl font-semibold text-gray-700">
                    {reportData.fatigue_summary.average_fatigue?.toFixed(0)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{DISPLAY_INDEX_LABEL}</div>
                </div>
              </div>
            </div>
          )}

          {/* Lifestyle Summary */}
          {reportData.lifestyle_summary && Object.keys(reportData.lifestyle_summary).length > 0 && (
            <div className="card p-8">
              <h2 className="section-title mb-6">Lifestyle Patterns</h2>
              
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-accent-50 rounded-xl p-6 border border-accent-100">
                  <div className="text-sm text-gray-500 mb-2">Avg Screen Time</div>
                  <div className="text-3xl font-bold text-accent-700">
                    {reportData.lifestyle_summary.avg_screen_time?.toFixed(1) || 'N/A'}
                    {reportData.lifestyle_summary.avg_screen_time && <span className="text-lg"> hrs</span>}
                  </div>
                </div>
                <div className="bg-accent-50 rounded-xl p-6 border border-accent-100">
                  <div className="text-sm text-gray-500 mb-2">Avg Sleep</div>
                  <div className="text-3xl font-bold text-accent-700">
                    {reportData.lifestyle_summary.avg_sleep_hours?.toFixed(1) || 'N/A'}
                    {reportData.lifestyle_summary.avg_sleep_hours && <span className="text-lg"> hrs</span>}
                  </div>
                </div>
                <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                  <div className="text-sm text-gray-500 mb-2">Days Logged</div>
                  <div className="text-3xl font-bold text-green-700">
                    {reportData.lifestyle_summary.days_logged}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lens Summary */}
          {reportData.lens_summary && Object.keys(reportData.lens_summary).length > 0 && (
            <div className="card p-8">
              <h2 className="section-title mb-6">Lens Information</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-6 bg-gray-50 rounded-xl border border-gray-100/80">
                  <div className="text-sm text-gray-500 mb-2">Lens Type & Brand</div>
                  <div className="text-xl font-semibold text-gray-900 capitalize">
                    {reportData.lens_summary.lens_type} - {reportData.lens_summary.lens_brand}
                  </div>
                </div>
                <div className="p-6 bg-gray-50 rounded-xl border border-gray-100/80">
                  <div className="text-sm text-gray-500 mb-2">Days Since Purchase</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {reportData.lens_summary.days_since_purchase} days
                  </div>
                </div>
                <div className="p-6 bg-gray-50 rounded-xl border border-gray-100/80">
                  <div className="text-sm text-gray-500 mb-2">Effectiveness index</div>
                  <div className="text-xl font-semibold text-gray-900">
                    {reportData.lens_summary.effectiveness_score?.toFixed(0) ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{DISPLAY_INDEX_LABEL}</div>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {reportData.recommendations && reportData.recommendations.length > 0 && (
            <div className="card p-8">
              <h2 className="section-title mb-6">Recommendations</h2>
              
              <div className="space-y-4">
                {reportData.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="icon-tile bg-amber-100 text-amber-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
