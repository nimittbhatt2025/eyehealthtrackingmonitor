import { useState, useEffect } from 'react'
import { visionTestAPI, lifestyleAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Achievements() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [achievements, setAchievements] = useState([])
  const [currentStreak, setCurrentStreak] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [totalPoints, setTotalPoints] = useState(0)

  useEffect(() => {
    loadAchievements()
  }, [])

  const loadAchievements = async () => {
    setLoading(true)
    try {
      const [testsResponse, lifestyleResponse] = await Promise.all([
        visionTestAPI.getAll({ days: 365 }),
        lifestyleAPI.getLogs({ days: 365 })
      ])
      
      const tests = testsResponse.data.tests || []
      const logs = lifestyleResponse.data.logs || []
      
      // Calculate streaks
      calculateStreaks(tests, logs)
      
      // Calculate achievements
      const earned = calculateAchievements(tests, logs)
      setAchievements(earned)
      
      // Calculate total points
      const points = earned.filter(a => a.unlocked).reduce((sum, a) => sum + a.points, 0)
      setTotalPoints(points)
      
    } catch (error) {
      console.error('Failed to load achievements:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateStreaks = (tests, logs) => {
    // Combine and sort all activity dates
    const testDates = tests.map(t => new Date(t.created_at).toDateString())
    const logDates = logs.map(l => new Date(l.date).toDateString())
    const allDates = [...new Set([...testDates, ...logDates])].sort((a, b) => new Date(b) - new Date(a))
    
    if (allDates.length === 0) {
      setCurrentStreak(0)
      setLongestStreak(0)
      return
    }

    // Calculate current streak
    let current = 0
    const today = new Date().toDateString()
    const yesterday = new Date(Date.now() - 86400000).toDateString()
    
    if (allDates.includes(today) || allDates.includes(yesterday)) {
      let checkDate = new Date()
      while (allDates.includes(checkDate.toDateString())) {
        current++
        checkDate = new Date(checkDate - 86400000)
      }
    }
    setCurrentStreak(current)

    // Calculate longest streak
    let longest = 0
    let tempStreak = 1
    for (let i = 0; i < allDates.length - 1; i++) {
      const diff = (new Date(allDates[i]) - new Date(allDates[i + 1])) / 86400000
      if (diff === 1) {
        tempStreak++
        longest = Math.max(longest, tempStreak)
      } else {
        tempStreak = 1
      }
    }
    setLongestStreak(Math.max(longest, current))
  }

  const calculateAchievements = (tests, logs) => {
    const testCount = tests.length
    const logCount = logs.length
    const avgScore = tests.length > 0 ? tests.reduce((sum, t) => sum + t.score, 0) / tests.length : 0
    const perfectScores = tests.filter(t => t.score >= 95).length

    return [
      // Test Milestones
      {
        id: 'first_test',
        title: 'Getting Started',
        description: 'Complete your first vision test',
        icon: null,
        category: 'tests',
        unlocked: testCount >= 1,
        progress: Math.min(testCount, 1),
        total: 1,
        points: 10
      },
      {
        id: 'test_5',
        title: 'Committed',
        description: 'Complete 5 vision tests',
        icon: null,
        category: 'tests',
        unlocked: testCount >= 5,
        progress: Math.min(testCount, 5),
        total: 5,
        points: 25
      },
      {
        id: 'test_10',
        title: 'Dedicated',
        description: 'Complete 10 vision tests',
        icon: null,
        category: 'tests',
        unlocked: testCount >= 10,
        progress: Math.min(testCount, 10),
        total: 10,
        points: 50
      },
      {
        id: 'test_25',
        title: 'Vision Champion',
        description: 'Complete 25 vision tests',
        icon: null,
        category: 'tests',
        unlocked: testCount >= 25,
        progress: Math.min(testCount, 25),
        total: 25,
        points: 100
      },
      {
        id: 'test_50',
        title: 'Eye Care Master',
        description: 'Complete 50 vision tests',
        icon: null,
        category: 'tests',
        unlocked: testCount >= 50,
        progress: Math.min(testCount, 50),
        total: 50,
        points: 250
      },

      // Streak Achievements
      {
        id: 'streak_3',
        title: '3-Day Streak',
        description: 'Stay active for 3 consecutive days',
        icon: null,
        category: 'streaks',
        unlocked: currentStreak >= 3 || longestStreak >= 3,
        progress: Math.min(currentStreak, 3),
        total: 3,
        points: 30
      },
      {
        id: 'streak_7',
        title: 'Week Warrior',
        description: 'Maintain a 7-day streak',
        icon: null,
        category: 'streaks',
        unlocked: currentStreak >= 7 || longestStreak >= 7,
        progress: Math.min(currentStreak, 7),
        total: 7,
        points: 75
      },
      {
        id: 'streak_30',
        title: 'Month Master',
        description: 'Achieve a 30-day streak',
        icon: null,
        category: 'streaks',
        unlocked: currentStreak >= 30 || longestStreak >= 30,
        progress: Math.min(currentStreak, 30),
        total: 30,
        points: 200
      },

      // Performance Achievements
      {
        id: 'perfect_score',
        title: 'Perfect Vision',
        description: 'Score 95% or higher on a test',
        icon: null,
        category: 'performance',
        unlocked: perfectScores >= 1,
        progress: Math.min(perfectScores, 1),
        total: 1,
        points: 50
      },
      {
        id: 'avg_80',
        title: 'High Achiever',
        description: 'Maintain 80% average score',
        icon: null,
        category: 'performance',
        unlocked: avgScore >= 80,
        progress: Math.min(avgScore, 80),
        total: 80,
        points: 75
      },
      {
        id: 'avg_90',
        title: 'Excellence',
        description: 'Maintain 90% average score',
        icon: null,
        category: 'performance',
        unlocked: avgScore >= 90,
        progress: Math.min(avgScore, 90),
        total: 90,
        points: 150
      },

      // Lifestyle Achievements
      {
        id: 'lifestyle_first',
        title: 'Lifestyle Logger',
        description: 'Log your first lifestyle entry',
        icon: null,
        category: 'lifestyle',
        unlocked: logCount >= 1,
        progress: Math.min(logCount, 1),
        total: 1,
        points: 10
      },
      {
        id: 'lifestyle_7',
        title: 'Habit Tracker',
        description: 'Log lifestyle data for 7 days',
        icon: null,
        category: 'lifestyle',
        unlocked: logCount >= 7,
        progress: Math.min(logCount, 7),
        total: 7,
        points: 40
      },
      {
        id: 'lifestyle_30',
        title: 'Health Guru',
        description: 'Log lifestyle data for 30 days',
        icon: null,
        category: 'lifestyle',
        unlocked: logCount >= 30,
        progress: Math.min(logCount, 30),
        total: 30,
        points: 100
      },

      // Special Achievements
      {
        id: 'early_bird',
        title: 'Early Adopter',
        description: 'Join EyeVio in its early days',
        icon: null,
        category: 'special',
        unlocked: true,
        progress: 1,
        total: 1,
        points: 25
      },
    ]
  }

  const getCategoryIcon = (category) => {
    const iconClass = "w-8 h-8"
    switch (category) {
      case 'tests': 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      case 'streaks': 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
      case 'performance': 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
      case 'lifestyle': 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
      case 'special': 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
      default: 
        return <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    }
  }

  const getCategoryColor = () => {
    // Single brand-consistent teal gradient (accent-500 -> accent-700) for all
    // categories; category is still distinguished by its icon and heading.
    return 'from-accent-500 to-accent-700'
  }

  const unlockedCount = achievements.filter(a => a.unlocked).length
  const progressPercent = (unlockedCount / achievements.length) * 100

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="page-title">Achievements</h1>
        <p className="page-subtitle">Track your progress and unlock rewards</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-accent-100 border-t-accent-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="grid md:grid-cols-4 gap-6">
            {/* Total Points — key metric hero */}
            <div className="bg-brand-gradient rounded-2xl p-6 text-white shadow-glow">
              <div className="text-sm opacity-90 mb-2">Total Points</div>
              <div className="text-4xl font-bold">{totalPoints}</div>
              <div className="text-sm opacity-75 mt-2">Keep earning!</div>
            </div>

            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-gray-500 mb-2">Unlocked</div>
                  <div className="text-4xl font-bold text-gray-900">{unlockedCount}/{achievements.length}</div>
                  <div className="text-sm text-gray-500 mt-2">{progressPercent.toFixed(0)}% complete</div>
                </div>
                <div className="icon-tile bg-accent-50 text-accent-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-gray-500 mb-2">Current Streak</div>
                  <div className="text-4xl font-bold text-gray-900">{currentStreak}</div>
                  <div className="text-sm text-gray-500 mt-2">days active</div>
                </div>
                <div className="icon-tile bg-amber-50 text-amber-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-gray-500 mb-2">Longest Streak</div>
                  <div className="text-4xl font-bold text-gray-900">{longestStreak}</div>
                  <div className="text-sm text-gray-500 mt-2">days record</div>
                </div>
                <div className="icon-tile bg-accent-50 text-accent-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="card p-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-serif font-bold text-gray-900">Overall Progress</h2>
              <span className="text-sm font-semibold text-accent-600">{progressPercent.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-4">
              <div 
                className="bg-brand-gradient h-4 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-500 mt-2">{unlockedCount} achievements unlocked, {achievements.length - unlockedCount} remaining</p>
          </div>

          {/* Achievements Grid by Category */}
          {['tests', 'streaks', 'performance', 'lifestyle', 'special'].map((category) => {
            const categoryAchievements = achievements.filter(a => a.category === category)
            if (categoryAchievements.length === 0) return null

            return (
              <div key={category} className="card p-8">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="text-accent-600">{getCategoryIcon(category)}</div>
                  <h2 className="text-2xl font-serif font-bold text-gray-900 capitalize">{category}</h2>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryAchievements.map((achievement) => (
                    <div
                      key={achievement.id}
                      className={`relative rounded-2xl p-6 border-2 transition-all ${
                        achievement.unlocked
                          ? `bg-gradient-to-br ${getCategoryColor(achievement.category)} text-white shadow-lg`
                          : 'bg-gray-50 border-gray-200 opacity-60'
                      }`}
                    >
                      {achievement.unlocked && (
                        <div className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}

                      <div className={`mb-3 ${achievement.unlocked ? 'text-white' : 'text-accent-600'}`}>
                        {getCategoryIcon(achievement.category)}
                      </div>

                      <h3 className={`text-xl font-bold mb-2 ${!achievement.unlocked && 'text-gray-700'}`}>
                        {achievement.title}
                      </h3>

                      <p className={`text-sm mb-4 ${achievement.unlocked ? 'text-white opacity-90' : 'text-gray-600'}`}>
                        {achievement.description}
                      </p>

                      {/* Progress Bar */}
                      {!achievement.unlocked && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>Progress</span>
                            <span>{achievement.progress}/{achievement.total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`bg-gradient-to-r ${getCategoryColor(achievement.category)} h-2 rounded-full`}
                              style={{ width: `${(achievement.progress / achievement.total) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      {/* Points */}
                      <div className={`mt-4 text-sm font-semibold ${achievement.unlocked ? 'text-white' : 'text-accent-600'}`}>
                        +{achievement.points} points
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default Achievements
