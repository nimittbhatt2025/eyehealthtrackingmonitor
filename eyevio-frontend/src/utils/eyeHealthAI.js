/**
 * AI Eye Health Assistant
 * Provides personalized, context-aware feedback based on user data
 * IMPORTANT: Educational only, not medical diagnosis
 */

// Eye Conditions Knowledge Base
export const EYE_CONDITIONS = {
  digital_eye_strain: {
    name: 'Digital Eye Strain',
    category: 'lifestyle',
    severity: 'moderate',
    description: 'Caused by prolonged screen use and digital device exposure, leading to eye discomfort and vision problems.',
    symptoms: [
      'Eye fatigue and discomfort',
      'Blurred or double vision',
      'Headaches',
      'Dry eyes',
      'Neck and shoulder pain',
      'Light sensitivity',
      'Difficulty focusing',
      'Watery eyes',
    ],
    riskFactors: [
      {
        factor: 'Screen Time > 6 hours/day',
        description: 'Prolonged digital device use without breaks causes significant strain',
        impact: 'high',
        threshold: '> 6 hours',
      },
      {
        factor: 'Poor Posture',
        description: 'Incorrect viewing angles and distances increase eye strain',
        impact: 'medium',
        threshold: 'N/A',
      },
      {
        factor: 'Low Blink Rate',
        description: 'Reduced blinking during screen use leads to dry, irritated eyes',
        impact: 'high',
        threshold: '< 12 blinks/min',
      },
      {
        factor: 'Poor Lighting',
        description: 'Inadequate or harsh lighting creates glare and contrast issues',
        impact: 'medium',
        threshold: 'N/A',
      },
      {
        factor: 'No Regular Breaks',
        description: 'Continuous screen use without rest periods accelerates fatigue',
        impact: 'high',
        threshold: 'No breaks for > 20 min',
      },
      {
        factor: 'Improper Viewing Distance',
        description: 'Screen too close or too far requires extra focusing effort',
        impact: 'medium',
        threshold: '< 20 inches or > 30 inches',
      },
    ],
    prevention: [
      {
        action: 'Follow 20-20-20 rule',
        description: 'Every 20 minutes, look at something 20 feet away for 20 seconds',
        frequency: 'Every 20 minutes',
      },
      {
        action: 'Adjust screen position',
        description: 'Position screen 20-26 inches away, slightly below eye level',
        frequency: 'One-time setup',
      },
      {
        action: 'Use proper lighting',
        description: 'Reduce glare with ambient lighting, avoid bright lights behind screen',
        frequency: 'Continuous',
      },
      {
        action: 'Blink consciously',
        description: 'Make an effort to blink fully and frequently while using screens',
        frequency: 'Continuous',
      },
      {
        action: 'Adjust screen settings',
        description: 'Increase text size, adjust brightness to match surroundings',
        frequency: 'As needed',
      },
      {
        action: 'Use artificial tears',
        description: 'Apply lubricating eye drops if eyes feel dry',
        frequency: 'As needed',
      },
      {
        action: 'Take regular breaks',
        description: 'Step away from screen every hour for 5-10 minutes',
        frequency: 'Every hour',
      },
    ],
    warningSigns: [
      'Persistent symptoms lasting more than 2 weeks',
      'Sudden changes in vision',
      'Severe headaches or eye pain',
      'Symptoms interfering with daily activities',
      'Vision problems that worsen rapidly',
    ],
  },

  dry_eye: {
    name: 'Dry Eye Syndrome',
    category: 'tear_film',
    severity: 'mild',
    description: 'Insufficient tear production or poor tear quality leading to inadequate eye lubrication.',
    symptoms: [
      'Burning or stinging sensation',
      'Gritty feeling in eyes',
      'Excessive tearing (paradoxical)',
      'Redness and irritation',
      'Light sensitivity',
      'Mucus discharge',
    ],
    riskFactors: [
      {
        factor: 'Age > 50',
        description: 'Tear production naturally decreases with age',
        impact: 'medium',
        threshold: '> 50 years',
      },
      {
        factor: 'Low Blink Rate',
        description: 'Insufficient blinking prevents proper tear distribution',
        impact: 'high',
        threshold: '< 10 blinks/min',
      },
      {
        factor: 'Contact Lens Wear',
        description: 'Lenses can absorb tears and reduce oxygen to cornea',
        impact: 'medium',
        threshold: 'Daily wear',
      },
      {
        factor: 'Dry Environments',
        description: 'Low humidity accelerates tear evaporation',
        impact: 'medium',
        threshold: '< 30% humidity',
      },
      {
        factor: 'Screen Use',
        description: 'Extended screen time reduces blink rate significantly',
        impact: 'high',
        threshold: '> 4 hours/day',
      },
    ],
    prevention: [
      {
        action: 'Use humidifier',
        description: 'Add moisture to indoor air, especially in winter',
        frequency: 'Daily in dry conditions',
      },
      {
        action: 'Blink consciously',
        description: 'Make complete blinks, especially during screen use',
        frequency: 'Continuous',
      },
      {
        action: 'Stay hydrated',
        description: 'Drink adequate water throughout the day',
        frequency: 'Daily',
      },
      {
        action: 'Use artificial tears',
        description: 'Apply preservative-free lubricating drops',
        frequency: 'As needed, 3-4x daily',
      },
      {
        action: 'Avoid direct airflow',
        description: 'Position away from fans, AC vents, or car heaters',
        frequency: 'Continuous',
      },
      {
        action: 'Omega-3 supplements',
        description: 'May help improve tear quality (consult doctor)',
        frequency: 'Daily',
      },
    ],
    warningSigns: [
      'Persistent redness or pain',
      'Significant vision changes',
      'Discharge or crusting on eyelids',
      'Symptoms worsen despite home care',
    ],
  },

  myopia_progression: {
    name: 'Myopia Progression',
    category: 'refractive',
    severity: 'severe',
    description: 'Progressive worsening of nearsightedness, requiring stronger prescriptions over time.',
    symptoms: [
      'Distant objects appear increasingly blurry',
      'Squinting to see far away',
      'Frequent headaches',
      'Eye strain when looking at distant objects',
      'Difficulty seeing board or TV clearly',
    ],
    riskFactors: [
      {
        factor: 'Family History',
        description: 'Strong genetic component, especially if both parents myopic',
        impact: 'high',
        threshold: 'One or both parents',
      },
      {
        factor: 'Excessive Near Work',
        description: 'Prolonged close-up activities strain focusing muscles',
        impact: 'high',
        threshold: '> 6 hours/day',
      },
      {
        factor: 'Limited Outdoor Time',
        description: 'Lack of natural light exposure associated with myopia development',
        impact: 'high',
        threshold: '< 1 hour/day outdoors',
      },
      {
        factor: 'Age (Children/Teens)',
        description: 'Eyes still developing, most progression occurs ages 8-18',
        impact: 'high',
        threshold: 'Ages 8-18',
      },
    ],
    prevention: [
      {
        action: 'Spend time outdoors',
        description: 'At least 2 hours daily in natural light (especially children)',
        frequency: 'Daily',
      },
      {
        action: 'Limit near work',
        description: 'Take breaks from reading, screens, and close-up tasks',
        frequency: 'Every 20-30 minutes',
      },
      {
        action: 'Good lighting when reading',
        description: 'Ensure adequate illumination for near tasks',
        frequency: 'Continuous',
      },
      {
        action: 'Regular eye exams',
        description: 'Monitor prescription changes annually (children every 6 months)',
        frequency: 'Yearly',
      },
      {
        action: 'Consider myopia control',
        description: 'Ask doctor about specialized contacts, atropine, or glasses',
        frequency: 'As recommended',
      },
    ],
    warningSigns: [
      'Rapidly worsening distance vision',
      'Frequent prescription changes (more than yearly)',
      'Sudden vision changes or floaters',
      'Persistent headaches with visual tasks',
    ],
  },

  computer_vision_syndrome: {
    name: 'Computer Vision Syndrome',
    category: 'lifestyle',
    severity: 'moderate',
    description: 'Collection of eye strain and discomfort symptoms specifically related to computer and digital device use.',
    symptoms: [
      'Blurred vision after screen use',
      'Double vision',
      'Eye irritation and redness',
      'Headaches',
      'Neck and back pain',
      'Difficulty refocusing between distances',
    ],
    riskFactors: [
      {
        factor: 'Poor Workstation Setup',
        description: 'Screen position, chair height, or lighting not optimized',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Uncorrected Vision',
        description: 'Existing refractive errors magnified by screen use',
        impact: 'high',
        threshold: 'No corrective lenses when needed',
      },
      {
        factor: 'Glare on Screen',
        description: 'Reflections from windows or lights cause extra strain',
        impact: 'medium',
        threshold: 'N/A',
      },
      {
        factor: 'Extended Screen Time',
        description: 'Hours of continuous computer work without breaks',
        impact: 'high',
        threshold: '> 4 hours/day',
      },
      {
        factor: 'Reduced Blinking',
        description: 'Blink rate drops by 50% during screen use',
        impact: 'high',
        threshold: '< 12 blinks/min',
      },
    ],
    prevention: [
      {
        action: 'Optimize workstation',
        description: 'Screen at arm\'s length, top at or below eye level, chair adjusted',
        frequency: 'One-time setup',
      },
      {
        action: 'Use anti-glare protector',
        description: 'Apply screen filter to reduce reflections',
        frequency: 'Continuous',
      },
      {
        action: 'Adjust screen brightness',
        description: 'Match screen brightness to ambient lighting',
        frequency: 'As needed',
      },
      {
        action: 'Blink frequently',
        description: 'Consciously blink more often during screen use',
        frequency: 'Continuous',
      },
      {
        action: 'Use proper glasses',
        description: 'Computer-specific prescription may help (ask eye doctor)',
        frequency: 'When using computer',
      },
      {
        action: 'Take breaks',
        description: 'Follow 20-20-20 rule and hourly movement breaks',
        frequency: 'Every 20 minutes',
      },
    ],
    warningSigns: [
      'Symptoms persist after screen breaks',
      'Progressive vision changes',
      'Eye exam more than 2 years overdue',
      'Difficulty completing work tasks',
    ],
  },

  asthenopia: {
    name: 'Asthenopia (Eye Fatigue)',
    category: 'accommodation',
    severity: 'mild',
    description: 'General eye fatigue and discomfort from prolonged focus or demanding visual tasks.',
    symptoms: [
      'Tired, heavy eyes',
      'Sore or aching eyes',
      'Watery or dry eyes',
      'Difficulty maintaining focus',
      'Headaches, especially frontal',
      'Temporary blurred vision',
    ],
    riskFactors: [
      {
        factor: 'Uncorrected Refractive Errors',
        description: 'Eyes work harder to compensate for vision problems',
        impact: 'high',
        threshold: 'Undiagnosed or uncorrected',
      },
      {
        factor: 'Poor Lighting',
        description: 'Too dim or too bright lighting strains eyes',
        impact: 'medium',
        threshold: 'N/A',
      },
      {
        factor: 'Extended Reading',
        description: 'Prolonged near-focus tasks tire eye muscles',
        impact: 'medium',
        threshold: '> 2 hours continuous',
      },
      {
        factor: 'Screen Time',
        description: 'Digital device use reduces blink rate and strains focus',
        impact: 'medium',
        threshold: '> 4 hours/day',
      },
      {
        factor: 'General Fatigue',
        description: 'Lack of sleep amplifies eye strain symptoms',
        impact: 'medium',
        threshold: '< 6 hours sleep',
      },
    ],
    prevention: [
      {
        action: 'Take regular breaks',
        description: 'Rest eyes every 20-30 minutes during visual tasks',
        frequency: 'Every 20-30 minutes',
      },
      {
        action: 'Ensure proper lighting',
        description: 'Use task lighting and avoid harsh glare',
        frequency: 'Continuous',
      },
      {
        action: 'Correct vision problems',
        description: 'Get eye exam and wear prescribed corrective lenses',
        frequency: 'As recommended',
      },
      {
        action: 'Adjust screen settings',
        description: 'Increase text size, reduce brightness if too bright',
        frequency: 'As needed',
      },
      {
        action: 'Practice eye exercises',
        description: 'Palming, focusing near/far, eye circles',
        frequency: 'Daily',
      },
      {
        action: 'Get adequate sleep',
        description: 'Aim for 7-9 hours to allow eye recovery',
        frequency: 'Daily',
      },
    ],
    warningSigns: [
      'Persistent symptoms despite rest',
      'Progressive worsening of vision',
      'Eye pain or severe discomfort',
      'Symptoms significantly affecting work or quality of life',
    ],
  },
}

/**
 * Analyze user data and identify potential risk conditions
 */
export function analyzeUserRiskProfile(userData) {
  const risks = []

  const {
    fatigue_score = 0,
    blink_rate = 15,
    avg_blink_duration = 250,
    screen_time_hours = 0,
    age = 25,
    acuity_score = 90,
    sleep_hours = 7,
    prescription = null,
    lighting_quality = 'average',
    activity_level = 'moderate',
  } = userData

  // Check each condition
  Object.entries(EYE_CONDITIONS).forEach(([key, condition]) => {
    let riskScore = 0
    let triggers = []

    // Analyze risk factors (now objects with factor, description, impact, threshold)
    if (condition.riskFactors) {
      condition.riskFactors.forEach((riskFactor) => {
        const factor = riskFactor.factor
        const impact = riskFactor.impact

        // Screen time checks
        if (factor.includes('Screen Time') && screen_time_hours > 6) {
          riskScore += impact === 'high' ? 20 : impact === 'medium' ? 10 : 5
          triggers.push(`High screen time: ${screen_time_hours}h/day`)
        }

        // Blink rate checks
        if (factor.includes('Blink Rate') || factor.includes('blinking')) {
          if (blink_rate < 12) {
            riskScore += impact === 'high' ? 20 : impact === 'medium' ? 10 : 5
            triggers.push(`Low blink rate: ${blink_rate}/min`)
          }
        }

        // Age checks
        if (factor.includes('Age') && factor.includes('50') && age > 50) {
          riskScore += impact === 'high' ? 15 : 10
          triggers.push(`Age factor: ${age} years`)
        }
        if (factor.includes('Children') && age >= 8 && age <= 18) {
          riskScore += 15
          triggers.push(`Development age: ${age} years`)
        }

        // Near work / extended activities
        if (factor.includes('Near Work') || factor.includes('Extended') && screen_time_hours > 4) {
          riskScore += impact === 'high' ? 15 : 10
          triggers.push(`Extended near work: ${screen_time_hours}h`)
        }

        // Lighting
        if (factor.includes('lighting') || factor.includes('Lighting')) {
          if (lighting_quality === 'poor') {
            riskScore += impact === 'high' ? 15 : 10
            triggers.push('Poor lighting environment')
          }
        }

        // Outdoor time (for myopia)
        if (factor.includes('Outdoor') && activity_level === 'sedentary') {
          riskScore += 15
          triggers.push('Limited outdoor activity')
        }

        // Sleep/fatigue
        if (factor.includes('Fatigue') || factor.includes('sleep')) {
          if (sleep_hours < 6) {
            riskScore += 10
            triggers.push(`Insufficient sleep: ${sleep_hours}h`)
          }
        }

        // Prescription/refractive errors
        if (factor.includes('Uncorrected') && !prescription) {
          riskScore += 10
          triggers.push('No vision correction noted')
        }
        if (factor.includes('Family') && prescription && prescription.includes('myopia')) {
          riskScore += 15
          triggers.push('Myopic prescription present')
        }
      })
    }

    // Additional checks based on test results
    if (fatigue_score > 60) {
      riskScore += 15
      triggers.push(`High fatigue: score ${fatigue_score}`)
    } else if (fatigue_score > 40) {
      riskScore += 10
      triggers.push(`Elevated fatigue: score ${fatigue_score}`)
    }

    if (blink_rate < 10) {
      riskScore += 15
      triggers.push(`Very low blink rate: ${blink_rate}/min`)
    }

    // Categorize risk level
    let riskLevel = 'low'
    if (riskScore >= 60) riskLevel = 'high'
    else if (riskScore >= 30) riskLevel = 'moderate'

    if (riskScore > 0) {
      risks.push({
        condition: key,
        name: condition.name,
        category: condition.category,
        severity: condition.severity,
        riskLevel,
        riskScore: Math.min(riskScore, 100), // Cap at 100
        triggers,
      })
    }
  })

  // Sort by risk score
  risks.sort((a, b) => b.riskScore - a.riskScore)

  return {
    conditions: risks,
    highestRisk: risks[0] || null,
    totalConditionsAtRisk: risks.length,
  }
}

/**
 * Generate personalized feedback based on test results and user profile
 */
export function generatePersonalizedFeedback(testResult, userProfile) {
  const {
    test_type,
    score,
    metadata = {},
  } = testResult

  const {
    age,
    screen_time_hours = 0,
    avg_sleep_hours = 7,
    lens_type = 'none',
    activity_level = 'moderate',
    lighting_condition = 'mixed',
  } = userProfile

  let feedback = {
    title: '',
    assessment: '',
    insights: [],
    recommendations: [],
    severity: 'normal', // normal, caution, concern
    relatedConditions: [],
    nextSteps: [],
  }

  // Eye Tracking specific feedback
  if (test_type === 'eye_tracking') {
    const fatigueScore = metadata.fatigueScore || 0
    const blinkRate = metadata.blinkRate || 15
    const totalBlinks = metadata.totalBlinks || 0

    // Title based on severity
    if (fatigueScore < 30) {
      feedback.title = ' Excellent Eye Health!'
      feedback.severity = 'normal'
    } else if (fatigueScore < 60) {
      feedback.title = ' Mild Eye Strain Detected'
      feedback.severity = 'caution'
    } else {
      feedback.title = ' High Eye Fatigue - Action Needed'
      feedback.severity = 'concern'
    }

    // Personalized assessment
    const assessmentParts = []
    
    if (fatigueScore < 30) {
      assessmentParts.push('Your eyes are showing healthy patterns.')
    } else {
      assessmentParts.push(`Your fatigue score of ${fatigueScore} indicates ${fatigueScore < 60 ? 'mild' : 'significant'} eye strain.`)
    }

    // Context from screen time
    if (screen_time_hours > 8) {
      assessmentParts.push(`With ${screen_time_hours} hours of daily screen time, you're in the high-risk category for digital eye strain.`)
      feedback.relatedConditions.push('digital_eye_strain')
    } else if (screen_time_hours > 5) {
      assessmentParts.push(`Your ${screen_time_hours} hours of daily screen time is contributing to eye fatigue.`)
    }

    // Blink rate analysis
    if (blinkRate < 10) {
      assessmentParts.push(`Your blink rate of ${blinkRate}/min is critically low (normal: 12-20/min), which can lead to dry eyes.`)
      feedback.relatedConditions.push('dry_eye')
    } else if (blinkRate < 12) {
      assessmentParts.push(`Your blink rate of ${blinkRate}/min is slightly low. Aim for 12-20/min.`)
    }

    feedback.assessment = assessmentParts.join(' ')

    // Personalized insights
    feedback.insights = generateInsights(testResult, userProfile)

    // Personalized recommendations
    feedback.recommendations = generateRecommendations(testResult, userProfile)

    // Next steps
    feedback.nextSteps = generateNextSteps(fatigueScore, blinkRate, userProfile)
  }

  // Acuity test feedback
  else if (test_type === 'acuity') {
    if (score >= 90) {
      feedback.title = ' Excellent Visual Acuity'
      feedback.severity = 'normal'
      feedback.assessment = 'Your distance vision is excellent.'
    } else if (score >= 70) {
      feedback.title = ' Slight Vision Changes Detected'
      feedback.severity = 'caution'
      feedback.assessment = `Your acuity score of ${score} suggests mild vision changes.`
      feedback.relatedConditions.push('myopia_progression')
    } else {
      feedback.title = ' Significant Vision Concerns'
      feedback.severity = 'concern'
      feedback.assessment = `Your acuity score of ${score} indicates notable vision issues.`
      feedback.relatedConditions.push('myopia_progression')
    }

    // Add context
    if (age < 25 && score < 85) {
      feedback.insights.push('Young adults often experience vision changes due to near work and screens.')
    }

    if (screen_time_hours > 6) {
      feedback.insights.push('High screen time may be contributing to vision fatigue and changes.')
    }

    feedback.recommendations = [
      'Schedule a comprehensive eye exam with an optometrist',
      score < 80 ? 'Discuss prescription glasses or updates' : 'Regular check-ups recommended',
      'Reduce eye strain with proper lighting and breaks',
    ]
  }

  return feedback
}

/**
 * Generate context-aware insights
 */
function generateInsights(testResult, userProfile) {
  const insights = []
  const metadata = testResult.metadata || {}
  const fatigueScore = metadata.fatigueScore || 0

  // Sleep impact
  if (userProfile.avg_sleep_hours < 7) {
    insights.push(` Sleep Factor: Your ${userProfile.avg_sleep_hours} hours of sleep may be affecting eye recovery. Aim for 7-9 hours.`)
  }

  // Lighting impact
  if (userProfile.lighting_condition === 'poor') {
    insights.push(' Lighting Issue: Poor lighting significantly increases eye strain. Improve ambient lighting.')
  }

  // Lens impact
  if (userProfile.lens_type !== 'none' && fatigueScore > 40) {
    insights.push(`👓 Prescription Check: Consider updating your ${userProfile.lens_type} prescription if it's been >1 year.`)
  }

  // Activity level
  if (userProfile.activity_level === 'sedentary' && fatigueScore > 50) {
    insights.push('🏃 Movement Matters: Sedentary lifestyle reduces circulation. Take movement breaks every hour.')
  }

  // Screen time patterns
  if (userProfile.screen_time_hours > 10) {
    insights.push(' Extreme Screen Exposure: 10+ hours/day puts you at very high risk. Consider screen-free periods.')
  }

  return insights
}

/**
 * Generate personalized recommendations
 */
function generateRecommendations(testResult, userProfile) {
  const recommendations = []
  const metadata = testResult.metadata || {}
  const fatigueScore = metadata.fatigueScore || 0
  const blinkRate = metadata.blinkRate || 15

  // Immediate actions
  if (fatigueScore > 60) {
    recommendations.push({
      priority: 'urgent',
      action: 'Take a 15-minute break immediately',
      reason: 'High fatigue requires rest now',
    })
  }

  // Blink exercises
  if (blinkRate < 12) {
    recommendations.push({
      priority: 'high',
      action: 'Practice conscious blinking: 10 complete blinks every 20 minutes',
      reason: 'Your blink rate is below normal',
    })
  }

  // 20-20-20 rule
  if (userProfile.screen_time_hours > 4) {
    recommendations.push({
      priority: 'high',
      action: '20-20-20 Rule: Every 20 min, look 20 feet away for 20 seconds',
      reason: 'Essential for extended screen users',
    })
  }

  // Screen setup
  if (fatigueScore > 40) {
    recommendations.push({
      priority: 'medium',
      action: 'Optimize screen position: 20-26 inches away, slightly below eye level',
      reason: 'Ergonomics reduce strain',
    })
  }

  // Artificial tears
  if (blinkRate < 10 || fatigueScore > 50) {
    recommendations.push({
      priority: 'medium',
      action: 'Use preservative-free artificial tears 3-4x daily',
      reason: 'Helps maintain tear film',
    })
  }

  // Blue light
  if (userProfile.screen_time_hours > 6) {
    recommendations.push({
      priority: 'medium',
      action: 'Enable blue light filter after 6 PM',
      reason: 'Reduces strain and improves sleep',
    })
  }

  // Doctor visit
  if (fatigueScore > 70 || blinkRate < 8) {
    recommendations.push({
      priority: 'urgent',
      action: 'Schedule eye exam within 2 weeks',
      reason: 'Persistent symptoms need professional evaluation',
    })
  }

  return recommendations
}

/**
 * Generate next steps
 */
function generateNextSteps(fatigueScore, blinkRate, userProfile) {
  const steps = []

  if (fatigueScore > 50) {
    steps.push({
      step: 'Complete blink calibration',
      reason: 'Get personalized blink detection',
      link: '/calibrate-blink',
    })
  }

  if (userProfile.screen_time_hours > 6) {
    steps.push({
      step: 'Log lifestyle factors',
      reason: 'Identify strain triggers',
      link: '/lifestyle',
    })
  }

  steps.push({
    step: 'View trends over time',
    reason: 'Track your progress',
    link: '/trends',
  })

  steps.push({
    step: 'Set up daily reminders',
    reason: 'Build healthy habits',
    link: '/settings',
  })

  return steps
}

/**
 * Assess if user should see a doctor
 */
export function assessDoctorVisit(userData, testResults = []) {
  let urgency = 'green' // green, yellow, red
  let reasons = []

  // Check recent tests
  const recentEyeTracking = testResults
    .filter((t) => t.test_type === 'eye_tracking')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

  if (recentEyeTracking?.metadata?.fatigueScore > 70) {
    urgency = 'red'
    reasons.push('Persistently high fatigue score')
  } else if (recentEyeTracking?.metadata?.fatigueScore > 50) {
    urgency = 'yellow'
    reasons.push('Elevated fatigue levels')
  }

  // Check vision decline
  const acuityTests = testResults
    .filter((t) => t.test_type === 'acuity')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 3)

  if (acuityTests.length >= 2) {
    const recent = acuityTests[0].score
    const older = acuityTests[acuityTests.length - 1].score
    const decline = older - recent

    if (decline > 15) {
      urgency = 'red'
      reasons.push(`Vision decline: ${decline}% decrease`)
    } else if (decline > 8) {
      if (urgency === 'green') urgency = 'yellow'
      reasons.push('Mild vision changes detected')
    }
  }

  // Blink rate concerns
  if (userData.blink_rate < 8) {
    urgency = 'red'
    reasons.push('Critically low blink rate')
  } else if (userData.blink_rate < 10) {
    if (urgency === 'green') urgency = 'yellow'
    reasons.push('Low blink rate may indicate dry eye')
  }

  return {
    urgency,
    reasons,
    recommendation: getUrgencyRecommendation(urgency),
  }
}

function getUrgencyRecommendation(urgency) {
  const recommendations = {
    green: {
      title: ' Monitor & Prevent',
      message: 'Continue healthy habits and regular self-monitoring.',
      action: 'Schedule routine eye exam within 12 months',
    },
    yellow: {
      title: ' Schedule Routine Exam',
      message: 'Some concerning patterns detected. A professional evaluation is recommended.',
      action: 'Schedule eye exam within 1-3 months',
    },
    red: {
      title: ' Seek Care Soon',
      message: 'Significant concerns require professional evaluation.',
      action: 'Contact eye care professional within 1-2 weeks',
    },
  }

  return recommendations[urgency]
}

/**
 * Analyze user text input for symptoms and suggest conditions
 * Used by AI Chatbot for natural language symptom analysis
 */
export function analyzeSymptoms(userInput = '') {
  // If input is empty, return empty analysis
  if (!userInput || typeof userInput !== 'string') {
    return {
      detectedSymptoms: [],
      likelyConditions: [],
      recommendations: [],
      urgency: 'normal',
    }
  }

  const input = userInput.toLowerCase()
  
  // Symptom keywords to detect
  const symptomKeywords = {
    'dry': ['dry', 'dryness', 'sandy', 'gritty'],
    'tired': ['tired', 'fatigue', 'fatigued', 'exhausted', 'heavy'],
    'blurry': ['blurry', 'blur', 'blurred', 'fuzzy', 'unfocused'],
    'pain': ['pain', 'ache', 'hurt', 'sore', 'aching'],
    'headache': ['headache', 'head ache', 'migraine'],
    'burning': ['burning', 'burn', 'stinging'],
    'red': ['red', 'redness', 'bloodshot'],
    'watery': ['watery', 'watering', 'tearing', 'tears'],
    'itchy': ['itchy', 'itch', 'itching'],
    'light sensitivity': ['light sensitivity', 'sensitive to light', 'photophobia', 'bright light'],
    'double vision': ['double', 'diplopia', 'seeing double'],
    'difficulty focusing': ['can\'t focus', 'difficult to focus', 'trouble focusing', 'hard to focus'],
    'screen strain': ['screen', 'computer', 'monitor', 'digital'],
  }

  // Detect symptoms from input
  const detectedSymptoms = []
  Object.entries(symptomKeywords).forEach(([symptom, keywords]) => {
    if (keywords.some(keyword => input.includes(keyword))) {
      detectedSymptoms.push(symptom)
    }
  })

  // Match conditions based on detected symptoms
  const conditionMatches = []
  Object.entries(EYE_CONDITIONS).forEach(([key, condition]) => {
    let matchScore = 0
    let matchedSymptoms = []

    // Check if condition symptoms match detected symptoms or input text
    condition.symptoms.forEach(condSymptom => {
      const symptomLower = condSymptom.toLowerCase()
      // Check against detected symptoms
      if (detectedSymptoms.some(ds => symptomLower.includes(ds) || ds.includes(symptomLower))) {
        matchScore += 2
        matchedSymptoms.push(condSymptom)
      }
      // Check directly against input
      else if (input.includes(symptomLower) || symptomLower.includes(input.split(' ').find(word => word.length > 3) || '')) {
        matchScore += 1
        matchedSymptoms.push(condSymptom)
      }
    })

    if (matchScore > 0) {
      conditionMatches.push({
        id: key,
        name: condition.name,
        description: condition.description,
        confidence: Math.min(matchScore / 10, 1), // Normalize to 0-1
        matchedSymptoms,
        symptoms: condition.symptoms,
        prevention: condition.prevention,
        warningSigns: condition.warningSigns,
      })
    }
  })

  // Sort by confidence
  conditionMatches.sort((a, b) => b.confidence - a.confidence)
  const likelyConditions = conditionMatches.slice(0, 5) // Top 5

  // Generate recommendations
  const recommendations = []
  if (detectedSymptoms.includes('dry')) {
    recommendations.push('Use artificial tears or lubricating eye drops')
    recommendations.push('Take regular breaks from screens (20-20-20 rule)')
    recommendations.push('Use a humidifier in dry environments')
  }
  if (detectedSymptoms.includes('screen strain') || detectedSymptoms.includes('tired')) {
    recommendations.push('Follow the 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds')
    recommendations.push('Adjust screen brightness and reduce blue light')
    recommendations.push('Ensure proper lighting and screen positioning')
  }
  if (detectedSymptoms.includes('blurry')) {
    recommendations.push('Get a comprehensive eye exam to check your prescription')
    recommendations.push('Ensure adequate lighting when reading or working')
  }
  if (detectedSymptoms.includes('headache')) {
    recommendations.push('Check your screen ergonomics and posture')
    recommendations.push('Take frequent breaks from near work')
    recommendations.push('Consider getting your vision checked')
  }
  if (detectedSymptoms.includes('pain')) {
    recommendations.push('Avoid rubbing your eyes')
    recommendations.push('If pain persists, see an eye doctor soon')
  }

  // Add general recommendations
  if (recommendations.length < 3) {
    recommendations.push('Maintain good eye hygiene')
    recommendations.push('Get regular comprehensive eye exams')
    recommendations.push('Stay hydrated and get adequate sleep')
  }

  // Determine urgency
  let urgency = 'normal'
  const urgentKeywords = ['sudden', 'severe', 'sharp pain', 'vision loss', 'flashes', 'floaters', 'trauma', 'injury']
  const highPriorityKeywords = ['pain', 'double vision', 'persistent', 'worsening', 'daily']
  
  if (urgentKeywords.some(keyword => input.includes(keyword))) {
    urgency = 'urgent'
  } else if (highPriorityKeywords.some(keyword => input.includes(keyword)) || detectedSymptoms.includes('pain')) {
    urgency = 'high'
  }

  return {
    detectedSymptoms,
    likelyConditions,
    recommendations: [...new Set(recommendations)], // Remove duplicates
    urgency,
  }
}

export default {
  EYE_CONDITIONS,
  analyzeUserRiskProfile,
  generatePersonalizedFeedback,
  assessDoctorVisit,
  analyzeSymptoms,
}
