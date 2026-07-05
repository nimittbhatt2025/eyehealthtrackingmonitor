import { useState, useEffect } from 'react'
import { trendAPI, lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts'

function Trends() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('30')
  const [trendData, setTrendData] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [summary, setSummary] = useState(null)
  const [lifestyleData, setLifestyleData] = useState([])
  const [activeTab, setActiveTab] = useState('overview') // overview, correlations, comparisons

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load trend data with proper period parameter
      const trendResponse = await trendAPI.getTrend({ 
        days: parseInt(period),
        period: 'daily' // Force daily grouping to show all data points
      })
      console.log('Trend data loaded:', trendResponse.data)
      setTrendData(trendResponse.data)

      // Load prediction (if enough data)
      try {
        const predictionResponse = await trendAPI.getPrediction()
        console.log(' Prediction data loaded successfully:', predictionResponse.data)
        setPrediction(predictionResponse.data)
      } catch (error) {
        console.error(' Prediction API error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          message: error.message
        })
        // Not enough data for prediction
        setPrediction(null)
      }

      // Load summary
      const summaryResponse = await trendAPI.getSummary({ days: parseInt(period) })
      setSummary(summaryResponse.data)

      // Load lifestyle data for correlations
      try {
        const lifestyleResponse = await lifestyleAPI.getTrends({ days: parseInt(period) })
        console.log(' Lifestyle data loaded:', lifestyleResponse.data)
        setLifestyleData(lifestyleResponse.data.trends || [])
      } catch (error) {
        console.error(' Lifestyle data error:', error.response?.data || error.message)
        setLifestyleData([])
      }
    } catch (error) {
      console.error('Failed to load trends:', error)
      toast.error('Failed to load trend data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
      </div>
    )
  }

  const hasData = trendData?.trend_data && trendData.trend_data.length > 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900">Trends & Predictions</h1>
          <p className="text-gray-600 mt-2 text-lg">Track your vision health over time</p>
        </div>

        {/* Period Selector */}
        <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200">
          {['7', '30', '90'].map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`px-6 py-2 rounded-full font-medium text-sm transition-colors ${
                period === days
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Trend Data Yet</h3>
          <p className="text-gray-600 mb-6">Complete more vision tests to see your health trends</p>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {/* Vision Health */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Vision Health</h3>
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
              </div>
              {trendData.statistics.vision.avg_score !== null ? (
                <>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {trendData.statistics.vision.avg_score.toFixed(1)}%
                  </div>
                  <p className="text-sm text-gray-600">Average Score</p>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Min</span>
                      <span className="font-semibold">{trendData.statistics.vision.min.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max</span>
                      <span className="font-semibold">{trendData.statistics.vision.max.toFixed(1)}%</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-gray-500">No data available</p>
              )}
            </div>

            {/* Test Count */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Tests Completed</h3>
                <div className="w-10 h-10 bg-accent-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {trendData.statistics.vision.test_count}
              </div>
              <p className="text-sm text-gray-600">Last {period} days</p>
            </div>

            {/* Fatigue Level */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Fatigue Status</h3>
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              {trendData.statistics.fatigue.average !== null ? (
                <>
                  <div className="text-3xl font-bold text-gray-900 mb-1">
                    {trendData.statistics.fatigue.average.toFixed(1)}%
                  </div>
                  <p className="text-sm text-gray-600">Average Fatigue</p>
                </>
              ) : (
                <>
                  <div className="text-gray-500">No data</div>
                  <p className="text-sm text-gray-600">Complete webcam analysis</p>
                </>
              )}
            </div>
          </div>

          {/* Vision Score Trend Chart */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Vision Score Trend</h2>
            {trendData.trend_data && trendData.trend_data.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData.trend_data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avg_vision_score"
                    stroke="#a39c85"
                    strokeWidth={3}
                    dot={{ fill: '#a39c85', r: 4 }}
                    name="Vision Score"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <p>No vision test data available for the selected period</p>
              </div>
            )}
          </div>

          {/* Predictions */}
          {prediction ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-gray-900">AI Predictions</h2>
                  <p className="text-gray-600 text-sm mt-1">Based on {prediction.data_points_used} test results</p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  prediction.trend === 'improving'
                    ? 'bg-green-100 text-green-700'
                    : prediction.trend === 'declining'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {prediction.trend === 'improving' ? 'Improving' : prediction.trend === 'declining' ? 'Declining' : 'Stable'} Trend
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="bg-cream-200 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">30 Days Prediction</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {prediction.predictions['30_days'].score.toFixed(1)}%
                  </div>
                  <div className={`text-sm mt-2 font-semibold ${
                    prediction.predictions['30_days'].change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {prediction.predictions['30_days'].change >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(prediction.predictions['30_days'].change).toFixed(1)}% change
                  </div>
                </div>

                <div className="bg-cream-200 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">60 Days Prediction</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {prediction.predictions['60_days'].score.toFixed(1)}%
                  </div>
                  <div className={`text-sm mt-2 font-semibold ${
                    prediction.predictions['60_days'].change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {prediction.predictions['60_days'].change >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(prediction.predictions['60_days'].change).toFixed(1)}% change
                  </div>
                </div>

                <div className="bg-cream-200 rounded-xl p-6">
                  <div className="text-sm text-gray-600 mb-2">90 Days Prediction</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {prediction.predictions['90_days'].score.toFixed(1)}%
                  </div>
                  <div className={`text-sm mt-2 font-semibold ${
                    prediction.predictions['90_days'].change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {prediction.predictions['90_days'].change >= 0 ? '↑ +' : '↓ '}
                    {Math.abs(prediction.predictions['90_days'].change).toFixed(1)}% change
                  </div>
                </div>
              </div>

              {prediction.prescription_change_recommended && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                  <div className="flex items-start">
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-semibold text-orange-900 mb-1">Prescription Review Recommended</h3>
                      <p className="text-orange-700">Based on your declining vision trend, we recommend scheduling an eye exam to review your prescription.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 text-center">
                <div className="inline-flex items-center px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Confidence Score: {(prediction.confidence_score * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-4">AI Predictions</h2>
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Not Enough Data</h3>
                <p className="text-gray-600">Complete at least 10 vision tests to unlock AI-powered predictions</p>
                <p className="text-sm text-gray-500 mt-2">
                  {trendData?.statistics?.vision?.test_count || 0} / 10 tests completed
                </p>
              </div>
            </div>
          )}

          {/* Enhanced Visualizations Tabs */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <h2 className="text-2xl font-serif font-bold text-gray-900 mb-4 md:mb-0">Advanced Analytics</h2>
              <div className="flex space-x-2 bg-[#f3f0e9] rounded-full p-1">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === 'overview'
                      ? 'bg-white text-[#a39c85] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('correlations')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === 'correlations'
                      ? 'bg-white text-[#a39c85] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Correlations
                </button>
                <button
                  onClick={() => setActiveTab('comparisons')}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === 'comparisons'
                      ? 'bg-white text-[#a39c85] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Comparisons
                </button>
              </div>
            </div>

            {/* Overview Tab - Radar Chart */}
            {activeTab === 'overview' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Multi-Metric Health Overview</h3>
                <p className="text-gray-600 mb-6">Comprehensive view of your health metrics normalized on a 0-100 scale</p>
                <ResponsiveContainer width="100%" height={400}>
                  <RadarChart data={(() => {
                    const avgScore = trendData?.statistics?.vision?.avg_score || 0
                    const avgScreenTime = lifestyleData.length > 0
                      ? lifestyleData.reduce((sum, d) => sum + (d.screen_time || 0), 0) / lifestyleData.length
                      : 0
                    const avgSleep = lifestyleData.length > 0
                      ? lifestyleData.reduce((sum, d) => sum + (d.sleep_hours || 0), 0) / lifestyleData.length
                      : 0
                    const avgExercise = lifestyleData.length > 0
                      ? lifestyleData.reduce((sum, d) => sum + (d.exercise_minutes || 0), 0) / lifestyleData.length
                      : 0
                    const avgDiet = lifestyleData.length > 0
                      ? lifestyleData.reduce((sum, d) => sum + (d.diet_quality || 0), 0) / lifestyleData.length
                      : 0
                    
                    return [
                      { metric: 'Vision Health', value: avgScore, fullMark: 100 },
                      { metric: 'Screen Time', value: Math.max(0, 100 - (avgScreenTime / 12) * 100), fullMark: 100 },
                      { metric: 'Sleep Quality', value: (avgSleep / 8) * 100, fullMark: 100 },
                      { metric: 'Exercise', value: (avgExercise / 60) * 100, fullMark: 100 },
                      { metric: 'Diet Quality', value: (avgDiet / 5) * 100, fullMark: 100 }
                    ]
                  })()}>
                    <PolarGrid stroke="#e5e7eb" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
                    <Radar name="Your Health" dataKey="value" stroke="#7dcab9" fill="#7dcab9" fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Correlations Tab - Scatter Plot */}
            {activeTab === 'correlations' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Lifestyle Impact on Vision</h3>
                <p className="text-gray-600 mb-6">Correlation between lifestyle factors and vision health scores</p>
                
                {!lifestyleData || lifestyleData.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p>No lifestyle data available. Start logging your daily habits to see correlations!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Screen Time vs Vision */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Screen Time vs Vision Score</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="screen_time" name="Screen Time (hrs)" tick={{ fontSize: 11 }} stroke="#6b7280" />
                        <YAxis dataKey="vision_score" name="Vision Score" tick={{ fontSize: 11 }} stroke="#6b7280" />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Scatter
                          data={(() => {
                            console.log(' Building screen time correlation:', {
                              lifestyleCount: lifestyleData.length,
                              trendCount: trendData?.trend_data?.length,
                              lifestyleSample: lifestyleData[0],
                              trendSample: trendData?.trend_data?.[0]
                            })
                            
                            const combined = []
                            
                            // Use all vision tests, match to closest lifestyle data
                            if (trendData?.trend_data) {
                              trendData.trend_data.forEach(visionPoint => {
                                if (visionPoint.avg_score) {
                                  // Find lifestyle data within 3 days
                                  const visionDate = new Date(visionPoint.date)
                                  const matchingLifestyle = lifestyleData.find(lifestyle => {
                                    const lifestyleDate = new Date(lifestyle.log_date)
                                    const daysDiff = Math.abs((visionDate - lifestyleDate) / (1000 * 60 * 60 * 24))
                                    return daysDiff <= 3
                                  })
                                  
                                  if (matchingLifestyle && matchingLifestyle.screen_time) {
                                    combined.push({
                                      screen_time: matchingLifestyle.screen_time,
                                      vision_score: visionPoint.avg_score
                                    })
                                  }
                                }
                              })
                            }
                            
                            console.log(' Screen time correlation points:', combined.length)
                            return combined
                          })()}
                          fill="#f59e0b"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Sleep vs Vision */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Sleep vs Vision Score</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="sleep_hours" name="Sleep (hrs)" tick={{ fontSize: 11 }} stroke="#6b7280" />
                        <YAxis dataKey="vision_score" name="Vision Score" tick={{ fontSize: 11 }} stroke="#6b7280" />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Scatter
                          data={(() => {
                            const combined = []
                            
                            // Use all vision tests, match to closest lifestyle data
                            if (trendData?.trend_data) {
                              trendData.trend_data.forEach(visionPoint => {
                                if (visionPoint.avg_score) {
                                  // Find lifestyle data within 3 days
                                  const visionDate = new Date(visionPoint.date)
                                  const matchingLifestyle = lifestyleData.find(lifestyle => {
                                    const lifestyleDate = new Date(lifestyle.log_date)
                                    const daysDiff = Math.abs((visionDate - lifestyleDate) / (1000 * 60 * 60 * 24))
                                    return daysDiff <= 3
                                  })
                                  
                                  if (matchingLifestyle && matchingLifestyle.sleep_hours) {
                                    combined.push({
                                      sleep_hours: matchingLifestyle.sleep_hours,
                                      vision_score: visionPoint.avg_score
                                    })
                                  }
                                }
                              })
                            }
                            
                            console.log(' Sleep correlation points:', combined.length)
                            return combined
                          })()}
                          fill="#7dcab9"
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* Comparisons Tab - Area Charts */}
            {activeTab === 'comparisons' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend Comparisons</h3>
                <p className="text-gray-600 mb-6">Smooth visualization of vision scores and test frequency over time</p>
                <div className="space-y-6">
                  {/* Vision Score Area Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Vision Score Trend</h4>
                    {trendData?.trend_data && trendData.trend_data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={trendData.trend_data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '11px' }} />
                          <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="avg_score"
                            stroke="#7dcab9"
                            fill="#7dcab9"
                            fillOpacity={0.6}
                            name="Vision Score"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-gray-500">
                        <p>No vision test data available</p>
                      </div>
                    )}
                  </div>

                  {/* Test Frequency Area Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Test Activity</h4>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={trendData.trend_data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '11px' }} />
                        <YAxis stroke="#6b7280" style={{ fontSize: '11px' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="vision_test_count"
                          stackId="1"
                          stroke="#7dcab9"
                          fill="#7dcab9"
                          fillOpacity={0.8}
                          name="Vision Tests"
                        />
                        <Area
                          type="monotone"
                          dataKey="fatigue_metric_count"
                          stackId="1"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.8}
                          name="Fatigue Checks"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Type Distribution */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Test Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData.trend_data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="vision_test_count" fill="#7dcab9" name="Vision Tests" />
                <Bar dataKey="fatigue_metric_count" fill="#f59e0b" name="Fatigue Checks" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

export default Trends
