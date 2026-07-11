import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Eye,
  AlertCircle,
  BookOpen,
  Shield,
  TrendingUp,
  Clock,
  ChevronRight,
  Search,
  Filter,
  X,
  ArrowLeft,
  Monitor,
  Users,
  Sun,
  Droplet,
  Zap,
  Baby,
  Heart,
  Home,
  Frown,
} from 'lucide-react'
import { CONDITION_DATABASE, EYE_CONDITIONS, getConditionsByCategory, searchConditions } from '../utils/comprehensiveEyeConditions'
import { resolveAppTests } from '../utils/visionTestRoutes'

const EyeConditions = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCondition, setSelectedCondition] = useState(null)

  // Check if a specific condition was requested via URL param
  useEffect(() => {
    const conditionId = searchParams.get('condition')
    if (conditionId && EYE_CONDITIONS[conditionId]) {
      setSelectedCondition({ id: conditionId, ...EYE_CONDITIONS[conditionId] })
    }
  }, [searchParams])

  const categories = [
    { value: 'all', label: 'All Conditions', icon: Eye, count: 67 },
    { value: 'preventable_lifestyle', label: 'Preventable & Lifestyle', icon: Monitor, count: 10 },
    { value: 'refractive', label: 'Refractive & Focus', icon: Eye, count: 7 },
    { value: 'binocular', label: 'Binocular & Coordination', icon: Users, count: 7 },
    { value: 'surface_conditions', label: 'Dryness & Surface', icon: Droplet, count: 7 },
    { value: 'light_perception', label: 'Light & Night Vision', icon: Sun, count: 7 },
    { value: 'neurovisual', label: 'Neuro-Visual', icon: Zap, count: 6 },
    { value: 'pediatric', label: 'Pediatric & Teen', icon: Baby, count: 5 },
    { value: 'age_related', label: 'Age-Related', icon: Clock, count: 6 },
    { value: 'environmental', label: 'Environmental & Habits', icon: Home, count: 5 },
    { value: 'symptom_based', label: 'Symptom-Based', icon: Frown, count: 7 },
  ]

  // Get all conditions from database
  const getAllConditions = () => {
    let allConditions = []
    Object.entries(CONDITION_DATABASE).forEach(([category, conditions]) => {
      conditions.forEach(conditionItem => {
        allConditions.push({
          ...conditionItem,
          category,
          // Get full details if available
          details: EYE_CONDITIONS[conditionItem.id] || null
        })
      })
    })
    return allConditions
  }

  // Filter conditions
  const getFilteredConditions = () => {
    let conditions = []

    if (searchQuery.trim()) {
      // Use search function
      const searchResults = searchConditions(searchQuery)
      conditions = searchResults.map(c => ({
        id: c.id,
        name: c.name,
        severity: c.severity,
        priority: c.priority,
        category: c.category,
        details: c
      }))
    } else if (selectedCategory === 'all') {
      conditions = getAllConditions()
    } else {
      // Get by category
      const categoryConditions = CONDITION_DATABASE[selectedCategory] || []
      conditions = categoryConditions.map(conditionItem => ({
        ...conditionItem,
        category: selectedCategory,
        details: EYE_CONDITIONS[conditionItem.id] || null
      }))
    }

    return conditions
  }

  const filteredConditions = getFilteredConditions()

  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'mild':
        return 'bg-green-100 text-green-800 border-green-300'
      case 'moderate':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'severe':
        return 'bg-red-100 text-red-800 border-red-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  // Detail View
  if (selectedCondition) {
    return (
      <div className="bg-app-bg pb-20">
        <div className="bg-white shadow-sm border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <button
              onClick={() => setSelectedCondition(null)}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Conditions
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="bg-brand-gradient text-white rounded-2xl p-8 mb-8 shadow-elevated">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-white">{selectedCondition.name}</h1>
                <p className="text-white/80 text-lg">{selectedCondition.description}</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-sm font-semibold border ${getSeverityColor(
                  selectedCondition.severity
                )} bg-white`}
              >
                {selectedCondition.severity}
              </span>
            </div>
          </div>

          {/* Common Symptoms */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <AlertCircle className="w-6 h-6 mr-2 text-red-600" />
              Common Symptoms
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              {selectedCondition.symptoms.map((symptom, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700">{symptom}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Factors */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-amber-600" />
              Risk Factors
            </h2>
            <div className="space-y-3">
              {selectedCondition.riskFactors.map((factor, idx) => (
                <div key={idx} className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold text-gray-900 mb-1">{factor.factor}</div>
                      <div className="text-sm text-gray-600">{factor.description}</div>
                      <div className="text-xs text-amber-700 mt-2">
                        Impact: {factor.impact} | Threshold: {factor.threshold}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Prevention Tips */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <BookOpen className="w-6 h-6 mr-2 text-green-600" />
              Prevention & Management
            </h2>
            <div className="space-y-3">
              {selectedCondition.prevention.map((tip, idx) => (
                <div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 mb-1">{tip.action}</div>
                      <div className="text-sm text-gray-600 mb-2">{tip.description}</div>
                      <div className="text-xs text-green-700 font-medium">
                        Frequency: {tip.frequency}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Warning Signs */}
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-bold text-red-900 mb-4 flex items-center">
              <AlertCircle className="w-6 h-6 mr-2 text-red-600" />
              When to See a Doctor
            </h2>
            <p className="text-red-800 mb-4">
              Seek professional medical attention if you experience any of these warning signs:
            </p>
            <div className="space-y-2">
              {selectedCondition.warningSigns.map((sign, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <span className="text-red-900 font-medium">{sign}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recommended Tests */}
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <Eye className="w-6 h-6 mr-2 text-accent-600" />
              Recommended Tests
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {resolveAppTests(selectedCondition.appTests)
                .filter((test) => test.implemented)
                .slice(0, 4)
                .map((test) => (
                  <button
                    key={test.route}
                    onClick={() => navigate(test.route)}
                    className="bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-xl p-4 text-left transition-colors"
                  >
                    <div className="font-semibold text-accent-900 mb-1">{test.title}</div>
                    <div className="text-sm text-accent-700">{test.description}</div>
                  </button>
                ))}
              {resolveAppTests(selectedCondition.appTests).filter((t) => t.implemented).length === 0 && (
                <>
                  <button
                    onClick={() => navigate('/vision-tests')}
                    className="bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-xl p-4 text-left transition-colors"
                  >
                    <div className="font-semibold text-accent-900 mb-1">Vision Tests</div>
                    <div className="text-sm text-accent-700">Check your visual acuity and health</div>
                  </button>
                  <button
                    onClick={() => navigate('/eye-tracking-analysis')}
                    className="bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-xl p-4 text-left transition-colors"
                  >
                    <div className="font-semibold text-accent-900 mb-1">Eye Tracking Analysis</div>
                    <div className="text-sm text-accent-700">Monitor blink patterns and fatigue</div>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Medical Disclaimer */}
          <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mt-6">
            <p className="text-xs text-gray-600 text-center">
               <strong>Medical Disclaimer:</strong> This information is for educational purposes
              only and is not a substitute for professional medical advice, diagnosis, or treatment.
              Always consult with a qualified healthcare provider about any questions you may have
              regarding a medical condition.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Library View
  return (
    <div className="bg-app-bg pb-20">
      {/* Header */}
      <div className="bg-brand-gradient text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-white/80 hover:text-white mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <div className="flex items-center mb-4">
            <BookOpen className="w-10 h-10 mr-4" />
            <h1 className="text-4xl font-bold text-white">Eye Conditions Library</h1>
          </div>
          <p className="text-white/80 text-lg max-w-3xl">
            Learn about common eye conditions, their symptoms, risk factors, and how to prevent
            them. Knowledge is the first step to better eye health.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-6 mb-8">
          <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search conditions, symptoms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  color: '#000000 !important',
                  WebkitTextFillColor: '#000000',
                  fontSize: '16px',
                  fontWeight: '500'
                }}
                className="input pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-hide">
              {categories.map((category) => {
                const IconComponent = category.icon
                return (
                  <button
                    key={category.value}
                    onClick={() => setSelectedCategory(category.value)}
                    className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                      selectedCategory === category.value
                        ? 'bg-accent-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <IconComponent className="w-5 h-5" />
                    <span>{category.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      selectedCategory === category.value
                        ? 'bg-white/20'
                        : 'bg-gray-200'
                    }`}>
                      {category.count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-6">
          <p className="text-gray-600">
            Found <strong>{filteredConditions.length}</strong> condition
            {filteredConditions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Conditions Grid */}
        {filteredConditions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-12 text-center">
            <Eye className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No conditions found</h3>
            <p className="text-gray-600">Try adjusting your search or filter criteria</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredConditions.map((condition) => {
              // Use full details if available, otherwise use condensed data
              const displayData = condition.details || condition
              const hasFullDetails = condition.details !== null
              
              return (
                <div
                  key={condition.id}
                  onClick={() => hasFullDetails ? setSelectedCondition(displayData) : null}
                  className={`bg-white rounded-2xl shadow-card border border-gray-100/80 transition-all duration-300 overflow-hidden flex flex-col ${
                    hasFullDetails ? 'cursor-pointer hover:shadow-elevated hover:-translate-y-0.5' : 'cursor-default'
                  }`}
                >
                  <div className="p-6 flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-1">{condition.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`inline-block px-2 py-1 rounded-full text-xs font-semibold border ${getSeverityColor(
                              condition.severity
                            )}`}
                          >
                            {condition.severity}
                          </span>
                          {condition.priority && (
                            <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${
                              condition.priority === 'high' ? 'bg-red-50 text-red-700' :
                              condition.priority === 'medium' ? 'bg-yellow-50 text-yellow-700' :
                              'bg-gray-50 text-gray-700'
                            }`}>
                              {condition.priority} priority
                            </span>
                          )}
                        </div>
                      </div>
                      {hasFullDetails && <ChevronRight className="w-6 h-6 text-gray-400 flex-shrink-0" />}
                    </div>

                    {/* Description */}
                    {displayData.description && (
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">{displayData.description}</p>
                    )}

                    {/* Quick Stats - only show if full details available */}
                    {hasFullDetails && (
                      <>
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center text-sm text-gray-600">
                            <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
                            <span>{displayData.symptoms?.length || 0} common symptoms</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Shield className="w-4 h-4 mr-2 text-yellow-500" />
                            <span>{displayData.riskFactors?.length || 0} risk factors</span>
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <BookOpen className="w-4 h-4 mr-2 text-green-500" />
                            <span>{displayData.prevention?.length || 0} prevention tips</span>
                          </div>
                        </div>

                        {/* Top Symptoms Preview */}
                        {displayData.symptoms && displayData.symptoms.length > 0 && (
                          <div className="border-t pt-4 flex-1">
                            <p className="text-xs font-semibold text-gray-500 mb-2">TOP SYMPTOMS:</p>
                            <div className="space-y-1">
                              {displayData.symptoms.slice(0, 3).map((symptom, idx) => (
                                <div key={idx} className="flex items-start text-xs text-gray-600">
                                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-1.5 mr-2 flex-shrink-0"></div>
                                  <span className="line-clamp-1">{symptom}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Coming Soon badge for conditions without full details */}
                    {!hasFullDetails && (
                      <div className="mt-4 bg-gray-100 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-600 font-medium">Full details coming soon</p>
                      </div>
                    )}
                  </div>

                  {/* Footer - always at bottom */}
                  {hasFullDetails && (
                    <div className="bg-gray-50 px-6 py-3 text-center">
                      <span className="text-sm font-medium text-accent-600">Learn More →</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Educational Banner */}
        <div className="bg-brand-soft border border-accent-100 rounded-2xl p-8 mt-12">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Knowledge is Prevention
            </h2>
            <p className="text-gray-700 mb-6">
              Understanding eye conditions helps you recognize early warning signs and take
              preventive action. Regular testing and lifestyle adjustments can significantly reduce
              your risk of developing serious eye problems.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={() => navigate('/vision-tests')}
                className="btn-primary transition-colors"
              >
                Take a Vision Test
              </button>
              <button
                onClick={() => navigate('/eye-tracking-analysis')}
                className="bg-white text-accent-600 border-2 border-accent-600 px-6 py-3 rounded-xl font-semibold hover:bg-accent-50 transition-colors"
              >
                Analyze Eye Fatigue
              </button>
            </div>
          </div>
        </div>

        {/* Medical Disclaimer */}
        <div className="bg-gray-100 border border-gray-300 rounded-xl p-6 mt-8">
          <p className="text-sm text-gray-600 text-center">
             <strong>Important Medical Disclaimer:</strong> The information provided in this
            library is for educational purposes only and should not be used as a substitute for
            professional medical advice, diagnosis, or treatment. Always seek the advice of your
            physician or other qualified health provider with any questions you may have regarding a
            medical condition. Never disregard professional medical advice or delay in seeking it
            because of something you have read here.
          </p>
        </div>
      </div>
    </div>
  )
}

export default EyeConditions
