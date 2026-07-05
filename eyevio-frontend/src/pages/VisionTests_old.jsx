import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

function VisionTests() {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTests()
  }, [])

  const loadTests = async () => {
    try {
      const response = await visionTestAPI.getAll({ limit: 10 })
      setTests(response.data.tests || [])
    } catch (error) {
      console.error('Failed to load tests:', error)
    } finally {
      setLoading(false)
    }
  }

  const testTypes = [
    {
      type: 'acuity',
      title: 'Visual Acuity',
      description: 'Test your ability to see details at various distances using the Snellen chart',
      icon: '',
      duration: '5 min',
      color: 'from-blue-500 to-blue-600'
    },
    {
      type: 'contrast',
      title: 'Contrast Sensitivity',
      description: 'Measure your ability to distinguish between different shades of gray',
      icon: '🌓',
      duration: '3 min',
      color: 'from-purple-500 to-purple-600'
    },
    {
      type: 'color',
      title: 'Color Vision',
      description: 'Check for color blindness and color perception accuracy',
      icon: '',
      duration: '4 min',
      color: 'from-green-500 to-green-600'
    }
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Vision Tests</h1>
        <p className="text-gray-600 mt-2">Choose a test to monitor your vision health</p>
      </div>

      {/* Test Type Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {testTypes.map(test => (
          <Link
            key={test.type}
            to={`/vision-tests/${test.type}`}
            className="group"
          >
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 hover:-translate-y-1">
              {/* Icon */}
              <div className={`w-16 h-16 bg-gradient-to-br ${test.color} rounded-lg flex items-center justify-center text-3xl mb-4 group-hover:scale-110 transition-transform`}>
                {test.icon}
              </div>
              
              {/* Content */}
              <h3 className="text-xl font-bold text-gray-900 mb-2">{test.title}</h3>
              <p className="text-gray-600 text-sm mb-4">{test.description}</p>
              
              {/* Duration */}
              <div className="flex items-center text-sm text-gray-500">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {test.duration}
              </div>

              {/* CTA */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className="text-blue-600 font-semibold group-hover:text-blue-700">
                  Start Test →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Test History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Recent Tests</h2>
          {tests.length > 0 && (
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="text-gray-600 mt-2">Loading tests...</p>
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tests yet</h3>
            <p className="text-gray-600 mb-4">Start your first vision test to track your eye health</p>
            <Link
              to="/vision-tests/acuity"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Take Your First Test
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Test Type</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {tests.map(test => (
                  <tr key={test.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">
                          {testTypes.find(t => t.type === test.test_type)?.icon || ''}
                        </span>
                        <div>
                          <div className="font-medium text-gray-900">
                            {testTypes.find(t => t.type === test.test_type)?.title || test.test_type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {new Date(test.timestamp).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className="text-2xl font-bold text-gray-900 mr-2">{test.score}</div>
                        <div className="text-sm text-gray-500">/100</div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        test.score >= 80 ? 'bg-green-100 text-green-800' :
                        test.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {test.score >= 80 ? '✓ Good' : test.score >= 60 ? ' Fair' : '✗ Needs Attention'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionTests
