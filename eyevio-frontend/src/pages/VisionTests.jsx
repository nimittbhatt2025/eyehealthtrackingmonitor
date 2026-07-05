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
      title: 'Visual Acuity Test',
      subtitle: 'LogMAR & Snellen Scoring',
      description: 'Professional eye chart test measuring how clearly you see. Tests each eye separately with randomized letters. Get your 20/20 vision score with clinical LogMAR precision.',
      duration: '3-4 minutes',
      features: ['LogMAR Scoring', 'Snellen Conversion', 'Monocular Testing', 'Asymmetry Detection'],
      badge: 'Clinical Grade'
    },
    {
      type: 'color_vision',
      title: 'Color Vision Test',
      subtitle: 'Ishihara-Inspired Screening',
      description: 'Detect red-green color deficiencies using Ishihara-inspired pseudoisochromatic plates. Identifies Protan (red) and Deutan (green) deficiencies with severity classification.',
      duration: '2-3 minutes',
      features: ['Protan Detection', 'Deutan Detection', 'Severity Classification', '10 Test Plates'],
      badge: 'Professional'
    },
    {
      type: 'amsler_grid',
      title: 'Amsler Grid Test',
      subtitle: 'Macular Health Screening',
      description: 'Critical screening for macular degeneration and central vision distortion. Stare at the red dot and mark any wavy lines or blind spots. Early detection saves vision!',
      duration: '2-3 minutes',
      features: ['Distortion Mapping', 'Monocular Testing', 'AMD Screening', 'Interactive Marking'],
      badge: 'Safety Critical'
    },
    {
      type: 'contrast_sensitivity',
      title: 'Contrast Sensitivity Test',
      subtitle: 'Functional Vision',
      description: 'Pelli-Robson style assessment. Tests your ability to see in low-contrast conditions - often the first thing to decline.',
      duration: '3-4 minutes',
      features: ['Early Disease Detection', 'Functional Vision Assessment', 'Adaptive Testing'],
      badge: 'Advanced'
    },
    {
      type: 'glaucoma_neural',
      title: 'Peripheral Field Screen',
      subtitle: 'Glaucoma & Neural Health',
      description: 'Detects peripheral vision loss and arcuate scotomas using low-contrast testing. Catches neural damage YEARS before tunnel vision appears.',
      duration: '4-5 minutes',
      features: ['Early Glaucoma Detection', 'Paracentral Testing', 'Neural Sensitivity Analysis'],
      badge: 'Clinical Grade'
    },
    {
      type: 'cataract_glare',
      title: 'Glare Sensitivity Assessment',
      subtitle: 'Lens Clarity & Light Scatter',
      description: 'Sine-wave grating test with glare simulation. Detects lens clouding by measuring light scatter - catches cataracts before slit-lamp exam.',
      duration: '4-5 minutes',
      features: ['Glare Sensitivity', 'Light Scatter Detection', 'Functional Vision'],
      badge: 'Clinical Grade'
    },
    {
      type: 'red_reflex',
      title: 'Red Glow Analyzer',
      subtitle: 'Digital Bruckner Test',
      description: 'Smartphone ophthalmoscope analyzing red reflex from your retina. Detects cataracts, leukocoria, and refractive errors. Quantitative "Reflex Integrity Score" in minutes.',
      duration: '3-4 minutes',
      features: ['Retinal Health Screening', 'Symmetry Analysis', 'Opacity Detection'],
      badge: 'Advanced'
    },
    {
      type: 'accommodative_lag',
      title: 'Eye Burnout Meter',
      subtitle: 'Near-Work Stress Tracker',
      description: 'Measures ciliary muscle fatigue from screen time by tracking pupillary miosis. Get your "focusing capacity" score and personalized break recommendations before headaches start.',
      duration: '30 seconds',
      features: ['Pupil Tracking', 'Fatigue Prediction', 'Break Timer Recommendations'],
      badge: 'New',
      webcam: true
    },
    {
      type: 'peripheral_awareness',
      title: 'Peripheral Vision Trainer',
      subtitle: 'Visual Field Assessment',
      description: 'Gamified "Whack-a-Mole" test that checks peripheral vision while ensuring eyes stay centered. Detects field deficits from glaucoma. Perfect for elderly (fall prevention) and athletes (reaction time).',
      duration: '60 seconds',
      features: ['Field Deficit Detection', 'Reaction Time', 'Eye Tracking Validation'],
      badge: 'Gamified',
      webcam: true
    },
    {
      type: 'ocular_ergonomics',
      title: 'Ocular Ergonomics AI',
      subtitle: 'Posture & Lighting Monitor',
      description: 'Real-time ambient monitoring of screen-to-room glare, viewing distance, and posture. Prevents myopia progression with live alerts when conditions become harmful to your eyes.',
      duration: 'Continuous',
      features: ['Glare Detection', 'Distance Tracking', 'Real-Time Alerts'],
      badge: 'Monitor',
      webcam: true
    }
  ]

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl md:text-4xl font-serif font-bold text-gray-900">Vision Tests</h1>
        <p className="text-sm md:text-base text-gray-600 mt-2 md:text-lg">Choose a test to monitor your vision health</p>
      </div>

      {/* Test Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {testTypes.map(test => (
          <div
            key={test.type}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8 hover:shadow-md transition-shadow"
          >
            {/* Header with Icon and Webcam Badge */}
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              {test.webcam && (
                <span className="px-2 md:px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full border border-gray-300">
                  Webcam Required
                </span>
              )}
              {test.badge && (
                <span className="px-2 md:px-3 py-1 bg-gradient-to-r from-primary-500 to-blue-600 text-white text-xs font-medium rounded-full shadow-sm">
                  {test.badge}
                </span>
              )}
            </div>

            {/* Title and Subtitle */}
            <h3 className="text-xl md:text-2xl font-serif font-bold text-gray-900 mb-1">{test.title}</h3>
            <p className="text-xs md:text-sm text-gray-500 mb-3">{test.subtitle}</p>

            {/* Description */}
            <p className="text-sm md:text-base text-gray-600 mb-4 leading-relaxed">{test.description}</p>

            {/* Duration */}
            <div className="flex items-center text-xs md:text-sm text-gray-500 mb-4">
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {test.duration}
            </div>

            {/* Related Features */}
            <div className="mb-6">
              <div className="text-xs text-gray-500 font-medium mb-2">Related Features:</div>
              <div className="flex flex-wrap gap-2">
                {test.features.map((feature, idx) => (
                  <span
                    key={idx}
                    className="px-2 md:px-3 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-full"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            {/* Start Test Button */}
            <Link
              to={test.type === 'tracking' ? '/eye-tracking-analysis' : `/vision-tests/${test.type}`}
              className="block w-full bg-cream-300 hover:bg-primary-100 text-gray-900 font-semibold py-3 md:py-3 rounded-full text-center transition-colors text-sm md:text-base min-h-[44px] flex items-center justify-center"
            >
              Start Test
            </Link>
          </div>
        ))}
      </div>

      {/* Test History */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-8">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-serif font-bold text-gray-900">Recent Tests</h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
          </div>
        ) : tests.length > 0 ? (
          <div className="overflow-x-auto -mx-4 md:mx-0">
            <div className="inline-block min-w-full align-middle">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs md:text-sm">Test Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs md:text-sm">Score</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs md:text-sm hidden sm:table-cell">Date</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 text-xs md:text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map(test => (
                    <tr key={test.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 capitalize text-sm md:text-base">{test.test_type.replace('_', ' ')}</td>
                      <td className="py-3 px-4 font-semibold text-primary-700 text-sm md:text-base">{test.score}%</td>
                      <td className="py-3 px-4 text-gray-600 text-xs md:text-sm hidden sm:table-cell">
                        {new Date(test.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${
                          test.score >= 80 ? 'bg-green-100 text-green-700' :
                          test.score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
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
            <svg className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            <h3 className="text-base md:text-lg font-semibold text-gray-900 mb-2">No tests yet</h3>
            <p className="text-sm md:text-base text-gray-600 mb-6 px-4">Take your first vision test to start tracking your eye health</p>
            <Link
              to={`/vision-tests/${testTypes[0].type}`}
              className="inline-block bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 rounded-full transition-colors text-sm md:text-base min-h-[44px] flex items-center justify-center"
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
