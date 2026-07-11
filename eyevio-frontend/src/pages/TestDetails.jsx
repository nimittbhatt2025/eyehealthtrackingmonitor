import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { visionTestAPI } from '../services/api'
import { toast } from 'react-hot-toast'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts'

function DryEyeTestDetails({ testData, comparisonTests, navigate }) {
  const details = testData.test_details || {}
  const testDate = testData.created_at || testData.test_date

  const riskBadge = (level) => {
    const map = {
      low: { label: 'Low signs', className: 'badge-success' },
      moderate: { label: 'Mild signs', className: 'badge-warning' },
      elevated: { label: 'Higher signs', className: 'badge-danger' },
    }
    return map[level] || map.moderate
  }

  const comparisonData = comparisonTests
    .filter((t) => t.test_type === 'dry_eye')
    .slice(0, 5)
    .reverse()
    .map((t) => ({
      date: new Date(t.created_at || t.test_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: t.score,
    }))

  const badge = riskBadge(details.risk_level)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <button
            onClick={() => navigate('/vision-tests')}
            className="text-gray-600 hover:text-gray-900 mb-2 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Vision Tests</span>
          </button>
          <h1 className="page-title">Dry Eye Screening</h1>
          <p className="page-subtitle">
            {testDate && new Date(testDate).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <div className="text-center">
          <div className="text-5xl font-bold text-gray-900">{testData.score}</div>
          <div className="text-sm text-gray-500">Combined score</div>
          <span className={`inline-flex mt-2 ${badge.className}`}>{badge.label}</span>
        </div>
      </div>

      {details.risk_message && (
        <div className="card p-6 bg-accent-50 border border-accent-100">
          <p className="text-accent-900">{details.risk_message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6 text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Symptoms (OSDI-lite)</h3>
          <div className="text-4xl font-bold text-accent-700">{details.symptom_score ?? '—'}</div>
          <p className="text-sm text-gray-500 mt-1">
            {details.symptom_severity_label || 'Symptom health score'}
            {details.osdi_score != null && ` · OSDI ${details.osdi_score}/100`}
          </p>
        </div>
        <div className="card p-6 text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Photo analysis</h3>
          <div className="text-4xl font-bold text-accent-700">{details.cv_score ?? '—'}</div>
          <p className="text-sm text-gray-500 mt-1">Redness & tear film surface</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {details.left_eye && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Left eye</h3>
            <div className="text-3xl font-bold text-accent-700 mb-3">{details.left_eye.health_score}</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Redness</dt><dd>{details.left_eye.sclera_redness}%</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Tear film</dt><dd>{details.left_eye.tear_film_quality}%</dd></div>
            </dl>
          </div>
        )}
        {details.right_eye && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Right eye</h3>
            <div className="text-3xl font-bold text-accent-700 mb-3">{details.right_eye.health_score}</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Redness</dt><dd>{details.right_eye.sclera_redness}%</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Tear film</dt><dd>{details.right_eye.tear_film_quality}%</dd></div>
            </dl>
          </div>
        )}
      </div>

      {details.symptom_responses?.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xl font-serif font-bold text-gray-900 mb-4">Symptom responses</h2>
          <ul className="space-y-2">
            {details.symptom_responses.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 text-sm text-gray-700 border-b border-gray-50 pb-2">
                <span>{r.question}</span>
                <span className="font-medium text-gray-900 shrink-0">{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.findings?.length > 0 && (
        <div className="card p-6">
          <h2 className="text-xl font-serif font-bold text-gray-900 mb-4">Photo findings</h2>
          <ul className="space-y-2">
            {details.findings.map((f, i) => (
              <li key={i} className="text-sm text-gray-700">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      {comparisonData.length > 1 && (
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Progress Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#7dcab9" strokeWidth={2} name="Combined score" dot={{ fill: '#7dcab9', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {details.disclaimer && (
        <p className="text-xs text-gray-500">{details.disclaimer}</p>
      )}

      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <Link to="/vision-tests" className="text-gray-600 hover:text-gray-900 font-medium">
          View All Tests
        </Link>
        <Link
          to="/vision-tests/dry_eye"
          className="bg-brand-gradient text-white font-semibold px-8 py-3 rounded-xl hover:shadow-glow transition-all"
        >
          Retake Test
        </Link>
      </div>
    </div>
  )
}

function TestDetails() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [testData, setTestData] = useState(null)
  const [comparisonTests, setComparisonTests] = useState([])

  useEffect(() => {
    loadTestDetails()
    loadComparisonData()
  }, [testId])

  const loadTestDetails = async () => {
    try {
      const response = await visionTestAPI.getTestById(testId)
      setTestData(response.data)
    } catch (error) {
      console.error('Failed to load test details:', error)
      toast.error('Failed to load test details')
      navigate('/vision-tests')
    } finally {
      setLoading(false)
    }
  }

  const loadComparisonData = async () => {
    try {
      // Get last 5 tests of same type for comparison
      const response = await visionTestAPI.getHistory({ limit: 5 })
      setComparisonTests(response.data.tests || [])
    } catch (error) {
      console.error('Failed to load comparison data:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#7dcab9]/20 border-t-[#7dcab9]"></div>
      </div>
    )
  }

  if (!testData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Test not found</p>
        <Link to="/vision-tests" className="text-[#7dcab9] hover:underline mt-4 inline-block">
          Back to Vision Tests
        </Link>
      </div>
    )
  }

  if (testData.test_type === 'dry_eye') {
    return <DryEyeTestDetails testData={testData} comparisonTests={comparisonTests} navigate={navigate} />
  }

  const testDate = testData.created_at || testData.test_date

  // Calculate per-question performance
  const questionPerformance = testData.question_details || []
  const lineAnalysis = questionPerformance.reduce((acc, q) => {
    const line = q.line_number || q.question_number
    if (!acc[line]) {
      acc[line] = { correct: 0, total: 0 }
    }
    acc[line].total++
    if (q.is_correct) acc[line].correct++
    return acc
  }, {})

  const lineChartData = Object.entries(lineAnalysis).map(([line, data]) => ({
    line: `Line ${line}`,
    accuracy: (data.correct / data.total) * 100,
    correct: data.correct,
    total: data.total
  }))

  // Response time analysis
  const responseTimeData = questionPerformance.map((q, index) => ({
    question: index + 1,
    responseTime: q.response_time || 0,
    correct: q.is_correct
  }))

  // Comparison with previous tests
  const comparisonData = comparisonTests
    .filter(t => t.test_type === testData.test_type)
    .slice(0, 5)
    .reverse()
    .map(t => ({
      date: new Date(t.test_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: t.score,
      accuracy: t.accuracy
    }))

  // Performance radar
  const radarData = [
    { metric: 'Score', value: testData.score, fullMark: 100 },
    { metric: 'Accuracy', value: testData.accuracy, fullMark: 100 },
    { metric: 'Speed', value: Math.min(100, (1 / (testData.avg_response_time || 1)) * 50), fullMark: 100 },
    { metric: 'Consistency', value: Math.min(100, 100 - (Math.max(0, testData.avg_response_time - 2) * 10)), fullMark: 100 },
    { metric: 'Focus', value: testData.correct_answers / testData.total_questions * 100, fullMark: 100 }
  ]

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 75) return 'text-blue-600 bg-blue-50 border-blue-200'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  // Text label so the score isn't judged by color alone
  const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent'
    if (score >= 75) return 'Good'
    if (score >= 60) return 'Fair'
    return 'Needs attention'
  }

  const getPerformanceInsight = () => {
    if (testData.score >= 90) return { 
      icon: '✓', 
      title: 'Excellent Performance', 
      message: 'Your vision is performing exceptionally well!',
      color: 'green'
    }
    if (testData.score >= 75) return { 
      icon: '✓', 
      title: 'Good Performance', 
      message: 'Your vision is within normal range.',
      color: 'blue'
    }
    if (testData.score >= 60) return { 
      icon: '!', 
      title: 'Fair Performance', 
      message: 'Consider scheduling an eye exam if this persists.',
      color: 'yellow'
    }
    return { 
      icon: '!', 
      title: 'Needs Attention', 
      message: 'We recommend consulting with an eye care professional.',
      color: 'red'
    }
  }

  const insight = getPerformanceInsight()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/vision-tests')}
            className="text-gray-600 hover:text-gray-900 mb-2 flex items-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Vision Tests</span>
          </button>
          <h1 className="page-title">Test Details</h1>
          <p className="page-subtitle">
            {testData.test_type.replace('_', ' ').toUpperCase()} - {testDate && new Date(testDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        </div>
        <div className={`${getScoreColor(testData.score)} px-8 py-4 rounded-2xl border-2 text-center`}>
          <div className="text-5xl font-bold leading-none">{testData.score}</div>
          <div className="text-sm font-semibold mt-1">{getScoreLabel(testData.score)}</div>
        </div>
      </div>

      {/* Performance Insight */}
      <div className={`bg-${insight.color}-50 border-2 border-${insight.color}-200 rounded-2xl p-6`}>
        <div className="flex items-start space-x-4">
          <div className="text-4xl">{insight.icon}</div>
          <div className="flex-1">
            <h3 className={`text-xl font-semibold text-${insight.color}-900 mb-1`}>{insight.title}</h3>
            <p className={`text-${insight.color}-700`}>{insight.message}</p>
          </div>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Accuracy</span>
            <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-gray-900">{testData.accuracy}%</div>
          <div className="text-sm text-gray-500 mt-1">
            {testData.correct_answers} / {testData.total_questions} correct
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Avg Response Time</span>
            <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-gray-900">{testData.avg_response_time?.toFixed(1)}s</div>
          <div className="text-sm text-gray-500 mt-1">Per question</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Total Time</span>
            <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {Math.floor(testData.time_taken_seconds / 60)}:{(testData.time_taken_seconds % 60).toString().padStart(2, '0')}
          </div>
          <div className="text-sm text-gray-500 mt-1">minutes</div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-600 text-sm">Test Type</span>
            <svg className="w-5 h-5 text-[#7dcab9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="text-xl font-bold text-gray-900 capitalize">
            {testData.test_type.replace('_', ' ')}
          </div>
          <div className="text-sm text-gray-500 mt-1">{testData.total_questions} questions</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Radar */}
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Performance Profile</h2>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <Radar name="Performance" dataKey="value" stroke="#7dcab9" fill="#7dcab9" fillOpacity={0.6} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Line-by-Line Accuracy */}
        {lineChartData.length > 0 && (
          <div className="card p-8">
            <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Line-by-Line Performance</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={lineChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="line" stroke="#6b7280" style={{ fontSize: '12px' }} />
                <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  formatter={(value) => `${value.toFixed(0)}%`}
                />
                <Bar dataKey="accuracy" fill="#7dcab9" name="Accuracy %" />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-sm text-gray-600 mt-4">
              Shows which lines were easiest and hardest for you to read
            </p>
          </div>
        )}
      </div>

      {/* Response Time Analysis */}
      {responseTimeData.length > 0 && (
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Response Time Pattern</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={responseTimeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="question" stroke="#6b7280" style={{ fontSize: '12px' }} label={{ value: 'Question Number', position: 'insideBottom', offset: -5 }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} label={{ value: 'Seconds', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="responseTime" 
                stroke="#7dcab9" 
                strokeWidth={2}
                dot={{ fill: '#7dcab9', r: 4 }}
                name="Response Time (s)"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-sm text-gray-600 mt-4">
            Tracks how quickly you responded to each question throughout the test
          </p>
        </div>
      )}

      {/* Historical Comparison */}
      {comparisonData.length > 1 && (
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Progress Over Time</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" stroke="#6b7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#7dcab9" strokeWidth={2} name="Score" dot={{ fill: '#7dcab9', r: 5 }} />
              <Line type="monotone" dataKey="accuracy" stroke="#a39c85" strokeWidth={2} name="Accuracy %" dot={{ fill: '#a39c85', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-sm text-gray-600 mt-4">
            Compare this test with your previous {comparisonData.length - 1} {testData.test_type.replace('_', ' ')} tests
          </p>
        </div>
      )}

      {/* Question Details */}
      {questionPerformance.length > 0 && (
        <div className="card p-8">
          <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6">Question-by-Question Breakdown</h2>
          <div className="space-y-3">
            {questionPerformance.map((q, index) => (
              <div 
                key={index} 
                className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                  q.is_correct 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                    q.is_correct ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {q.question_text || `Question ${index + 1}`}
                    </div>
                    <div className="text-sm text-gray-600">
                      Your answer: <span className="font-medium">{q.user_answer}</span>
                      {!q.is_correct && q.correct_answer && (
                        <span> • Correct: <span className="font-medium text-green-600">{q.correct_answer}</span></span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  {q.response_time?.toFixed(1)}s
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <Link
          to="/vision-tests"
          className="text-gray-600 hover:text-gray-900 font-medium"
        >
          View All Tests
        </Link>
        <Link
          to={`/vision-tests/${testData.test_type}`}
          className="bg-brand-gradient text-white font-semibold px-8 py-3 rounded-xl hover:shadow-glow transition-all"
        >
          Retake Test
        </Link>
      </div>
    </div>
  )
}

export default TestDetails
