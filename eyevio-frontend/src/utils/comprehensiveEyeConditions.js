/**
 * COMPREHENSIVE EYE CONDITIONS LIBRARY (70+ Conditions)
 * Organized by 10 categories for AI-powered eye health insights
 * EDUCATIONAL ONLY - Not for medical diagnosis
 */

// Complete condition database with all 10 categories
export const CONDITION_DATABASE = {
  //  A. PREVENTABLE & LIFESTYLE-RELATED (10 conditions - HIGH PRIORITY)
  preventable_lifestyle: [
    { id: 'digital_eye_strain', name: 'Digital Eye Strain', severity: 'moderate', priority: 'high' },
    { id: 'dry_eye_disease', name: 'Dry Eye Disease', severity: 'mild', priority: 'high' },
    { id: 'eye_fatigue', name: 'Eye Fatigue (Asthenopia)', severity: 'mild', priority: 'high' },
    { id: 'reduced_blink_rate', name: 'Reduced Blink Rate Syndrome', severity: 'mild', priority: 'high' },
    { id: 'incomplete_blink', name: 'Incomplete Blink Syndrome', severity: 'mild', priority: 'medium' },
    { id: 'blue_light_sensitivity', name: 'Blue Light Sensitivity', severity: 'mild', priority: 'medium' },
    { id: 'screen_headaches', name: 'Screen-Induced Headaches', severity: 'moderate', priority: 'high' },
    { id: 'accommodation_fatigue', name: 'Accommodation Fatigue', severity: 'moderate', priority: 'medium' },
    { id: 'visual_stress', name: 'Visual Stress', severity: 'mild', priority: 'medium' },
    { id: 'poor_focus_endurance', name: 'Poor Focus Endurance', severity: 'mild', priority: 'low' },
  ],

  //  B. REFRACTIVE & FOCUS CONDITIONS (7 conditions)
  refractive: [
    { id: 'myopia', name: 'Myopia (Nearsightedness)', severity: 'moderate', priority: 'high' },
    { id: 'hyperopia', name: 'Hyperopia (Farsightedness)', severity: 'mild', priority: 'medium' },
    { id: 'astigmatism', name: 'Astigmatism', severity: 'mild', priority: 'medium' },
    { id: 'presbyopia', name: 'Presbyopia', severity: 'mild', priority: 'low' },
    { id: 'progressive_myopia', name: 'Progressive Myopia', severity: 'severe', priority: 'high' },
    { id: 'focus_flexibility', name: 'Focus Flexibility Deficiency', severity: 'mild', priority: 'low' },
    { id: 'blur_adaptation', name: 'Blur Adaptation Issues', severity: 'mild', priority: 'low' },
  ],

  // 🔵 C. BINOCULAR & EYE COORDINATION CONDITIONS (7 conditions)
  binocular: [
    { id: 'strabismus_ed', name: 'Eye Alignment Issues (Educational)', severity: 'moderate', priority: 'medium' },
    { id: 'convergence_insufficiency', name: 'Convergence Insufficiency', severity: 'moderate', priority: 'medium' },
    { id: 'divergence_insufficiency', name: 'Divergence Insufficiency', severity: 'mild', priority: 'low' },
    { id: 'eye_tracking_instability', name: 'Eye Tracking Instability', severity: 'mild', priority: 'medium' },
    { id: 'poor_fixation', name: 'Poor Fixation Control', severity: 'mild', priority: 'low' },
    { id: 'binocular_dysfunction', name: 'Binocular Vision Dysfunction', severity: 'moderate', priority: 'medium' },
    { id: 'diplopia_tendency', name: 'Double Vision Tendencies', severity: 'moderate', priority: 'medium' },
  ],

  // 🟣 D. DRYNESS, IRRITATION & SURFACE CONDITIONS (7 conditions)
  surface_conditions: [
    { id: 'evaporative_dry_eye', name: 'Evaporative Dry Eye', severity: 'mild', priority: 'high' },
    { id: 'aqueous_deficient_dry_eye', name: 'Aqueous Deficient Dry Eye', severity: 'moderate', priority: 'medium' },
    { id: 'allergic_irritation', name: 'Allergic Eye Irritation', severity: 'mild', priority: 'medium' },
    { id: 'environmental_irritation', name: 'Environmental Eye Irritation', severity: 'mild', priority: 'medium' },
    { id: 'contact_lens_discomfort', name: 'Contact Lens Discomfort', severity: 'mild', priority: 'medium' },
    { id: 'chronic_redness', name: 'Chronic Eye Redness', severity: 'mild', priority: 'medium' },
    { id: 'burning_sensation', name: 'Burning Eye Sensation Syndrome', severity: 'mild', priority: 'medium' },
  ],

  // 🟠 E. LIGHT, NIGHT & VISUAL PERCEPTION ISSUES (7 conditions)
  light_perception: [
    { id: 'photophobia', name: 'Light Sensitivity (Photophobia)', severity: 'moderate', priority: 'medium' },
    { id: 'glare_sensitivity', name: 'Glare Sensitivity', severity: 'mild', priority: 'medium' },
    { id: 'poor_night_vision', name: 'Poor Night Vision', severity: 'mild', priority: 'low' },
    { id: 'halos', name: 'Halos Around Lights', severity: 'mild', priority: 'low' },
    { id: 'contrast_reduction', name: 'Contrast Sensitivity Reduction', severity: 'mild', priority: 'medium' },
    { id: 'visual_noise', name: 'Visual Noise/Graininess', severity: 'mild', priority: 'low' },
    { id: 'motion_sensitivity', name: 'Motion Sensitivity Issues', severity: 'mild', priority: 'low' },
  ],

  //  F. NEURO-VISUAL & FUNCTIONAL CONDITIONS (6 conditions - EDUCATIONAL ONLY)
  neurovisual: [
    { id: 'visual_processing_fatigue', name: 'Visual Processing Fatigue', severity: 'moderate', priority: 'medium' },
    { id: 'delayed_pupil_response', name: 'Delayed Pupil Response (Educational)', severity: 'mild', priority: 'low' },
    { id: 'visual_attention_deficiency', name: 'Visual Attention Deficiency', severity: 'mild', priority: 'low' },
    { id: 'visual_reaction_delay', name: 'Visual Reaction Time Delay', severity: 'mild', priority: 'low' },
    { id: 'screen_migraines', name: 'Screen-Triggered Migraines', severity: 'severe', priority: 'high' },
    { id: 'post_concussion_visual', name: 'Post-Concussion Visual Sensitivity (Ed.)', severity: 'moderate', priority: 'low' },
  ],

  // 🟤 G. PEDIATRIC & TEEN-FOCUSED CONDITIONS (5 conditions)
  pediatric: [
    { id: 'myopia_progression_children', name: 'Myopia Progression (Children/Teens)', severity: 'severe', priority: 'high' },
    { id: 'teen_screen_strain', name: 'Screen-Related Vision Strain (Teens)', severity: 'moderate', priority: 'high' },
    { id: 'poor_visual_habits', name: 'Poor Visual Habits Development', severity: 'mild', priority: 'medium' },
    { id: 'learning_visual_fatigue', name: 'Learning-Related Visual Fatigue', severity: 'moderate', priority: 'medium' },
    { id: 'reading_eye_strain', name: 'Reading-Induced Eye Strain', severity: 'mild', priority: 'medium' },
  ],

  // ⚪ H. AGE-RELATED & RISK-AWARENESS CONDITIONS (6 conditions - ALWAYS INCLUDE "SEE DOCTOR")
  age_related: [
    { id: 'early_presbyopia', name: 'Early Presbyopia', severity: 'mild', priority: 'medium' },
    { id: 'age_contrast_decline', name: 'Age-Related Contrast Decline', severity: 'mild', priority: 'low' },
    { id: 'glaucoma_risk', name: 'Glaucoma Risk Awareness', severity: 'severe', priority: 'high' },
    { id: 'macular_health', name: 'Macular Health Awareness', severity: 'severe', priority: 'high' },
    { id: 'cataract_risk', name: 'Cataract Risk Education', severity: 'moderate', priority: 'medium' },
    { id: 'age_dry_eye', name: 'Age-Related Dry Eye Increase', severity: 'mild', priority: 'medium' },
  ],

  // 🟫 I. ENVIRONMENTAL & HABIT-LINKED CONDITIONS (5 conditions)
  environmental: [
    { id: 'low_humidity_stress', name: 'Low-Humidity Eye Stress', severity: 'mild', priority: 'medium' },
    { id: 'ac_dryness', name: 'Air-Conditioning-Related Dryness', severity: 'mild', priority: 'medium' },
    { id: 'poor_lighting_strain', name: 'Poor Lighting Eye Stress', severity: 'mild', priority: 'medium' },
    { id: 'screen_distance_strain', name: 'Improper Screen Distance Strain', severity: 'mild', priority: 'medium' },
    { id: 'excessive_nearwork', name: 'Excessive Near-Work Stress', severity: 'moderate', priority: 'high' },
  ],

  //  J. SYMPTOM-BASED "CONDITIONS" (7 conditions - EXCELLENT FOR AI MATCHING)
  symptom_based: [
    { id: 'chronic_tiredness', name: 'Chronic Eye Tiredness', severity: 'mild', priority: 'high' },
    { id: 'burning_after_screens', name: 'Burning After Screens', severity: 'mild', priority: 'high' },
    { id: 'blurry_after_reading', name: 'Blurry Vision After Reading', severity: 'mild', priority: 'medium' },
    { id: 'eyes_feel_heavy', name: 'Eyes Feel Heavy', severity: 'mild', priority: 'medium' },
    { id: 'difficulty_refocusing', name: 'Difficulty Refocusing', severity: 'mild', priority: 'medium' },
    { id: 'dry_but_watering', name: 'Eyes Feel Dry but Watering', severity: 'mild', priority: 'medium' },
    { id: 'eyes_sore_night', name: 'Eyes Feel Sore at Night', severity: 'mild', priority: 'medium' },
  ],
}

// Detailed condition information (full data for major conditions)
export const EYE_CONDITIONS = {
  //  A. PREVENTABLE & LIFESTYLE-RELATED CONDITIONS
  digital_eye_strain: {
    name: 'Digital Eye Strain',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'high',
    description: 'Eye discomfort from prolonged digital device use, causing fatigue and vision problems.',
    symptoms: [
      'Eye fatigue and tiredness',
      'Blurred vision after screen use',
      'Dry, irritated eyes',
      'Headaches (especially frontal)',
      'Neck and shoulder pain',
      'Difficulty focusing',
      'Light sensitivity',
      'Watery eyes (paradoxical)',
    ],
    riskFactors: [
      {
        factor: 'Screen Time > 6 hours/day',
        description: 'Prolonged digital device use without adequate breaks',
        impact: 'high',
        threshold: '> 6 hours',
      },
      {
        factor: 'Low Blink Rate',
        description: 'Reduced blinking during screen use (drops by 50-60%)',
        impact: 'high',
        threshold: '< 12 blinks/min',
      },
      {
        factor: 'Poor Ergonomics',
        description: 'Incorrect screen distance, height, or viewing angle',
        impact: 'medium',
        threshold: 'Screen < 20" or > 30" away',
      },
      {
        factor: 'No Regular Breaks',
        description: 'Continuous screen work without the 20-20-20 rule',
        impact: 'high',
        threshold: 'No breaks for > 20 min',
      },
    ],
    prevention: [
      {
        action: 'Follow 20-20-20 rule',
        description: 'Every 20 minutes, look 20 feet away for 20 seconds',
        frequency: 'Every 20 minutes',
      },
      {
        action: 'Optimize screen setup',
        description: 'Position screen 20-26 inches away, slightly below eye level',
        frequency: 'One-time setup',
      },
      {
        action: 'Increase blink frequency',
        description: 'Consciously blink fully and frequently during screen time',
        frequency: 'Continuous',
      },
      {
        action: 'Use proper lighting',
        description: 'Reduce glare, use ambient lighting, avoid bright backgrounds',
        frequency: 'Continuous',
      },
    ],
    warningSigns: [
      'Symptoms persisting beyond 2 weeks',
      'Progressive vision deterioration',
      'Severe headaches or eye pain',
      'Symptoms interfering with daily tasks',
    ],
    appTests: ['eye_tracking', 'fatigue_score', 'blink_analysis'],
  },

  dry_eye_disease: {
    name: 'Dry Eye Disease',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'high',
    description: 'Chronic condition where tears fail to provide adequate lubrication for the eyes.',
    symptoms: [
      'Burning or stinging sensation',
      'Gritty feeling (like sand in eyes)',
      'Excessive tearing (reflex tears)',
      'Redness and irritation',
      'Light sensitivity',
      'Mucus discharge',
      'Difficulty wearing contact lenses',
      'Blurred vision that improves with blinking',
    ],
    riskFactors: [
      {
        factor: 'Screen Use > 4 hours/day',
        description: 'Reduced blink rate during prolonged screen time',
        impact: 'high',
        threshold: '> 4 hours',
      },
      {
        factor: 'Age > 50',
        description: 'Tear production naturally decreases with aging',
        impact: 'medium',
        threshold: '> 50 years',
      },
      {
        factor: 'Low Environmental Humidity',
        description: 'Dry air accelerates tear evaporation',
        impact: 'medium',
        threshold: '< 30% humidity',
      },
      {
        factor: 'Blink Rate < 10/min',
        description: 'Insufficient blinking prevents tear distribution',
        impact: 'high',
        threshold: '< 10 blinks/min',
      },
    ],
    prevention: [
      {
        action: 'Use artificial tears',
        description: 'Apply preservative-free lubricating drops regularly',
        frequency: '3-4 times daily',
      },
      {
        action: 'Increase humidity',
        description: 'Use humidifier, especially in heated/air-conditioned spaces',
        frequency: 'Daily',
      },
      {
        action: 'Blink consciously',
        description: 'Practice complete, full blinks during screen use',
        frequency: 'Continuous',
      },
      {
        action: 'Stay hydrated',
        description: 'Drink adequate water throughout the day',
        frequency: 'Daily',
      },
    ],
    warningSigns: [
      'Persistent pain or redness',
      'Vision changes',
      'Discharge or crusting',
      'Worsening despite treatment',
    ],
    appTests: ['dry_eye', 'eye_tracking', 'blink_analysis'],
  },

  eye_fatigue_asthenopia: {
    name: 'Eye Fatigue (Asthenopia)',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'high',
    description: 'General eye tiredness from sustained visual tasks or focusing effort.',
    symptoms: [
      'Tired, heavy eyes',
      'Sore or aching eyes',
      'Watery eyes',
      'Difficulty maintaining focus',
      'Headaches',
      'Temporary blurred vision',
    ],
    riskFactors: [
      {
        factor: 'Extended Reading/Screen Time',
        description: 'Prolonged near-focus activities strain eye muscles',
        impact: 'high',
        threshold: '> 2 hours continuous',
      },
      {
        factor: 'Poor Lighting',
        description: 'Inadequate or harsh lighting increases eye strain',
        impact: 'medium',
        threshold: 'N/A',
      },
      {
        factor: 'Insufficient Sleep',
        description: 'Lack of rest amplifies eye fatigue',
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
        description: 'Use task lighting, avoid glare and harsh contrasts',
        frequency: 'Continuous',
      },
      {
        action: 'Get adequate sleep',
        description: 'Aim for 7-9 hours to allow eye recovery',
        frequency: 'Daily',
      },
    ],
    warningSigns: [
      'Persistent fatigue despite rest',
      'Progressive worsening',
      'Eye pain',
      'Significant impact on daily life',
    ],
    appTests: ['eye_tracking', 'fatigue_score', 'focus_endurance'],
  },

  reduced_blink_rate: {
    name: 'Reduced Blink Rate Syndrome',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'high',
    description: 'Unconscious reduction in blink frequency during screen use, leading to dryness.',
    symptoms: [
      'Dry eyes',
      'Burning sensation',
      'Eye irritation',
      'Redness',
      'Blurred vision',
    ],
    riskFactors: [
      {
        factor: 'Screen Concentration',
        description: 'Intense focus on screens reduces natural blink reflex',
        impact: 'high',
        threshold: 'Blink rate < 12/min',
      },
    ],
    prevention: [
      {
        action: 'Conscious blinking',
        description: 'Set reminders to blink fully every few seconds',
        frequency: 'Continuous during screen use',
      },
      {
        action: 'Blink exercises',
        description: 'Practice complete blinks (squeeze shut, then relax)',
        frequency: 'Every hour',
      },
    ],
    warningSigns: ['Chronic dryness', 'Eye surface damage'],
    appTests: ['blink_analysis', 'blink_rate_tracking'],
  },

  incomplete_blink: {
    name: 'Incomplete Blink Syndrome',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'medium',
    description: 'Partial eyelid closure during blinking, failing to fully lubricate the eye surface.',
    symptoms: [
      'Persistent dryness despite frequent blinking',
      'Gritty feeling',
      'Eye fatigue',
    ],
    riskFactors: [
      {
        factor: 'Screen Focus',
        description: 'Intense concentration prevents complete blink closure',
        impact: 'high',
        threshold: 'Partial closure detected',
      },
    ],
    prevention: [
      {
        action: 'Full blink practice',
        description: 'Consciously close eyelids completely during blinks',
        frequency: 'Continuous',
      },
    ],
    warningSigns: ['Worsening dry eye', 'Corneal exposure'],
    appTests: ['blink_completeness_analysis'],
  },

  blue_light_sensitivity: {
    name: 'Blue Light Sensitivity',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'medium',
    description: 'Increased discomfort from exposure to blue light emitted by digital screens.',
    symptoms: [
      'Eye strain from screens',
      'Headaches after device use',
      'Difficulty sleeping after evening screen time',
      'Visual discomfort',
    ],
    riskFactors: [
      {
        factor: 'Evening Screen Use',
        description: 'Blue light exposure before bed disrupts circadian rhythm',
        impact: 'medium',
        threshold: 'Screen use within 2h of sleep',
      },
    ],
    prevention: [
      {
        action: 'Use blue light filters',
        description: 'Enable night mode or use blue-blocking glasses',
        frequency: 'Evening hours',
      },
      {
        action: 'Reduce evening screens',
        description: 'Minimize device use 2 hours before bedtime',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Sleep disturbances', 'Chronic headaches'],
    appTests: ['screen_time_tracking', 'environment_analysis'],
  },

  screen_induced_headaches: {
    name: 'Screen-Induced Headaches',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'high',
    description: 'Recurrent headaches triggered by prolonged screen use.',
    symptoms: [
      'Frontal headaches',
      'Tension-type headaches',
      'Eye pressure sensation',
      'Neck tension',
    ],
    riskFactors: [
      {
        factor: 'Poor Posture',
        description: 'Incorrect head/neck position during screen use',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Screen Brightness',
        description: 'Excessive contrast between screen and environment',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Adjust screen brightness',
        description: 'Match screen brightness to ambient lighting',
        frequency: 'As needed',
      },
      {
        action: 'Improve posture',
        description: 'Maintain neutral neck position, proper chair height',
        frequency: 'Continuous',
      },
    ],
    warningSigns: ['Severe headaches', 'Migraines', 'Vision changes'],
    appTests: ['fatigue_score', 'posture_analysis'],
  },

  accommodation_fatigue: {
    name: 'Accommodation Fatigue',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'medium',
    description: 'Tiredness of the eye focusing muscles from sustained near work.',
    symptoms: [
      'Blurred distance vision after near work',
      'Difficulty refocusing between distances',
      'Eye strain',
      'Headaches',
    ],
    riskFactors: [
      {
        factor: 'Prolonged Near Work',
        description: 'Extended reading, screen use without distance breaks',
        impact: 'high',
        threshold: '> 30 min continuous',
      },
    ],
    prevention: [
      {
        action: 'Distance breaks',
        description: 'Look at distant objects regularly (20-20-20 rule)',
        frequency: 'Every 20 minutes',
      },
      {
        action: 'Focus exercises',
        description: 'Practice near-far focusing to strengthen flexibility',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Persistent blur', 'Focus difficulty'],
    appTests: ['focus_flexibility', 'accommodation_test'],
  },

  visual_stress: {
    name: 'Visual Stress',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'medium',
    description: 'Perceptual processing difficulties when viewing text or patterns.',
    symptoms: [
      'Text appears to move or blur',
      'Difficulty reading',
      'Headaches while reading',
      'Light sensitivity',
    ],
    riskFactors: [
      {
        factor: 'High-Contrast Displays',
        description: 'Stark black-on-white text causes discomfort',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Use colored overlays',
        description: 'Tinted screens or backgrounds reduce contrast',
        frequency: 'Continuous',
      },
      {
        action: 'Adjust text formatting',
        description: 'Increase line spacing, use serif fonts',
        frequency: 'As needed',
      },
    ],
    warningSigns: ['Reading difficulties', 'Chronic headaches'],
    appTests: ['contrast_sensitivity', 'visual_perception'],
  },

  poor_focus_endurance: {
    name: 'Poor Focus Endurance',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'low',
    description: 'Inability to sustain clear focus during extended visual tasks.',
    symptoms: [
      'Progressive blur during reading',
      'Need to take frequent breaks',
      'Eye fatigue',
    ],
    riskFactors: [
      {
        factor: 'Weak Eye Muscles',
        description: 'Insufficient focus stamina from lack of training',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Focus training exercises',
        description: 'Gradually increase sustained near-work duration',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Declining reading ability'],
    appTests: ['focus_endurance_test'],
  },

  screen_headaches: {
    name: 'Screen-Induced Headaches',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'high',
    description: 'Headaches specifically triggered or worsened by screen use.',
    symptoms: [
      'Frontal headaches',
      'Temple pain',
      'Tension headaches',
      'Worse after screen time',
      'Relief away from screens',
    ],
    riskFactors: [
      {
        factor: 'Poor Screen Ergonomics',
        description: 'Incorrect screen height, distance, or angle',
        impact: 'high',
        threshold: 'Screen above eye level or < 20 inches',
      },
      {
        factor: 'Eye Strain',
        description: 'Uncorrected vision problems or excessive use',
        impact: 'high',
        threshold: '> 4 hours continuous',
      },
      {
        factor: 'Poor Lighting',
        description: 'Glare or insufficient lighting',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Optimize ergonomics',
        description: 'Screen at arm\'s length, top at/below eye level',
        frequency: 'Always',
      },
      {
        action: '20-20-20 rule',
        description: 'Break every 20 minutes',
        frequency: 'Every 20 min',
      },
      {
        action: 'Check vision',
        description: 'Get eye exam to rule out prescription needs',
        frequency: 'If persistent',
      },
    ],
    warningSigns: ['Severe headaches', 'Migraines', 'Nausea', 'Vision changes'],
    appTests: ['screen_time', 'ergonomic_assessment', 'visual_acuity'],
  },

  screen_migraines: {
    name: 'Screen-Triggered Migraines',
    category: 'preventable_lifestyle',
    severity: 'severe',
    priority: 'high',
    description: 'Migraine headaches specifically triggered by screen use or visual stimuli.',
    symptoms: [
      'Severe headache',
      'Nausea',
      'Light sensitivity',
      'Visual aura',
      'Throbbing pain',
      'Triggered by screens',
    ],
    riskFactors: [
      {
        factor: 'Migraine history',
        description: 'Personal or family history of migraines',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Screen brightness',
        description: 'Bright or flickering screens',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Blue light exposure',
        description: 'High energy light from screens',
        impact: 'medium',
        threshold: '> 4 hours daily',
      },
    ],
    prevention: [
      {
        action: 'Reduce screen brightness',
        description: 'Match ambient lighting',
        frequency: 'Always',
      },
      {
        action: 'Use blue light filters',
        description: 'Software or glasses',
        frequency: 'Always',
      },
      {
        action: 'Frequent breaks',
        description: 'Rest eyes every 20-30 minutes',
        frequency: 'Every 20-30 min',
      },
      {
        action: 'Consult neurologist',
        description: 'For migraine management',
        frequency: 'If frequent',
      },
    ],
    warningSigns: ['Increasing frequency', 'Severe symptoms', 'Vision loss during attacks'],
    appTests: ['screen_time', 'light_sensitivity', 'migraine_tracking'],
  },

  //  B. REFRACTIVE & FOCUS CONDITIONS
  myopia: {
    name: 'Myopia (Nearsightedness)',
    category: 'refractive',
    severity: 'moderate',
    priority: 'high',
    description: 'Distant objects appear blurry while near objects remain clear.',
    symptoms: [
      'Blurred distance vision',
      'Squinting to see far',
      'Headaches',
      'Eye strain',
      'Difficulty seeing board/TV',
    ],
    riskFactors: [
      {
        factor: 'Genetics',
        description: 'Family history significantly increases risk',
        impact: 'high',
        threshold: 'Parent(s) myopic',
      },
      {
        factor: 'Excessive Near Work',
        description: 'Prolonged reading, screens without breaks',
        impact: 'high',
        threshold: '> 6 hours/day',
      },
      {
        factor: 'Limited Outdoor Time',
        description: 'Lack of natural light exposure',
        impact: 'high',
        threshold: '< 1 hour/day outdoors',
      },
    ],
    prevention: [
      {
        action: 'Increase outdoor time',
        description: 'Spend 2+ hours daily in natural light (especially children)',
        frequency: 'Daily',
      },
      {
        action: 'Limit near work',
        description: 'Take breaks from reading and screens',
        frequency: 'Every 20-30 minutes',
      },
    ],
    warningSigns: [
      'Rapidly worsening distance vision',
      'Frequent prescription changes',
    ],
    appTests: ['visual_acuity', 'distance_vision'],
  },

  hyperopia: {
    name: 'Hyperopia (Farsightedness)',
    category: 'refractive',
    severity: 'mild',
    priority: 'medium',
    description: 'Near objects appear blurry while distant objects remain clearer.',
    symptoms: [
      'Blurred near vision',
      'Eye strain during reading',
      'Headaches',
      'Difficulty focusing on close tasks',
    ],
    riskFactors: [
      {
        factor: 'Genetics',
        description: 'Inherited eye shape causes hyperopia',
        impact: 'high',
        threshold: 'Family history',
      },
    ],
    prevention: [
      {
        action: 'Get eye exams',
        description: 'Regular check-ups to monitor and correct',
        frequency: 'Annually',
      },
    ],
    warningSigns: ['Increasing near vision difficulty', 'Severe headaches'],
    appTests: ['visual_acuity', 'near_vision'],
  },

  astigmatism: {
    name: 'Astigmatism',
    category: 'refractive',
    severity: 'mild',
    priority: 'medium',
    description: 'Irregular corneal shape causes blurred or distorted vision at all distances.',
    symptoms: [
      'Blurred vision',
      'Distorted vision',
      'Eye strain',
      'Headaches',
      'Difficulty with night vision',
    ],
    riskFactors: [
      {
        factor: 'Genetics',
        description: 'Often present from birth',
        impact: 'high',
        threshold: 'Family history',
      },
    ],
    prevention: [
      {
        action: 'Regular eye exams',
        description: 'Monitor and correct with glasses/contacts',
        frequency: 'Annually',
      },
    ],
    warningSigns: ['Worsening vision', 'Severe distortion'],
    appTests: ['visual_acuity', 'contrast_sensitivity'],
  },

  presbyopia: {
    name: 'Presbyopia',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Age-related loss of near focusing ability, typically starting after age 40.',
    symptoms: [
      'Difficulty reading small print',
      'Need to hold reading material farther away',
      'Eye strain during near work',
      'Headaches',
    ],
    riskFactors: [
      {
        factor: 'Age > 40',
        description: 'Natural aging of the eye lens',
        impact: 'high',
        threshold: '> 40 years',
      },
    ],
    prevention: [
      {
        action: 'No prevention (natural aging)',
        description: 'Use reading glasses or progressive lenses as needed',
        frequency: 'As recommended',
      },
    ],
    warningSigns: ['Sudden vision changes', 'Severe difficulty'],
    appTests: ['near_vision', 'accommodation'],
  },

  progressive_myopia: {
    name: 'Progressive Myopia',
    category: 'refractive',
    severity: 'severe',
    priority: 'high',
    description: 'Worsening nearsightedness over time, especially in children and teens.',
    symptoms: [
      'Steadily worsening distance vision',
      'Frequent prescription changes',
      'Squinting',
      'Headaches',
    ],
    riskFactors: [
      {
        factor: 'Age 8-18',
        description: 'Peak myopia progression years',
        impact: 'high',
        threshold: 'Ages 8-18',
      },
      {
        factor: 'Genetics',
        description: 'Family history accelerates progression',
        impact: 'high',
        threshold: 'Parent(s) myopic',
      },
      {
        factor: 'High Screen Time',
        description: 'Excessive near work fuels progression',
        impact: 'high',
        threshold: '> 6 hours/day',
      },
    ],
    prevention: [
      {
        action: 'Outdoor time',
        description: 'Minimum 2 hours daily in natural light',
        frequency: 'Daily',
      },
      {
        action: 'Myopia control options',
        description: 'Consider atropine drops, specialized contacts (see doctor)',
        frequency: 'As prescribed',
      },
    ],
    warningSigns: [
      'Rapid progression (> 0.5D per year)',
      'High myopia (> -6.00D)',
    ],
    appTests: ['visual_acuity', 'progression_tracking'],
  },

  focus_flexibility: {
    name: 'Focus Flexibility Deficiency',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Difficulty quickly adjusting focus between near and far distances.',
    symptoms: [
      'Slow refocusing',
      'Blurred vision when switching distances',
      'Eye strain',
      'Fatigue',
    ],
    riskFactors: [
      {
        factor: 'Age',
        description: 'Focus flexibility declines with age',
        impact: 'medium',
        threshold: '> 40 years',
      },
      {
        factor: 'Lack of practice',
        description: 'Minimal distance changes during day',
        impact: 'low',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Focus exercises',
        description: 'Practice near-far focusing drills',
        frequency: 'Daily',
      },
      {
        action: 'Vary working distances',
        description: 'Alternate between near and distance tasks',
        frequency: 'Throughout day',
      },
    ],
    warningSigns: ['Worsening flexibility', 'Daily life impact'],
    appTests: ['accommodation_flexibility'],
  },

  blur_adaptation: {
    name: 'Blur Adaptation Issues',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Brain struggles to adapt to persistent blur or new prescription.',
    symptoms: [
      'Discomfort with new glasses',
      'Headaches',
      'Eye strain',
      'Nausea',
      'Dizziness',
    ],
    riskFactors: [
      {
        factor: 'Significant prescription change',
        description: 'Large change in lens power',
        impact: 'high',
        threshold: '> 0.75D change',
      },
      {
        factor: 'First-time glasses',
        description: 'Never worn correction before',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Gradual adaptation',
        description: 'Wear new glasses progressively longer each day',
        frequency: 'First week',
      },
      {
        action: 'Follow-up exam',
        description: 'Verify prescription if discomfort persists',
        frequency: 'After 2 weeks',
      },
    ],
    warningSigns: ['Persistent discomfort after 2 weeks', 'Worsening symptoms'],
    appTests: ['visual_acuity', 'prescription_verification'],
  },

  // 🟠 C. BINOCULAR & COORDINATION CONDITIONS
  strabismus_ed: {
    name: 'Focus Flexibility Deficiency',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Difficulty quickly adjusting focus between near and far distances.',
    symptoms: [
      'Slow refocusing',
      'Blurred vision when switching distances',
      'Eye strain',
    ],
    riskFactors: [
      {
        factor: 'Age',
        description: 'Focus flexibility declines with age',
        impact: 'medium',
        threshold: '> 40 years',
      },
    ],
    prevention: [
      {
        action: 'Focus exercises',
        description: 'Practice near-far focusing drills',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Worsening flexibility'],
    appTests: ['accommodation_flexibility'],
  },

  blur_adaptation_issues: {
    name: 'Blur Adaptation Issues',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Brain struggles to adapt to persistent blur, causing discomfort.',
    symptoms: [
      'Persistent discomfort with corrected blur',
      'Headaches',
      'Eye strain',
    ],
    riskFactors: [
      {
        factor: 'New Prescription',
        description: 'Recent change in glasses/contacts',
        impact: 'medium',
        threshold: 'Within 2 weeks',
      },
    ],
    prevention: [
      {
        action: 'Gradual adaptation',
        description: 'Wear new prescription progressively longer each day',
        frequency: 'First week',
      },
    ],
    warningSigns: ['Persistent discomfort after 2 weeks'],
    appTests: ['visual_acuity'],
  },

  //  C. BINOCULAR & COORDINATION CONDITIONS (Adding more details)
  strabismus_ed: {
    name: 'Strabismus (Eye Misalignment) - Educational',
    category: 'binocular',
    severity: 'moderate',
    priority: 'high',
    description: 'Eyes do not align properly; one may turn in, out, up, or down.',
    symptoms: [
      'Visible eye misalignment',
      'Double vision',
      'Closing one eye to see',
      'Tilting head',
      'Eye strain',
    ],
    riskFactors: [
      {
        factor: 'Childhood onset',
        description: 'Often develops in early childhood',
        impact: 'high',
        threshold: '< 6 years old',
      },
      {
        factor: 'Family history',
        description: 'Genetic predisposition',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Early detection',
        description: 'Regular pediatric eye exams',
        frequency: 'Annually starting age 3',
      },
      {
        action: 'Vision therapy',
        description: 'Exercises may help mild cases (consult doctor)',
        frequency: 'As prescribed',
      },
    ],
    warningSigns: ['Sudden onset', 'Worsening misalignment', 'Vision loss'],
    appTests: ['binocular_alignment', 'depth_perception'],
  },

  divergence_insufficiency: {
    name: 'Divergence Insufficiency',
    category: 'binocular',
    severity: 'moderate',
    priority: 'medium',
    description: 'Difficulty diverging eyes to look at distant objects.',
    symptoms: [
      'Double vision at distance',
      'Eye strain looking far',
      'Headaches',
      'Closing one eye',
    ],
    riskFactors: [
      {
        factor: 'Prolonged near work',
        description: 'Weakens divergence ability',
        impact: 'high',
        threshold: '> 8 hours daily',
      },
    ],
    prevention: [
      {
        action: 'Distance viewing breaks',
        description: 'Look at distant objects regularly',
        frequency: 'Every 30 minutes',
      },
      {
        action: 'Eye exercises',
        description: 'Divergence strengthening exercises',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Persistent double vision', 'Worsening symptoms'],
    appTests: ['divergence_test', 'distance_binocular_vision'],
  },

  convergence_insufficiency: {
    name: 'Convergence Insufficiency',
    category: 'binocular',
    severity: 'moderate',
    priority: 'medium',
    description: 'Difficulty converging eyes for near tasks, causing double vision and strain.',
    symptoms: [
      'Double vision when reading',
      'Eye strain',
      'Headaches',
      'Difficulty concentrating',
      'Closing one eye',
      'Words moving on page',
    ],
    riskFactors: [
      {
        factor: 'Prolonged near work',
        description: 'Excessive reading or screen time',
        impact: 'high',
        threshold: '> 6 hours daily',
      },
      {
        factor: 'Age',
        description: 'Can develop at any age',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Vision therapy',
        description: 'Eye exercises to strengthen convergence',
        frequency: 'As prescribed',
      },
      {
        action: 'Take breaks',
        description: 'Rest eyes during near work',
        frequency: 'Every 20-30 minutes',
      },
      {
        action: 'Eye exam',
        description: 'Get evaluated for treatment options',
        frequency: 'If symptoms present',
      },
    ],
    warningSigns: ['Persistent double vision', 'Reading difficulties', 'Academic struggles'],
    appTests: ['convergence_test', 'near_point_convergence', 'binocular_vision'],
  },

  eye_tracking_instability: {
    name: 'Eye Tracking Instability',
    category: 'binocular',
    severity: 'moderate',
    priority: 'high',
    description: 'Difficulty smoothly following moving objects or reading lines of text.',
    symptoms: [
      'Losing place when reading',
      'Difficulty tracking moving objects',
      'Eye fatigue',
      'Headaches',
      'Slow reading speed',
    ],
    riskFactors: [
      {
        factor: 'Learning tasks',
        description: 'Affects reading and sports performance',
        impact: 'high',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Eye tracking exercises',
        description: 'Practice following moving targets smoothly',
        frequency: 'Daily',
      },
      {
        action: 'Vision therapy',
        description: 'Professional therapy can improve tracking',
        frequency: 'As prescribed',
      },
    ],
    warningSigns: ['Severe reading difficulties', 'Academic struggles'],
    appTests: ['eye_tracking', 'smooth_pursuit'],
  },

  poor_fixation: {
    name: 'Poor Fixation Stability',
    category: 'binocular',
    severity: 'mild',
    priority: 'medium',
    description: 'Eyes cannot hold steady gaze on stationary target.',
    symptoms: [
      'Text appears to jump or move',
      'Difficulty maintaining focus',
      'Eye strain',
      'Reading difficulties',
    ],
    riskFactors: [
      {
        factor: 'Neurological factors',
        description: 'May indicate underlying issues',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Fixation exercises',
        description: 'Practice holding steady gaze',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Worsening stability', 'Vision changes'],
    appTests: ['fixation_stability'],
  },

  // 💧 D. DRYNESS & SURFACE CONDITIONS (Adding more)
  evaporative_dry_eye: {
    name: 'Evaporative Dry Eye',
    category: 'surface_conditions',
    severity: 'moderate',
    priority: 'high',
    description: 'Tears evaporate too quickly due to meibomian gland dysfunction.',
    symptoms: [
      'Gritty, sandy sensation',
      'Burning eyes',
      'Redness',
      'Fluctuating vision',
      'Worse later in day',
    ],
    riskFactors: [
      {
        factor: 'Meibomian gland dysfunction',
        description: 'Blocked oil glands in eyelids',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Low blink quality',
        description: 'Incomplete blinks don\'t spread oil layer',
        impact: 'high',
        threshold: '< 50% complete blinks',
      },
      {
        factor: 'Screen time',
        description: 'Reduced blinking during digital use',
        impact: 'high',
        threshold: '> 4 hours',
      },
    ],
    prevention: [
      {
        action: 'Warm compresses',
        description: 'Heat eyelids to melt blocked oils',
        frequency: 'Twice daily',
      },
      {
        action: 'Lid massage',
        description: 'Gentle massage after warming',
        frequency: 'Twice daily',
      },
      {
        action: 'Omega-3 supplements',
        description: 'Improve oil quality',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Severe pain', 'Vision loss', 'Thick discharge'],
    appTests: ['dry_eye', 'tear_break_up_time', 'meibography', 'blink_analysis'],
  },

  aqueous_deficient_dry_eye: {
    name: 'Aqueous Deficient Dry Eye',
    category: 'surface_conditions',
    severity: 'moderate',
    priority: 'high',
    description: 'Lacrimal glands don\'t produce enough watery tears.',
    symptoms: [
      'Persistent dryness',
      'Foreign body sensation',
      'Pain',
      'Excessive reflex tearing',
      'Light sensitivity',
    ],
    riskFactors: [
      {
        factor: 'Age > 50',
        description: 'Tear production decreases with age',
        impact: 'high',
        threshold: '> 50 years',
      },
      {
        factor: 'Medications',
        description: 'Antihistamines, decongestants reduce tears',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Autoimmune diseases',
        description: 'Sjögren\'s syndrome affects tear glands',
        impact: 'high',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Artificial tears',
        description: 'Preservative-free drops 4+ times daily',
        frequency: 'Every 2-4 hours',
      },
      {
        action: 'Punctal plugs',
        description: 'Block tear drainage (see doctor)',
        frequency: 'Permanent option',
      },
      {
        action: 'Humidify environment',
        description: 'Maintain 40-60% humidity',
        frequency: 'Continuous',
      },
    ],
    warningSigns: ['Corneal damage', 'Severe pain', 'Vision changes'],
    appTests: ['dry_eye', 'schirmer_test', 'tear_osmolarity'],
  },

  allergic_irritation: {
    name: 'Allergic Eye Irritation',
    category: 'surface_conditions',
    severity: 'mild',
    priority: 'medium',
    description: 'Allergic reaction causing itchy, red, watery eyes.',
    symptoms: [
      'Itching (hallmark symptom)',
      'Redness',
      'Watery discharge',
      'Swollen eyelids',
      'Burning',
    ],
    riskFactors: [
      {
        factor: 'Allergen exposure',
        description: 'Pollen, dust, pet dander, mold',
        impact: 'high',
        threshold: 'Seasonal or chronic',
      },
      {
        factor: 'Contact lens wear',
        description: 'Allergens stick to lenses',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Avoid allergens',
        description: 'Minimize exposure to triggers',
        frequency: 'Continuous',
      },
      {
        action: 'Cold compresses',
        description: 'Reduce swelling and itching',
        frequency: 'As needed',
      },
      {
        action: 'Antihistamine drops',
        description: 'Over-the-counter or prescribed',
        frequency: 'As directed',
      },
    ],
    warningSigns: ['Severe swelling', 'Vision changes', 'Pain'],
    appTests: ['allergy_assessment'],
  },

  contact_lens_discomfort: {
    name: 'Contact Lens-Related Discomfort',
    category: 'surface_conditions',
    severity: 'moderate',
    priority: 'high',
    description: 'Dryness, irritation, or reduced wearing time with contact lenses.',
    symptoms: [
      'End-of-day dryness',
      'Lens awareness',
      'Blurred vision',
      'Redness after removal',
      'Reduced wearing time',
    ],
    riskFactors: [
      {
        factor: 'Overwear',
        description: 'Wearing lenses longer than recommended',
        impact: 'high',
        threshold: '> 12 hours daily',
      },
      {
        factor: 'Poor hygiene',
        description: 'Inadequate cleaning/replacement',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Screen time in lenses',
        description: 'Digital use dries lenses',
        impact: 'medium',
        threshold: '> 4 hours',
      },
    ],
    prevention: [
      {
        action: 'Proper hygiene',
        description: 'Clean and replace as directed',
        frequency: 'Daily',
      },
      {
        action: 'Rewetting drops',
        description: 'Use contact lens-compatible drops',
        frequency: 'As needed',
      },
      {
        action: 'Give eyes a break',
        description: 'Wear glasses at home in evenings',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Red eye with lens', 'Pain', 'Vision loss'],
    appTests: ['contact_lens_fit', 'corneal_health'],
  },

  // ... (continuing with more conditions)

  // 🌞 E. LIGHT & NIGHT VISION CONDITIONS
  glare_sensitivity: {
    name: 'Glare Sensitivity',
    category: 'light_perception',
    severity: 'moderate',
    priority: 'medium',
    description: 'Excessive discomfort or vision loss in bright light or from reflections.',
    symptoms: [
      'Difficulty seeing in bright light',
      'Halos around lights',
      'Squinting',
      'Headaches in bright settings',
      'Difficulty driving at night (oncoming lights)',
    ],
    riskFactors: [
      {
        factor: 'Light-colored eyes',
        description: 'Less pigment = more light enters',
        impact: 'medium',
        threshold: 'Blue/green eyes',
      },
      {
        factor: 'Dry eyes',
        description: 'Irregular tear film scatters light',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Cataracts',
        description: 'Lens clouding increases glare',
        impact: 'high',
        threshold: '> 60 years',
      },
    ],
    prevention: [
      {
        action: 'Polarized sunglasses',
        description: 'Reduce glare outdoors',
        frequency: 'When outside',
      },
      {
        action: 'Anti-reflective coating',
        description: 'On glasses to minimize reflections',
        frequency: 'Always',
      },
      {
        action: 'Treat underlying dryness',
        description: 'Address dry eye if present',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Sudden onset', 'Worsening sensitivity', 'Vision changes'],
    appTests: ['glare_testing', 'contrast_sensitivity'],
  },

  poor_night_vision: {
    name: 'Poor Night Vision (Nyctalopia)',
    category: 'light_perception',
    severity: 'moderate',
    priority: 'medium',
    description: 'Difficulty seeing in low light or darkness.',
    symptoms: [
      'Trouble navigating in dim light',
      'Difficulty driving at night',
      'Slow dark adaptation',
      'Frequent bumping into things at night',
    ],
    riskFactors: [
      {
        factor: 'Vitamin A deficiency',
        description: 'Essential for rod cell function',
        impact: 'high',
        threshold: 'Dietary deficiency',
      },
      {
        factor: 'Retinal conditions',
        description: 'Retinitis pigmentosa, other disorders',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'High myopia',
        description: 'Severe nearsightedness affects rods',
        impact: 'medium',
        threshold: '> -6.00D',
      },
    ],
    prevention: [
      {
        action: 'Adequate Vitamin A',
        description: 'Carrots, sweet potatoes, leafy greens',
        frequency: 'Daily',
      },
      {
        action: 'Eye exam',
        description: 'Rule out serious conditions',
        frequency: 'Annually',
      },
      {
        action: 'Brighter lighting',
        description: 'Use nightlights, adequate home lighting',
        frequency: 'Continuous',
      },
    ],
    warningSigns: ['Progressive worsening', 'Daytime vision loss', 'Peripheral vision loss'],
    appTests: ['dark_adaptation', 'night_vision_assessment'],
  },

  // ... (I'll add more in batches to keep response manageable)

  // 🔵 J. SYMPTOM-BASED CONDITIONS (more details)
  burning_after_screens: {
    name: 'Burning Sensation After Screen Use',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'high',
    description: 'Burning, stinging eyes specifically triggered by digital device use.',
    symptoms: [
      'Burning sensation during/after screens',
      'Stinging eyes',
      'Sensation improves away from screens',
      'Redness',
    ],
    riskFactors: [
      {
        factor: 'Reduced blink rate',
        description: 'Screen use cuts blink rate by 50%',
        impact: 'high',
        threshold: '< 10 blinks/min',
      },
      {
        factor: 'Dry environment',
        description: 'AC, heating dry tears faster',
        impact: 'medium',
        threshold: '< 30% humidity',
      },
    ],
    prevention: [
      {
        action: 'Conscious blinking',
        description: 'Blink fully every 10-15 seconds',
        frequency: 'During screen use',
      },
      {
        action: 'Lubricating drops',
        description: 'Before and during extended use',
        frequency: 'Every 2 hours',
      },
      {
        action: '20-20-20 rule',
        description: 'Break every 20 minutes',
        frequency: 'Every 20 min',
      },
    ],
    warningSigns: ['Persistent burning off-screen', 'Vision changes'],
    appTests: ['blink_analysis', 'tear_quality'],
  },

  blurry_after_reading: {
    name: 'Blurry Vision After Reading',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'medium',
    description: 'Vision becomes blurry during or after sustained reading or near work.',
    symptoms: [
      'Blur after 20-30 minutes of reading',
      'Difficulty refocusing to distance',
      'Eye fatigue',
      'Improved with rest',
    ],
    riskFactors: [
      {
        factor: 'Uncorrected refractive error',
        description: 'Need for reading glasses',
        impact: 'high',
        threshold: '> 40 years',
      },
      {
        factor: 'Convergence insufficiency',
        description: 'Eyes struggle to maintain alignment',
        impact: 'high',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Eye exam',
        description: 'Check if reading glasses needed',
        frequency: 'If persistent',
      },
      {
        action: 'Frequent breaks',
        description: 'Look away every 20 minutes',
        frequency: 'Every 20 min',
      },
    ],
    warningSigns: ['Worsening blur', 'Headaches', 'Double vision'],
    appTests: ['near_vision', 'convergence', 'accommodation'],
  },

  dry_but_watering: {
    name: 'Eyes Feel Dry but Watering',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'medium',
    description: 'Paradoxical dry eye where eyes water excessively as reflex to dryness.',
    symptoms: [
      'Eyes feel dry',
      'Excessive watering/tearing',
      'Fluctuating vision',
      'Redness',
    ],
    riskFactors: [
      {
        factor: 'Underlying dry eye',
        description: 'Reflex tearing from irritation',
        impact: 'high',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Treat underlying dryness',
        description: 'Regular lubricating drops',
        frequency: '4+ times daily',
      },
      {
        action: 'Warm compresses',
        description: 'Improve oil gland function',
        frequency: 'Twice daily',
      },
    ],
    warningSigns: ['Severe tearing', 'Vision loss', 'Pain'],
    appTests: ['dry_eye', 'tear_function'],
  },

  // ... (end of additions)

  //  A. PREVENTABLE & LIFESTYLE - REMAINING CONDITIONS
  eye_fatigue: {
    name: 'Eye Fatigue',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'medium',
    description: 'General tiredness and discomfort in the eyes from prolonged use.',
    symptoms: ['Heavy eyelids', 'Difficulty keeping eyes open', 'Tired feeling', 'Mild discomfort'],
    riskFactors: [
      { factor: 'Long work hours', description: 'Extended visual tasks without breaks', impact: 'high', threshold: '> 8 hours' },
      { factor: 'Poor sleep', description: 'Inadequate rest', impact: 'high', threshold: '< 7 hours' },
    ],
    prevention: [
      { action: 'Adequate sleep', description: '7-9 hours nightly', frequency: 'Daily' },
      { action: 'Regular breaks', description: 'Rest eyes every hour', frequency: 'Hourly' },
    ],
    warningSigns: ['Persistent despite rest', 'Vision changes'],
    appTests: ['fatigue_score', 'rest_tracking'],
  },

  reduced_blink_rate: {
    name: 'Reduced Blink Rate',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'high',
    description: 'Decreased blinking frequency during screen use, causing dryness.',
    symptoms: ['Dry eyes', 'Burning sensation', 'Redness', 'Irritation'],
    riskFactors: [
      { factor: 'Screen concentration', description: 'Intense focus reduces natural blinking', impact: 'high', threshold: '< 10 blinks/min' },
    ],
    prevention: [
      { action: 'Conscious blinking', description: 'Blink fully every 10-15 seconds', frequency: 'Continuous' },
      { action: 'Blink reminders', description: 'Use app notifications', frequency: 'Every 10 min' },
    ],
    warningSigns: ['Chronic dryness', 'Corneal issues'],
    appTests: ['blink_rate_monitor'],
  },

  incomplete_blink: {
    name: 'Incomplete Blink',
    category: 'preventable_lifestyle',
    severity: 'moderate',
    priority: 'medium',
    description: 'Eyelids don\'t close completely during blinking, reducing tear spread.',
    symptoms: ['Dry patches on cornea', 'Irritation', 'Fluctuating vision', 'Discomfort'],
    riskFactors: [
      { factor: 'Screen use', description: 'Partial blinks more common during digital tasks', impact: 'high', threshold: '> 50% incomplete' },
    ],
    prevention: [
      { action: 'Blink exercises', description: 'Practice full, complete blinks', frequency: 'Several times daily' },
      { action: 'Eye rest', description: 'Close eyes fully for 20 seconds regularly', frequency: 'Hourly' },
    ],
    warningSigns: ['Persistent dry patches', 'Corneal damage'],
    appTests: ['blink_quality_analysis'],
  },

  blue_light_sensitivity: {
    name: 'Blue Light Sensitivity',
    category: 'preventable_lifestyle',
    severity: 'mild',
    priority: 'medium',
    description: 'Discomfort or eye strain specifically from blue light emitted by digital devices.',
    symptoms: ['Eye strain', 'Headaches', 'Sleep disruption', 'Dry eyes', 'Difficulty focusing'],
    riskFactors: [
      { factor: 'Evening device use', description: 'Blue light before bed disrupts circadian rhythm', impact: 'high', threshold: '> 2 hours before sleep' },
      { factor: 'All-day screen exposure', description: 'Cumulative blue light exposure', impact: 'medium', threshold: '> 8 hours' },
    ],
    prevention: [
      { action: 'Blue light filters', description: 'Use screen filters, night mode, or blue-blocking glasses', frequency: 'Always' },
      { action: 'Limit evening screens', description: 'Stop device use 1-2 hours before bed', frequency: 'Nightly' },
    ],
    warningSigns: ['Chronic sleep issues', 'Severe headaches'],
    appTests: ['blue_light_exposure', 'circadian_assessment'],
  },

  // 🔵 B. REFRACTIVE - REMAINING CONDITIONS
  focus_flexibility_deficiency: {
    name: 'Focus Flexibility Deficiency',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Difficulty quickly adjusting focus between near and far distances.',
    symptoms: ['Slow refocusing', 'Blurred vision when switching distances', 'Eye strain'],
    riskFactors: [
      { factor: 'Age', description: 'Focus flexibility declines with age', impact: 'medium', threshold: '> 40 years' },
      { factor: 'Lack of practice', description: 'Minimal distance changes during day', impact: 'low', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Focus exercises', description: 'Practice near-far focusing drills', frequency: 'Daily' },
      { action: 'Vary working distances', description: 'Alternate between near and distance tasks', frequency: 'Throughout day' },
    ],
    warningSigns: ['Worsening flexibility', 'Daily life impact'],
    appTests: ['accommodation_flexibility'],
  },

  blur_adaptation_issues: {
    name: 'Blur Adaptation Issues',
    category: 'refractive',
    severity: 'mild',
    priority: 'low',
    description: 'Brain struggles to adapt to persistent blur or new prescription.',
    symptoms: ['Discomfort with new glasses', 'Headaches', 'Eye strain', 'Nausea'],
    riskFactors: [
      { factor: 'Significant prescription change', description: 'Large change in lens power', impact: 'high', threshold: '> 0.75D change' },
      { factor: 'First-time glasses', description: 'Never worn correction before', impact: 'medium', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Gradual adaptation', description: 'Wear new glasses progressively longer each day', frequency: 'First week' },
      { action: 'Follow-up exam', description: 'Verify prescription if discomfort persists', frequency: 'After 2 weeks' },
    ],
    warningSigns: ['Persistent discomfort after 2 weeks', 'Worsening symptoms'],
    appTests: ['visual_acuity', 'prescription_verification'],
  },

  // 🟠 C. BINOCULAR - REMAINING CONDITIONS
  binocular_dysfunction: {
    name: 'Binocular Vision Dysfunction',
    category: 'binocular',
    severity: 'moderate',
    priority: 'medium',
    description: 'General difficulty coordinating both eyes together.',
    symptoms: ['Double vision', 'Eye strain', 'Headaches', 'Difficulty reading', 'Poor depth perception'],
    riskFactors: [
      { factor: 'Muscle imbalance', description: 'Unequal strength in eye muscles', impact: 'high', threshold: 'N/A' },
      { factor: 'Trauma', description: 'Head injury affecting eye coordination', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Vision therapy', description: 'Professional exercises to improve coordination', frequency: 'As prescribed' },
      { action: 'Prism glasses', description: 'Special lenses to align images (see doctor)', frequency: 'Daily if prescribed' },
    ],
    warningSigns: ['Worsening double vision', 'Balance problems'],
    appTests: ['binocular_vision_assessment', 'depth_perception'],
  },

  diplopia_tendency: {
    name: 'Diplopia Tendency',
    category: 'binocular',
    severity: 'moderate',
    priority: 'medium',
    description: 'Tendency to experience double vision, especially when tired.',
    symptoms: ['Intermittent double vision', 'Worse when fatigued', 'Eye strain', 'Closing one eye for relief'],
    riskFactors: [
      { factor: 'Fatigue', description: 'Symptoms worsen with tiredness', impact: 'high', threshold: 'End of day' },
      { factor: 'Weak eye muscles', description: 'Inadequate muscle stamina', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Adequate rest', description: 'Get 7-9 hours sleep', frequency: 'Nightly' },
      { action: 'Eye muscle exercises', description: 'Strengthen coordination', frequency: 'Daily' },
    ],
    warningSigns: ['Persistent double vision', 'Sudden onset'],
    appTests: ['diplopia_assessment', 'muscle_balance'],
  },

  // 💧 D. SURFACE CONDITIONS - REMAINING CONDITIONS
  environmental_irritation: {
    name: 'Environmental Eye Irritation',
    category: 'surface_conditions',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye irritation from environmental factors like wind, smoke, or pollution.',
    symptoms: ['Redness', 'Watering', 'Burning', 'Foreign body sensation', 'Irritation'],
    riskFactors: [
      { factor: 'Smoke exposure', description: 'Cigarette smoke, campfires, pollution', impact: 'high', threshold: 'Regular exposure' },
      { factor: 'Wind', description: 'Dry, windy conditions', impact: 'medium', threshold: 'Frequent outdoor time' },
      { factor: 'Air pollution', description: 'Urban environments with poor air quality', impact: 'medium', threshold: 'High pollution areas' },
    ],
    prevention: [
      { action: 'Protective eyewear', description: 'Wraparound sunglasses in wind/pollution', frequency: 'When outside' },
      { action: 'Avoid irritants', description: 'Stay indoors on high pollution days', frequency: 'As needed' },
      { action: 'Lubricating drops', description: 'Wash out irritants', frequency: 'As needed' },
    ],
    warningSigns: ['Persistent redness', 'Pain', 'Vision changes'],
    appTests: ['surface_health', 'tear_function'],
  },

  chronic_redness: {
    name: 'Chronic Eye Redness',
    category: 'surface_conditions',
    severity: 'moderate',
    priority: 'medium',
    description: 'Persistent redness that doesn\'t resolve with basic care.',
    symptoms: ['Bloodshot eyes', 'Visible blood vessels', 'Irritation', 'Discomfort'],
    riskFactors: [
      { factor: 'Chronic dry eye', description: 'Underlying dryness causing inflammation', impact: 'high', threshold: 'N/A' },
      { factor: 'Allergies', description: 'Ongoing allergic response', impact: 'medium', threshold: 'Seasonal or chronic' },
      { factor: 'Medication use', description: 'Some drops cause rebound redness', impact: 'medium', threshold: 'Overuse of decongestants' },
    ],
    prevention: [
      { action: 'Identify cause', description: 'See eye doctor for diagnosis', frequency: 'If persistent > 1 week' },
      { action: 'Avoid decongestant drops', description: 'These cause rebound redness', frequency: 'Always' },
      { action: 'Treat underlying condition', description: 'Address dryness, allergies, etc.', frequency: 'Daily' },
    ],
    warningSigns: ['Worsening redness', 'Pain', 'Vision loss'],
    appTests: ['eye_health_imaging', 'inflammation_markers'],
  },

  burning_sensation: {
    name: 'Persistent Burning Sensation',
    category: 'surface_conditions',
    severity: 'moderate',
    priority: 'high',
    description: 'Chronic burning feeling in eyes, often related to dry eye or inflammation.',
    symptoms: ['Burning', 'Stinging', 'Hot sensation', 'Discomfort', 'Redness'],
    riskFactors: [
      { factor: 'Dry eye disease', description: 'Most common cause', impact: 'high', threshold: 'N/A' },
      { factor: 'Blepharitis', description: 'Eyelid inflammation', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Treat dry eye', description: 'Regular lubricating drops', frequency: '4+ times daily' },
      { action: 'Lid hygiene', description: 'Clean eyelids daily', frequency: 'Daily' },
      { action: 'Warm compresses', description: 'Improve oil gland function', frequency: 'Twice daily' },
    ],
    warningSigns: ['Severe burning', 'Vision changes', 'Discharge'],
    appTests: ['dry_eye', 'lid_examination'],
  },

  // 🌞 E. LIGHT PERCEPTION - REMAINING CONDITIONS
  photophobia: {
    name: 'Light Sensitivity (Photophobia)',
    category: 'light_perception',
    severity: 'moderate',
    priority: 'medium',
    description: 'Abnormal sensitivity to light causing discomfort, squinting, or pain.',
    symptoms: [
      'Discomfort in bright light',
      'Squinting',
      'Eye pain',
      'Headaches',
      'Tearing',
      'Need for sunglasses indoors',
    ],
    riskFactors: [
      {
        factor: 'Migraines',
        description: 'Often accompanies migraine headaches',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Eye conditions',
        description: 'Dry eye, uveitis, corneal issues',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Light eye color',
        description: 'Less pigment = more light sensitivity',
        impact: 'low',
        threshold: 'Blue/green eyes',
      },
    ],
    prevention: [
      {
        action: 'Wear sunglasses',
        description: 'UV protection and polarized lenses',
        frequency: 'Outdoors always',
      },
      {
        action: 'Control lighting',
        description: 'Use softer, indirect lighting indoors',
        frequency: 'Continuous',
      },
      {
        action: 'Treat underlying cause',
        description: 'Address dry eye, migraines, etc.',
        frequency: 'As prescribed',
      },
    ],
    warningSigns: ['Sudden onset', 'Severe pain', 'Vision changes', 'Eye redness'],
    appTests: ['light_sensitivity_test', 'eye_health_screening'],
  },

  halos: {
    name: 'Halos Around Lights',
    category: 'light_perception',
    severity: 'moderate',
    priority: 'medium',
    description: 'Seeing bright circles around light sources, especially at night.',
    symptoms: ['Halos around lights', 'Starbursts', 'Difficulty night driving', 'Glare'],
    riskFactors: [
      { factor: 'Cataracts', description: 'Lens clouding scatters light', impact: 'high', threshold: '> 60 years' },
      { factor: 'Large pupils', description: 'More light aberrations', impact: 'medium', threshold: 'Naturally large pupils' },
      { factor: 'Dry eyes', description: 'Irregular tear film', impact: 'medium', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Eye exam', description: 'Check for cataracts or other causes', frequency: 'Annually' },
      { action: 'Treat dry eye', description: 'If dryness is contributing', frequency: 'Daily' },
      { action: 'Anti-reflective coating', description: 'On glasses to reduce halos', frequency: 'Always' },
    ],
    warningSigns: ['Worsening halos', 'Vision decline', 'New onset'],
    appTests: ['contrast_sensitivity', 'cataract_screening'],
  },

  contrast_reduction: {
    name: 'Reduced Contrast Sensitivity',
    category: 'light_perception',
    severity: 'moderate',
    priority: 'medium',
    description: 'Difficulty distinguishing objects from backgrounds in low contrast.',
    symptoms: ['Trouble in dim light', 'Difficulty reading low-contrast text', 'Bumping into things', 'Driving difficulties'],
    riskFactors: [
      { factor: 'Age', description: 'Natural decline with aging', impact: 'high', threshold: '> 60 years' },
      { factor: 'Cataracts', description: 'Reduce contrast perception', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Improve lighting', description: 'Use brighter, more even lighting', frequency: 'Continuous' },
      { action: 'High-contrast materials', description: 'Use bold text, contrasting colors', frequency: 'Always' },
    ],
    warningSigns: ['Falling', 'Difficulty with daily tasks', 'Vision decline'],
    appTests: ['contrast_sensitivity_test'],
  },

  visual_noise: {
    name: 'Visual Noise/Static',
    category: 'light_perception',
    severity: 'mild',
    priority: 'low',
    description: 'Seeing TV-like static or snow in vision, especially in low light.',
    symptoms: ['Static in vision', 'Grainy appearance', 'Worse in dark', 'Persistent visual disturbance'],
    riskFactors: [
      { factor: 'Visual snow syndrome', description: 'Neurological condition', impact: 'high', threshold: 'N/A' },
      { factor: 'Migraines', description: 'Often associated', impact: 'medium', threshold: 'History of migraines' },
    ],
    prevention: [
      { action: 'Medical evaluation', description: 'See doctor to rule out serious causes', frequency: 'If persistent' },
      { action: 'Manage triggers', description: 'Reduce stress, adequate sleep', frequency: 'Daily' },
    ],
    warningSigns: ['Worsening symptoms', 'Associated headaches', 'Vision loss'],
    appTests: ['neurological_assessment', 'visual_field'],
  },

  motion_sensitivity: {
    name: 'Motion Sensitivity',
    category: 'light_perception',
    severity: 'mild',
    priority: 'low',
    description: 'Discomfort or symptoms triggered by visual motion.',
    symptoms: ['Dizziness with motion', 'Nausea', 'Headaches', 'Disorientation', 'Visual discomfort'],
    riskFactors: [
      { factor: 'Vestibular issues', description: 'Inner ear problems', impact: 'high', threshold: 'N/A' },
      { factor: 'Visual processing', description: 'Brain-eye coordination difficulties', impact: 'medium', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Limit triggers', description: 'Avoid rapid motion environments', frequency: 'As needed' },
      { action: 'Vision therapy', description: 'Improve visual-vestibular integration', frequency: 'As prescribed' },
    ],
    warningSigns: ['Severe symptoms', 'Balance issues', 'Daily life impact'],
    appTests: ['vestibular_assessment', 'motion_tracking'],
  },

  //  F. NEUROVISUAL - REMAINING CONDITIONS
  visual_processing_fatigue: {
    name: 'Visual Processing Fatigue',
    category: 'neurovisual',
    severity: 'moderate',
    priority: 'medium',
    description: 'Brain becomes overwhelmed processing visual information.',
    symptoms: ['Mental fatigue', 'Difficulty concentrating', 'Headaches', 'Need for breaks', 'Reduced productivity'],
    riskFactors: [
      { factor: 'Complex visual tasks', description: 'Detailed work, multitasking', impact: 'high', threshold: '> 6 hours daily' },
      { factor: 'Poor lighting', description: 'Brain works harder to process', impact: 'medium', threshold: 'Dim or harsh lighting' },
    ],
    prevention: [
      { action: 'Regular breaks', description: 'Rest brain from visual processing', frequency: 'Every 30 min' },
      { action: 'Optimize environment', description: 'Good lighting, reduce clutter', frequency: 'Continuous' },
    ],
    warningSigns: ['Severe cognitive fatigue', 'Daily life impact'],
    appTests: ['cognitive_visual_assessment'],
  },

  delayed_pupil_response: {
    name: 'Delayed Pupil Response',
    category: 'neurovisual',
    severity: 'mild',
    priority: 'low',
    description: 'Pupils react slowly to light changes. EDUCATIONAL - see doctor if concerned.',
    symptoms: ['Slow adjustment to light changes', 'Discomfort in changing lighting', 'Glare sensitivity'],
    riskFactors: [
      { factor: 'Age', description: 'Pupil response slows with age', impact: 'medium', threshold: '> 60 years' },
      { factor: 'Medications', description: 'Some drugs affect pupil function', impact: 'medium', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Medical evaluation', description: 'Rule out neurological causes', frequency: 'If new or worsening' },
      { action: 'Gradual lighting transitions', description: 'Allow time for adjustment', frequency: 'Always' },
    ],
    warningSigns: ['Unequal pupils', 'Neurological symptoms', 'Sudden change'],
    appTests: ['pupil_reactivity'],
  },

  visual_attention_deficiency: {
    name: 'Visual Attention Deficiency',
    category: 'neurovisual',
    severity: 'mild',
    priority: 'low',
    description: 'Difficulty maintaining visual focus and attention.',
    symptoms: ['Short visual attention span', 'Easily distracted', 'Missing details', 'Reading difficulties'],
    riskFactors: [
      { factor: 'ADHD', description: 'Often associated with attention disorders', impact: 'high', threshold: 'N/A' },
      { factor: 'Visual processing disorder', description: 'Brain struggles with visual info', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Minimize distractions', description: 'Clear workspace, reduce visual clutter', frequency: 'Continuous' },
      { action: 'Vision therapy', description: 'Train visual attention skills', frequency: 'As prescribed' },
    ],
    warningSigns: ['Academic struggles', 'Work performance issues'],
    appTests: ['visual_attention_assessment'],
  },

  visual_reaction_delay: {
    name: 'Visual Reaction Time Delay',
    category: 'neurovisual',
    severity: 'mild',
    priority: 'low',
    description: 'Slower than normal response to visual stimuli.',
    symptoms: ['Slow reactions', 'Sports difficulties', 'Driving challenges', 'Delayed responses'],
    riskFactors: [
      { factor: 'Age', description: 'Reaction time slows naturally', impact: 'medium', threshold: '> 60 years' },
      { factor: 'Fatigue', description: 'Tiredness slows reactions', impact: 'high', threshold: 'Sleep deprived' },
    ],
    prevention: [
      { action: 'Adequate sleep', description: 'Maintain alertness', frequency: 'Nightly' },
      { action: 'Reaction training', description: 'Practice response exercises', frequency: 'Regular' },
    ],
    warningSigns: ['Sudden slowing', 'Safety concerns'],
    appTests: ['reaction_time_test'],
  },

  post_concussion_visual: {
    name: 'Post-Concussion Visual Sensitivity',
    category: 'neurovisual',
    severity: 'moderate',
    priority: 'low',
    description: 'Visual symptoms following head injury. EDUCATIONAL - requires medical care.',
    symptoms: ['Light sensitivity', 'Blurred vision', 'Double vision', 'Headaches', 'Dizziness'],
    riskFactors: [
      { factor: 'Recent head trauma', description: 'Concussion or traumatic brain injury', impact: 'high', threshold: 'Recent injury' },
    ],
    prevention: [
      { action: 'Medical evaluation', description: 'See doctor immediately after head injury', frequency: 'ASAP' },
      { action: 'Gradual return', description: 'Slowly increase visual demands', frequency: 'As directed' },
    ],
    warningSigns: ['Worsening symptoms', 'Neurological signs', 'Vision loss'],
    appTests: ['concussion_visual_assessment'],
  },

  // 👶 G. PEDIATRIC - ALL CONDITIONS
  myopia_progression_children: {
    name: 'Myopia Progression (Children/Teens)',
    category: 'pediatric',
    severity: 'severe',
    priority: 'high',
    description: 'Progressive worsening of nearsightedness in children and teenagers.',
    symptoms: [
      'Increasing need for stronger glasses',
      'Squinting at distance',
      'Sitting closer to TV',
      'Difficulty seeing board at school',
      'Frequent prescription changes',
    ],
    riskFactors: [
      {
        factor: 'Age',
        description: 'Myopia often develops/worsens ages 6-18',
        impact: 'high',
        threshold: '6-18 years',
      },
      {
        factor: 'Family history',
        description: 'Parents with myopia increase risk',
        impact: 'high',
        threshold: 'One or both parents myopic',
      },
      {
        factor: 'Excessive near work',
        description: 'Limited outdoor time, excessive screens/reading',
        impact: 'high',
        threshold: '< 1 hour outdoor daily',
      },
    ],
    prevention: [
      {
        action: 'Outdoor time',
        description: 'At least 2 hours daily outdoors',
        frequency: 'Daily',
      },
      {
        action: 'Myopia control treatments',
        description: 'Ortho-K lenses, atropine drops, special glasses',
        frequency: 'As prescribed by eye doctor',
      },
      {
        action: 'Limit near work',
        description: 'Take breaks, maintain proper distance',
        frequency: 'Continuous',
      },
      {
        action: 'Regular eye exams',
        description: 'Monitor progression',
        frequency: 'Every 6-12 months',
      },
    ],
    warningSigns: ['Rapid progression (> 0.5D/year)', 'High myopia (> -6.00D)', 'Retinal concerns'],
    appTests: ['visual_acuity', 'progression_tracking', 'axial_length'],
  },

  teen_screen_strain: {
    name: 'Screen-Related Vision Strain (Teens)',
    category: 'pediatric',
    severity: 'moderate',
    priority: 'high',
    description: 'Digital eye strain specifically affecting teenagers with high device use.',
    symptoms: ['Eye fatigue', 'Headaches', 'Blurred vision', 'Dry eyes', 'Neck pain'],
    riskFactors: [
      { factor: 'Excessive device use', description: 'Social media, gaming, homework', impact: 'high', threshold: '> 6 hours daily' },
      { factor: 'Poor habits', description: 'Dark rooms, lying down while using devices', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Limit screen time', description: '2-hour recreational limit', frequency: 'Daily' },
      { action: 'Proper ergonomics', description: 'Sitting up, good lighting, arm\'s length', frequency: 'Always' },
      { action: 'Outdoor time', description: '2+ hours daily', frequency: 'Daily' },
    ],
    warningSigns: ['Worsening vision', 'Academic impact', 'Sleep problems'],
    appTests: ['screen_time_tracking', 'visual_acuity'],
  },

  poor_visual_habits: {
    name: 'Poor Visual Habits Development',
    category: 'pediatric',
    severity: 'mild',
    priority: 'medium',
    description: 'Children developing harmful eye care habits.',
    symptoms: ['Reading too close', 'Poor posture', 'Inadequate lighting use', 'Ignoring eye fatigue'],
    riskFactors: [
      { factor: 'Lack of guidance', description: 'Parents unaware of eye health needs', impact: 'high', threshold: 'N/A' },
      { factor: 'Device access', description: 'Unsupervised screen time', impact: 'medium', threshold: '> 2 hours daily' },
    ],
    prevention: [
      { action: 'Parent education', description: 'Learn proper eye care habits', frequency: 'Ongoing' },
      { action: 'Model good habits', description: 'Parents demonstrate healthy behaviors', frequency: 'Always' },
      { action: 'Set boundaries', description: 'Screen time limits, lighting rules', frequency: 'Daily' },
    ],
    warningSigns: ['Vision complaints', 'Academic struggles'],
    appTests: ['habit_assessment', 'posture_check'],
  },

  learning_visual_fatigue: {
    name: 'Learning-Related Visual Fatigue',
    category: 'pediatric',
    severity: 'moderate',
    priority: 'medium',
    description: 'Eye fatigue from extended reading, homework, and learning tasks.',
    symptoms: ['Tired eyes', 'Difficulty concentrating', 'Headaches', 'Avoiding reading', 'Slow progress'],
    riskFactors: [
      { factor: 'Extended homework', description: 'Long studying sessions', impact: 'high', threshold: '> 2 hours continuous' },
      { factor: 'Uncorrected vision problems', description: 'Struggling without glasses', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Regular breaks', description: '10-minute break every 30 minutes', frequency: 'During homework' },
      { action: 'Eye exam', description: 'Rule out vision problems', frequency: 'Annually' },
      { action: 'Good lighting', description: 'Adequate task lighting', frequency: 'Always' },
    ],
    warningSigns: ['Academic decline', 'Avoiding schoolwork', 'Behavioral changes'],
    appTests: ['vision_screening', 'binocular_assessment'],
  },

  reading_eye_strain: {
    name: 'Reading-Induced Eye Strain',
    category: 'pediatric',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye discomfort specifically during or after reading.',
    symptoms: ['Eye fatigue while reading', 'Losing place', 'Re-reading lines', 'Headaches', 'Avoidance'],
    riskFactors: [
      { factor: 'Convergence issues', description: 'Eyes struggle to align for reading', impact: 'high', threshold: 'N/A' },
      { factor: 'Poor reading distance', description: 'Too close or too far', impact: 'medium', threshold: '< 12 inches' },
    ],
    prevention: [
      { action: 'Proper reading distance', description: '14-16 inches (elbow to knuckle)', frequency: 'Always' },
      { action: 'Good lighting', description: 'Over-shoulder task lighting', frequency: 'Always' },
      { action: 'Frequent breaks', description: 'Look up every 20 minutes', frequency: 'During reading' },
    ],
    warningSigns: ['Reading difficulties', 'Academic struggles', 'Behavioral issues'],
    appTests: ['near_point_convergence', 'accommodation_test'],
  },

  // 🕰 H. AGE-RELATED - REMAINING CONDITIONS
  early_presbyopia: {
    name: 'Early Presbyopia',
    category: 'age_related',
    severity: 'mild',
    priority: 'medium',
    description: 'Age-related near vision decline starting in 40s.',
    symptoms: ['Difficulty reading small print', 'Arms too short', 'Eye strain', 'Headaches'],
    riskFactors: [
      { factor: 'Age 40+', description: 'Natural lens hardening', impact: 'high', threshold: '> 40 years' },
    ],
    prevention: [
      { action: 'Reading glasses', description: 'Over-the-counter or prescription', frequency: 'As needed' },
      { action: 'Good lighting', description: 'Brighter light for near tasks', frequency: 'Always' },
    ],
    warningSigns: ['Rapid progression', 'Severe difficulty'],
    appTests: ['near_vision_test'],
  },

  age_contrast_decline: {
    name: 'Age-Related Contrast Decline',
    category: 'age_related',
    severity: 'moderate',
    priority: 'medium',
    description: 'Reduced ability to distinguish contrast with aging.',
    symptoms: ['Difficulty in dim light', 'Trouble seeing steps/curbs', 'Low contrast reading hard', 'Driving difficulties'],
    riskFactors: [
      { factor: 'Age > 60', description: 'Natural aging process', impact: 'high', threshold: '> 60 years' },
    ],
    prevention: [
      { action: 'Improve lighting', description: 'Brighter, more even illumination', frequency: 'Continuous' },
      { action: 'High contrast aids', description: 'Bold markers, edge strips on steps', frequency: 'Install at home' },
    ],
    warningSigns: ['Falls', 'Accidents', 'Severe vision decline'],
    appTests: ['contrast_sensitivity'],
  },

  glaucoma_risk: {
    name: 'Glaucoma Risk Awareness',
    category: 'age_related',
    severity: 'severe',
    priority: 'high',
    description: 'Awareness and monitoring for glaucoma risk factors.',
    symptoms: [
      'Often no early symptoms',
      'Gradual peripheral vision loss',
      'Tunnel vision (advanced)',
      'Eye pain (acute angle-closure)',
    ],
    riskFactors: [
      {
        factor: 'Age > 60',
        description: 'Risk increases significantly with age',
        impact: 'high',
        threshold: '> 60 years',
      },
      {
        factor: 'Family history',
        description: 'Genetic component',
        impact: 'high',
        threshold: 'First-degree relative with glaucoma',
      },
      {
        factor: 'High eye pressure',
        description: 'Elevated intraocular pressure (IOP)',
        impact: 'high',
        threshold: '> 21 mmHg',
      },
      {
        factor: 'Ethnicity',
        description: 'Higher risk in certain populations',
        impact: 'medium',
        threshold: 'African, Hispanic, Asian descent',
      },
    ],
    prevention: [
      {
        action: 'Regular eye exams',
        description: 'Include pressure check and optic nerve exam',
        frequency: 'Every 1-2 years after 40',
      },
      {
        action: 'Exercise regularly',
        description: 'May help lower eye pressure',
        frequency: 'Most days',
      },
      {
        action: 'Know family history',
        description: 'Inform your eye doctor',
        frequency: 'Always',
      },
      {
        action: 'Follow treatment',
        description: 'If diagnosed, use drops as prescribed',
        frequency: 'Daily',
      },
    ],
    warningSigns: ['Vision loss', 'Halos around lights', 'Severe eye pain', 'Nausea with eye pain'],
    appTests: ['tonometry', 'optic_nerve_imaging', 'visual_field_test'],
  },

  macular_health: {
    name: 'Macular Health Monitoring',
    category: 'age_related',
    severity: 'moderate',
    priority: 'high',
    description: 'Preventive monitoring for age-related macular degeneration (AMD).',
    symptoms: ['Often no early symptoms', 'Later: wavy lines', 'Central blur', 'Dark spots'],
    riskFactors: [
      { factor: 'Age > 50', description: 'AMD risk increases with age', impact: 'high', threshold: '> 50 years' },
      { factor: 'Family history', description: 'Genetic predisposition', impact: 'high', threshold: 'Relative with AMD' },
      { factor: 'Smoking', description: 'Significantly increases risk', impact: 'high', threshold: 'Current/former smoker' },
    ],
    prevention: [
      { action: 'Don\'t smoke', description: 'Quit smoking if applicable', frequency: 'Always' },
      { action: 'Healthy diet', description: 'Leafy greens, fish, AREDS vitamins', frequency: 'Daily' },
      { action: 'Regular dilated exams', description: 'Detect early changes', frequency: 'Annually after 50' },
    ],
    warningSigns: ['Distorted vision', 'Central blur', 'Scotomas'],
    appTests: ['amsler_grid', 'oct_imaging'],
  },

  cataract_risk: {
    name: 'Cataract Risk Monitoring',
    category: 'age_related',
    severity: 'moderate',
    priority: 'medium',
    description: 'Awareness of cataract development risk.',
    symptoms: ['Often gradual', 'Cloudy vision', 'Glare', 'Faded colors', 'Poor night vision'],
    riskFactors: [
      { factor: 'Age > 60', description: 'Most common in seniors', impact: 'high', threshold: '> 60 years' },
      { factor: 'UV exposure', description: 'Sun damage accumulates', impact: 'medium', threshold: 'Lifetime exposure' },
      { factor: 'Diabetes', description: 'Accelerates cataract formation', impact: 'high', threshold: 'Diabetic' },
    ],
    prevention: [
      { action: 'UV protection', description: 'Sunglasses with 100% UV blocking', frequency: 'When outside' },
      { action: 'Control diabetes', description: 'If applicable', frequency: 'Daily' },
      { action: 'Regular eye exams', description: 'Monitor lens clarity', frequency: 'Annually after 60' },
    ],
    warningSigns: ['Rapid vision decline', 'Daily life impact'],
    appTests: ['slit_lamp_exam', 'visual_acuity'],
  },

  age_dry_eye: {
    name: 'Age-Related Dry Eye',
    category: 'age_related',
    severity: 'moderate',
    priority: 'high',
    description: 'Dry eye becoming more common and severe with age.',
    symptoms: ['Persistent dryness', 'Burning', 'Grittiness', 'Fluctuating vision', 'Light sensitivity'],
    riskFactors: [
      { factor: 'Age > 50', description: 'Tear production decreases', impact: 'high', threshold: '> 50 years' },
      { factor: 'Menopause', description: 'Hormonal changes reduce tears', impact: 'high', threshold: 'Postmenopausal' },
      { factor: 'Medications', description: 'Many common meds worsen dryness', impact: 'high', threshold: 'Multiple medications' },
    ],
    prevention: [
      { action: 'Artificial tears', description: 'Preservative-free, 4+ times daily', frequency: 'Multiple times daily' },
      { action: 'Omega-3 supplements', description: 'Improve tear quality', frequency: 'Daily' },
      { action: 'Humidify environment', description: 'Especially in dry climates', frequency: 'Continuous' },
    ],
    warningSigns: ['Corneal damage', 'Vision loss', 'Severe pain'],
    appTests: ['dry_eye'],
  },

  // 🏠 I. ENVIRONMENTAL - REMAINING CONDITIONS
  low_humidity_stress: {
    name: 'Low Humidity Eye Stress',
    category: 'environmental',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye dryness and discomfort from low humidity environments.',
    symptoms: ['Dry eyes', 'Irritation', 'Burning', 'Redness', 'Worse in winter/dry climates'],
    riskFactors: [
      { factor: 'Dry climate', description: 'Arid regions, winter heating', impact: 'high', threshold: '< 30% humidity' },
      { factor: 'Office environment', description: 'Recirculated air', impact: 'medium', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Humidifier', description: 'Maintain 40-60% humidity', frequency: 'Continuous' },
      { action: 'Frequent drops', description: 'Lubricate more often in dry air', frequency: 'Every 2 hours' },
    ],
    warningSigns: ['Chronic dryness', 'Corneal issues'],
    appTests: ['dry_eye'],
  },

  ac_dryness: {
    name: 'Air Conditioning Dryness',
    category: 'environmental',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye dryness from air conditioning removing moisture.',
    symptoms: ['Dry eyes at work/home', 'Worse in AC', 'Improves outdoors', 'Irritation'],
    riskFactors: [
      { factor: 'Direct airflow', description: 'Vent blowing on face', impact: 'high', threshold: 'N/A' },
      { factor: 'All-day exposure', description: 'Working in AC environment', impact: 'high', threshold: '> 8 hours' },
    ],
    prevention: [
      { action: 'Redirect vents', description: 'Avoid direct face airflow', frequency: 'Always' },
      { action: 'Humidifier', description: 'Add moisture to air', frequency: 'When AC running' },
      { action: 'Frequent drops', description: 'Compensate for dryness', frequency: 'Every 2-3 hours' },
    ],
    warningSigns: ['Severe dryness', 'Corneal damage'],
    appTests: ['environmental_assessment'],
  },

  poor_lighting_strain: {
    name: 'Poor Lighting Eye Stress',
    category: 'environmental',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye strain from inadequate, harsh, or improper lighting.',
    symptoms: ['Eye fatigue', 'Headaches', 'Difficulty focusing', 'Squinting', 'Discomfort'],
    riskFactors: [
      { factor: 'Dim lighting', description: 'Eyes work harder to see', impact: 'high', threshold: '< 500 lux' },
      { factor: 'Glare', description: 'Harsh overhead/window glare', impact: 'high', threshold: 'N/A' },
      { factor: 'Fluorescent lights', description: 'Flickering causes strain', impact: 'medium', threshold: 'Old fixtures' },
    ],
    prevention: [
      { action: 'Optimize lighting', description: 'Adequate, even, indirect lighting', frequency: 'Continuous' },
      { action: 'Task lighting', description: 'Focused light for work', frequency: 'During tasks' },
      { action: 'Reduce glare', description: 'Blinds, matte screens, position desk', frequency: 'Always' },
    ],
    warningSigns: ['Chronic headaches', 'Persistent strain'],
    appTests: ['lighting_assessment'],
  },

  screen_distance_strain: {
    name: 'Improper Screen Distance Strain',
    category: 'environmental',
    severity: 'mild',
    priority: 'medium',
    description: 'Eye strain from screens too close or too far.',
    symptoms: ['Eye fatigue', 'Neck pain', 'Headaches', 'Blurred vision', 'Leaning forward'],
    riskFactors: [
      { factor: 'Screen too close', description: 'Excessive focusing demand', impact: 'high', threshold: '< 20 inches' },
      { factor: 'Screen too far', description: 'Straining to see', impact: 'medium', threshold: '> 30 inches' },
      { factor: 'Wrong height', description: 'Poor neck posture', impact: 'high', threshold: 'Above eye level' },
    ],
    prevention: [
      { action: 'Proper distance', description: '20-28 inches (arm\'s length)', frequency: 'Always' },
      { action: 'Screen height', description: 'Top at or slightly below eye level', frequency: 'Always' },
      { action: 'Ergonomic setup', description: 'Adjust chair, desk, monitor', frequency: 'One-time adjustment' },
    ],
    warningSigns: ['Chronic pain', 'Persistent strain'],
    appTests: ['ergonomic_assessment'],
  },

  excessive_nearwork: {
    name: 'Excessive Near-Work Stress',
    category: 'environmental',
    severity: 'moderate',
    priority: 'high',
    description: 'Prolonged near-work activities causing eye strain and accommodation stress.',
    symptoms: ['Eye fatigue', 'Headaches', 'Blurred distance vision', 'Eye pain', 'Difficulty focusing'],
    riskFactors: [
      { factor: 'Long reading sessions', description: 'Hours of continuous near tasks', impact: 'high', threshold: '> 4 hours daily' },
      { factor: 'No breaks', description: 'Lack of distance viewing', impact: 'high', threshold: 'No 20-20-20 breaks' },
      { factor: 'Small text', description: 'Fine print or small screens', impact: 'medium', threshold: '< 12pt font' },
    ],
    prevention: [
      { action: '20-20-20 rule', description: 'Every 20 min, look 20 feet away for 20 sec', frequency: 'Every 20 minutes' },
      { action: 'Increase text size', description: 'Use larger fonts or zoom', frequency: 'Always' },
      { action: 'Limit near-work', description: 'Take extended breaks from reading', frequency: 'Hourly' },
      { action: 'Outdoor time', description: 'Distance viewing to relax eyes', frequency: 'Daily' },
    ],
    warningSigns: ['Persistent blur', 'Progressive myopia', 'Chronic pain'],
    appTests: ['accommodation_test', 'near_point_measurement'],
  },

  // 😔 J. SYMPTOM-BASED - REMAINING CONDITIONS
  chronic_tiredness: {
    name: 'Chronic Eye Tiredness',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'high',
    description: 'Persistent feeling of tired, fatigued eyes throughout the day.',
    symptoms: [
      'Eyes feel tired',
      'Heaviness',
      'Difficulty keeping eyes open',
      'Fatigue after minimal use',
      'Constant need to rest eyes',
    ],
    riskFactors: [
      {
        factor: 'Poor sleep',
        description: 'Inadequate rest',
        impact: 'high',
        threshold: '< 7 hours nightly',
      },
      {
        factor: 'Uncorrected vision',
        description: 'Eyes work harder to see clearly',
        impact: 'high',
        threshold: 'N/A',
      },
      {
        factor: 'Extended screen time',
        description: 'Eye muscles overworked',
        impact: 'high',
        threshold: '> 8 hours daily',
      },
      {
        factor: 'Dry eye',
        description: 'Chronic dryness causes fatigue',
        impact: 'medium',
        threshold: 'N/A',
      },
    ],
    prevention: [
      {
        action: 'Adequate sleep',
        description: '7-9 hours nightly',
        frequency: 'Daily',
      },
      {
        action: 'Eye exam',
        description: 'Check for prescription needs',
        frequency: 'Annually',
      },
      {
        action: 'Regular breaks',
        description: '20-20-20 rule',
        frequency: 'Every 20 minutes',
      },
      {
        action: 'Treat dry eye',
        description: 'Use lubricating drops',
        frequency: 'As needed',
      },
    ],
    warningSigns: ['Worsening fatigue', 'Vision changes', 'Impact on daily activities'],
    appTests: ['fatigue_assessment', 'visual_acuity', 'dry_eye'],
  },

  eyes_feel_heavy: {
    name: 'Eyes Feel Heavy',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'medium',
    description: 'Sensation of weighted, tired eyelids.',
    symptoms: ['Heavy eyelids', 'Difficulty keeping eyes open', 'Drooping feeling', 'Fatigue'],
    riskFactors: [
      { factor: 'Sleep deprivation', description: 'Inadequate rest', impact: 'high', threshold: '< 7 hours' },
      { factor: 'Eye muscle fatigue', description: 'Overworked eyes', impact: 'high', threshold: '> 8 hours screen' },
    ],
    prevention: [
      { action: 'Adequate sleep', description: '7-9 hours nightly', frequency: 'Daily' },
      { action: 'Eye rest breaks', description: 'Close eyes for 20 seconds every hour', frequency: 'Hourly' },
    ],
    warningSigns: ['Persistent despite rest', 'Ptosis (drooping)'],
    appTests: ['fatigue_assessment'],
  },

  difficulty_refocusing: {
    name: 'Difficulty Refocusing',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'medium',
    description: 'Trouble quickly adjusting focus between distances.',
    symptoms: ['Slow refocusing', 'Temporary blur', 'Eye strain', 'Frustration with vision'],
    riskFactors: [
      { factor: 'Accommodation issues', description: 'Weak focusing system', impact: 'high', threshold: 'N/A' },
      { factor: 'Age', description: 'Flexibility decreases', impact: 'medium', threshold: '> 40 years' },
    ],
    prevention: [
      { action: 'Focus exercises', description: 'Near-far drills', frequency: 'Daily' },
      { action: 'Eye exam', description: 'Check accommodation', frequency: 'If persistent' },
    ],
    warningSigns: ['Worsening ability', 'Daily life impact'],
    appTests: ['accommodation_flexibility'],
  },

  eyes_sore_night: {
    name: 'Eyes Feel Sore at Night',
    category: 'symptom_based',
    severity: 'mild',
    priority: 'medium',
    description: 'End-of-day eye soreness and discomfort.',
    symptoms: ['Sore eyes', 'Aching', 'Discomfort worsens through day', 'Relief with rest'],
    riskFactors: [
      { factor: 'All-day strain', description: 'Cumulative use without breaks', impact: 'high', threshold: '> 10 hours work' },
      { factor: 'Dry eye', description: 'Dryness accumulates', impact: 'high', threshold: 'N/A' },
    ],
    prevention: [
      { action: 'Regular breaks', description: 'Don\'t push through discomfort', frequency: 'Every 30 min' },
      { action: 'Evening drops', description: 'Refresh eyes before bed', frequency: 'Nightly' },
      { action: 'Warm compress', description: 'Soothe tired eyes', frequency: 'Evening' },
    ],
    warningSigns: ['Morning soreness too', 'Worsening pain'],
    appTests: ['comprehensive_eye_exam'],
  },

}

// Export helper functions
export function getConditionsByCategory(category) {
  return Object.entries(EYE_CONDITIONS)
    .filter(([, condition]) => condition.category === category)
    .map(([key, condition]) => ({ id: key, ...condition }))
}

export function getConditionsByPriority(priority) {
  return Object.entries(EYE_CONDITIONS)
    .filter(([, condition]) => condition.priority === priority)
    .map(([key, condition]) => ({ id: key, ...condition }))
}

export function searchConditions(query) {
  const lowerQuery = query.toLowerCase()
  return Object.entries(EYE_CONDITIONS)
    .filter(([, condition]) => 
      condition.name.toLowerCase().includes(lowerQuery) ||
      condition.description.toLowerCase().includes(lowerQuery) ||
      condition.symptoms.some(s => s.toLowerCase().includes(lowerQuery))
    )
    .map(([key, condition]) => ({ id: key, ...condition }))
}
