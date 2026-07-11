import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { visionTestAPI } from '../services/api'

function VisionTests() {
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

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
      type: 'visual_acuity',
      title: 'Clear Vision Test',
      subtitle: 'How clearly you can see (Visual Acuity)',
      description: 'A letter chart test, like the one at the eye doctor. See how clearly you can read letters from far away. Each eye is checked on its own.',
      duration: '3-4 minutes',
      features: ['Clear-vision score', '20/20 style result', 'Each eye checked', 'Left vs right compare'],
      badge: 'Doctor-style'
    },
    {
      type: 'color_vision',
      title: 'Color Vision Test',
      subtitle: 'How well you tell colors apart',
      description: 'Find the hidden number in a circle of colored dots. This checks how well you see colors, especially telling red and green apart.',
      duration: '2-3 minutes',
      features: ['Red-green check', 'Color strength', '10 picture cards'],
      badge: 'Popular'
    },
    {
      type: 'amsler_grid',
      title: 'Straight-Line Test',
      subtitle: 'Check the center of your vision (Amsler grid)',
      description: 'Look at a grid of straight lines and tell us if any look wavy, blurry, or missing. This checks the middle of your vision. Quick and important.',
      duration: '2-3 minutes',
      features: ['Wavy-line check', 'Each eye checked', 'Center-vision check'],
      badge: 'Important'
    },
    {
      type: 'contrast_sensitivity',
      title: 'Faint Shapes Test',
      subtitle: 'Seeing in dim light (Contrast)',
      description: 'Spot shapes that are only a little different from the background. This shows how well you see in low light or fog — often the first thing to change.',
      duration: '3-4 minutes',
      features: ['Low-light vision', 'Early change detection', 'Adjusts to you'],
      badge: 'Advanced'
    },
    {
      type: 'glaucoma_neural',
      title: 'Side Vision Test',
      subtitle: 'The edges of what you see (Glaucoma screen)',
      description: 'Look straight ahead and notice faint dots near the center and edges of your view. This checks your side vision, which can change slowly and quietly over time.',
      duration: '4-5 minutes',
      features: ['Side-vision check', 'Early warning', 'Sensitivity map'],
      badge: 'Doctor-style'
    },
    {
      type: 'cataract_glare',
      title: 'Glare Sensitivity Test',
      subtitle: 'How much bright light bothers you',
      description: 'See how bright light and glare affect your vision. Cloudy lenses can scatter light and make it harder to see clearly.',
      duration: '4-5 minutes',
      features: ['Glare check', 'Light-scatter check', 'Everyday vision'],
      badge: 'Doctor-style'
    },
    {
      type: 'dry_eye',
      title: 'Dry Eye Screening',
      subtitle: 'Photo check for dryness signs',
      description: 'Take a well-lit photo of your eyes. We check redness and how smooth your tear film looks on the eye surface. Quick screening — not a diagnosis.',
      duration: '3-4 minutes',
      features: ['Symptom questionnaire', 'Redness check', 'Tear film check'],
      badge: 'New',
      webcam: true
    },
    {
      type: 'red_reflex',
      title: 'Eye Glow Test',
      subtitle: 'The glow from the back of your eye (Red reflex)',
      description: 'Uses your camera to look at the glow from the back of your eyes — like the red-eye you see in photos. A healthy, even glow is a good sign.',
      duration: '3-4 minutes',
      features: ['Back-of-eye check', 'Left vs right compare', 'Cloudiness check'],
      badge: 'Advanced'
    },
    {
      type: 'accommodative_lag',
      title: 'Eye Tiredness Meter',
      subtitle: 'Strain from screens and close-up work',
      description: 'Measures how tired your eyes get from close-up screen time and tells you when to take a break — before headaches start.',
      duration: '30 seconds',
      features: ['Eye-strain score', 'Tiredness check', 'Break reminders'],
      badge: 'New',
      webcam: true
    },
    {
      type: 'peripheral_awareness',
      title: 'Side Vision Game',
      subtitle: 'A fun way to test side vision',
      description: 'A quick tap game: keep your eyes on the center and tap the targets that pop up around the edges. Checks your side vision and reaction speed. Fun for all ages.',
      duration: '60 seconds',
      features: ['Side-vision check', 'Reaction speed', 'Camera-guided'],
      badge: 'Game',
      webcam: true
    },
    {
      type: 'ocular_ergonomics',
      title: 'Posture & Lighting Check',
      subtitle: 'Your screen setup and room light',
      description: 'Uses your camera to check your room lighting, how far you sit from the screen, and your posture — then gives live tips to keep your eyes comfortable.',
      duration: 'Continuous',
      features: ['Glare check', 'Distance check', 'Live tips'],
      badge: 'Monitor',
      webcam: true
    }
  ]

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="page-title">Vision Tests</h1>
        <p className="page-subtitle">Choose a test to monitor your vision health</p>
      </div>

      {/* Test Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {testTypes.map(test => (
          <div
            key={test.type}
            className="group bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 md:p-7 hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-300 flex flex-col"
          >
            {/* Header with Icon and Badges */}
            <div className="flex items-start justify-between mb-4">
              <div className="icon-tile bg-accent-50 text-accent-600 group-hover:bg-accent-100 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {test.webcam && (
                  <span className="badge badge-neutral">Webcam</span>
                )}
                {test.badge && (
                  <span className="badge badge-brand">{test.badge}</span>
                )}
              </div>
            </div>

            {/* Title and Subtitle */}
            <h3 className="text-xl font-serif font-bold text-gray-900 mb-1">{test.title}</h3>
            <p className="text-sm text-gray-400 mb-3">{test.subtitle}</p>

            {/* Description */}
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">{test.description}</p>

            {/* Duration */}
            <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {test.duration}
            </div>

            {/* Related Features */}
            <div className="mb-6">
              <div className="flex flex-wrap gap-2">
                {test.features.map((feature, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-gray-50 text-gray-600 text-xs font-medium rounded-full ring-1 ring-gray-100"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            {/* Start Test Button */}
            <Link
              to={test.type === 'tracking' ? '/eye-tracking-analysis' : `/vision-tests/${test.type}`}
              className="btn-primary w-full mt-auto min-h-[44px]"
            >
              Start Test
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        ))}
      </div>

      {/* Test History */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-4 md:p-7 animate-fade-in-up">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="section-title">Recent Tests</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600"></div>
          </div>
        ) : tests.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Test Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Score</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map(test => (
                    <tr
                      key={test.id}
                      onClick={() => navigate(`/test-details/${test.id}`)}
                      className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 capitalize text-sm font-medium text-gray-800">{test.test_type.replace(/_/g, ' ')}</td>
                      <td className="py-3.5 px-4 font-bold text-accent-700 text-sm">{test.score}%</td>
                      <td className="py-3.5 px-4 text-gray-500 text-sm hidden sm:table-cell">
                        {new Date(test.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`badge ${
                          test.score >= 80 ? 'badge-success' :
                          test.score >= 60 ? 'badge-warning' :
                          'badge-danger'
                        }`}>
                          {test.score >= 80 ? 'Good' : test.score >= 60 ? 'Fair' : 'Needs Attention'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tests yet</h3>
            <p className="text-gray-500 mb-6 px-4">Take your first vision test to start tracking your eye health</p>
            <Link
              to={`/vision-tests/${testTypes[0].type}`}
              className="btn-primary"
            >
              Take Your First Test
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default VisionTests
