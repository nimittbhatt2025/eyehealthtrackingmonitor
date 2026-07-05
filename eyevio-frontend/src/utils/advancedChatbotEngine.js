/**
 * 🧩 ADVANCED EYEVIO CHATBOT ENGINE
 * Production-ready AI system with 9 core components
 * Version: 2.0 - Medical-Grade Safety
 */

import { EYE_CONDITIONS, CONDITION_DATABASE } from './comprehensiveEyeConditions';

// ============================================================================
// 1⃣ CONVERSATION MANAGER - Maintains context & conversation flow
// ============================================================================

class ConversationManager {
  constructor() {
    this.context = {
      symptomsDiscussed: [],
      conditionsExplored: [],
      userProfile: null,
      conversationStage: 'initial', // initial, gathering, analyzing, recommending
      followUpNeeded: [],
      urgencyLevel: 'normal',
    };
  }

  updateContext(newInfo) {
    this.context = { ...this.context, ...newInfo };
  }

  addSymptom(symptom) {
    if (!this.context.symptomsDiscussed.includes(symptom)) {
      this.context.symptomsDiscussed.push(symptom);
    }
  }

  getContext() {
    return this.context;
  }

  needsMoreInfo() {
    return this.context.symptomsDiscussed.length < 2;
  }

  getFollowUpQuestions() {
    const questions = [];
    
    if (!this.context.duration) {
      questions.push("How long have you been experiencing these symptoms?");
    }
    
    if (!this.context.frequency) {
      questions.push("How often do they occur? (Constantly, intermittently, only during specific activities?)");
    }
    
    if (!this.context.severity) {
      questions.push("On a scale of 1-10, how would you rate the severity?");
    }
    
    return questions;
  }

  reset() {
    this.context = {
      symptomsDiscussed: [],
      conditionsExplored: [],
      userProfile: null,
      conversationStage: 'initial',
      followUpNeeded: [],
      urgencyLevel: 'normal',
    };
  }
}

// ============================================================================
// 2⃣ MEDICAL SAFETY FILTER - Prevents inappropriate responses
// ============================================================================

class MedicalSafetyFilter {
  constructor() {
    this.dangerousTerms = [
      'diagnose', 'diagnosis', 'prescribe', 'prescription', 'medicine', 'medication',
      'cure', 'treatment', 'surgery', 'operate', 'drug', 'pill'
    ];
    
    this.disclaimerRequired = [
      'should i see', 'do i need', 'is this serious', 'what should i do',
      'how do i treat', 'can you diagnose'
    ];
  }

  filterResponse(response) {
    // Add mandatory disclaimers
    let filtered = response;
    
    // Check if response contains medical claims
    const hasMedicalClaims = this.dangerousTerms.some(term => 
      filtered.toLowerCase().includes(term)
    );
    
    if (hasMedicalClaims) {
      filtered = this.wrapWithDisclaimer(filtered);
    }
    
    // Replace dangerous language
    filtered = filtered.replace(/\bdiagnosis\b/gi, 'possible condition');
    filtered = filtered.replace(/\bdiagnose\b/gi, 'identify');
    filtered = filtered.replace(/\btreatment\b/gi, 'management strategy');
    filtered = filtered.replace(/\bcure\b/gi, 'help manage');
    
    return filtered;
  }

  wrapWithDisclaimer(content) {
    return ` **Medical Disclaimer**: The following is educational information only. I cannot diagnose or prescribe treatment.\n\n${content}\n\n **Please consult an eye care professional for proper diagnosis and treatment.**`;
  }

  requiresProfessionalConsult(userInput) {
    const urgentPhrases = [
      'sudden', 'severe pain', 'vision loss', 'flashes', 'floaters suddenly',
      'trauma', 'injury', 'chemical', 'burning pain', 'can\'t see', 'blind',
      'double vision suddenly', 'dark spot', 'curtain', 'veil'
    ];
    
    return urgentPhrases.some(phrase => 
      userInput.toLowerCase().includes(phrase)
    );
  }
}

// ============================================================================
// 3⃣ RED FLAG DETECTOR - Identifies emergency symptoms
// ============================================================================

class RedFlagDetector {
  constructor() {
    this.emergencySymptoms = {
      immediate: [
        { pattern: /sudden (vision loss|blindness|loss of vision)/i, flag: 'Sudden vision loss' },
        { pattern: /chemical (in|burn|splash)/i, flag: 'Chemical eye injury' },
        { pattern: /(severe|extreme|unbearable) (pain|ache)/i, flag: 'Severe eye pain' },
        { pattern: /(trauma|injury|hit|punch|struck)/i, flag: 'Eye trauma' },
        { pattern: /can'?t see/i, flag: 'Unable to see' },
        { pattern: /(curtain|veil|shadow) (over|across|in) (vision|eye)/i, flag: 'Retinal detachment signs' },
      ],
      urgent: [
        { pattern: /(sudden|many|lots of) (floaters|spots|specks)/i, flag: 'Sudden floaters' },
        { pattern: /flash(es|ing) (of light|lights)/i, flag: 'Flashing lights' },
        { pattern: /halo(s|es) around lights?/i, flag: 'Halos (possible acute glaucoma)' },
        { pattern: /double vision (sudden|started)/i, flag: 'Sudden double vision' },
        { pattern: /(red|bloodshot) and (painful|hurts)/i, flag: 'Painful red eye' },
        { pattern: /(pus|discharge) and (pain|red)/i, flag: 'Infected eye' },
      ],
      soonAsPossible: [
        { pattern: /(blurr|blur)(y|ed|ing) (worsening|getting worse|progressing)/i, flag: 'Progressive vision loss' },
        { pattern: /(persistent|constant|won\'t go away) (pain|ache|discomfort)/i, flag: 'Persistent pain' },
        { pattern: /(can\'t|cannot|unable to) (focus|read)/i, flag: 'Focus problems' },
      ]
    };
  }

  analyze(userInput) {
    const flags = {
      immediate: [],
      urgent: [],
      soonAsPossible: [],
      urgencyLevel: 'normal'
    };

    // Check immediate emergencies
    for (const symptom of this.emergencySymptoms.immediate) {
      if (symptom.pattern.test(userInput)) {
        flags.immediate.push(symptom.flag);
        flags.urgencyLevel = 'emergency';
      }
    }

    // Check urgent situations
    for (const symptom of this.emergencySymptoms.urgent) {
      if (symptom.pattern.test(userInput)) {
        flags.urgent.push(symptom.flag);
        if (flags.urgencyLevel === 'normal') flags.urgencyLevel = 'urgent';
      }
    }

    // Check soon situations
    for (const symptom of this.emergencySymptoms.soonAsPossible) {
      if (symptom.pattern.test(userInput)) {
        flags.soonAsPossible.push(symptom.flag);
        if (flags.urgencyLevel === 'normal') flags.urgencyLevel = 'soon';
      }
    }

    return flags;
  }

  getUrgencyMessage(flags) {
    if (flags.immediate.length > 0) {
      return {
        level: 'emergency',
        icon: '',
        title: 'SEEK IMMEDIATE MEDICAL ATTENTION',
        message: `You've described symptoms that may indicate a serious eye emergency:\n\n${flags.immediate.map(f => `• ${f}`).join('\n')}\n\n**Go to the emergency room or call 911 immediately. Do not delay.**`
      };
    }

    if (flags.urgent.length > 0) {
      return {
        level: 'urgent',
        icon: '',
        title: 'SEE AN EYE DOCTOR TODAY',
        message: `These symptoms require prompt professional evaluation:\n\n${flags.urgent.map(f => `• ${f}`).join('\n')}\n\n**Contact an eye care professional today or visit urgent care.**`
      };
    }

    if (flags.soonAsPossible.length > 0) {
      return {
        level: 'soon',
        icon: '',
        title: 'Schedule an Eye Exam Soon',
        message: `You should schedule an appointment within the next few days:\n\n${flags.soonAsPossible.map(f => `• ${f}`).join('\n')}`
      };
    }

    return null;
  }
}

// ============================================================================
// 4⃣ CONDITION LIBRARY RAG - Retrieves relevant condition information
// ============================================================================

class ConditionLibraryRAG {
  constructor() {
    this.conditionIndex = this.buildIndex();
  }

  buildIndex() {
    const index = [];
    
    Object.entries(EYE_CONDITIONS).forEach(([id, condition]) => {
      // Index by symptoms
      condition.symptoms?.forEach(symptom => {
        index.push({
          type: 'symptom',
          text: symptom.toLowerCase(),
          conditionId: id,
          condition: condition
        });
      });

      // Index by description
      if (condition.description) {
        index.push({
          type: 'description',
          text: condition.description.toLowerCase(),
          conditionId: id,
          condition: condition
        });
      }

      // Index by name
      index.push({
        type: 'name',
        text: condition.name.toLowerCase(),
        conditionId: id,
        condition: condition
      });
    });

    return index;
  }

  search(query) {
    const queryLower = query.toLowerCase();
    const words = queryLower.split(/\s+/);
    
    const matches = new Map();

    this.conditionIndex.forEach(entry => {
      let score = 0;
      
      // Exact phrase match
      if (entry.text.includes(queryLower)) {
        score += entry.type === 'symptom' ? 10 : 5;
      }

      // Word matches
      words.forEach(word => {
        if (entry.text.includes(word) && word.length > 2) {
          score += entry.type === 'symptom' ? 3 : 1;
        }
      });

      if (score > 0) {
        const existing = matches.get(entry.conditionId) || { condition: entry.condition, score: 0 };
        existing.score += score;
        matches.set(entry.conditionId, existing);
      }
    });

    // Sort by score and return top matches
    return Array.from(matches.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(m => ({
        ...m.condition,
        id: m.condition.name.toLowerCase().replace(/\s+/g, '_'),
        confidence: Math.min(0.95, m.score / 20)
      }));
  }

  getConditionDetails(conditionId) {
    return EYE_CONDITIONS[conditionId] || null;
  }

  getRelatedConditions(conditionId, limit = 3) {
    const condition = this.getConditionDetails(conditionId);
    if (!condition) return [];

    // Find conditions with similar symptoms
    const allConditions = Object.entries(EYE_CONDITIONS);
    const related = [];

    allConditions.forEach(([id, otherCondition]) => {
      if (id === conditionId) return;

      const sharedSymptoms = condition.symptoms?.filter(s =>
        otherCondition.symptoms?.some(os => 
          os.toLowerCase().includes(s.toLowerCase()) ||
          s.toLowerCase().includes(os.toLowerCase())
        )
      ).length || 0;

      if (sharedSymptoms > 0) {
        related.push({
          ...otherCondition,
          id,
          similarity: sharedSymptoms
        });
      }
    });

    return related
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }
}

// ============================================================================
// 5⃣ SYMPTOM MATCHER - Advanced symptom recognition with NLP
// ============================================================================

class SymptomMatcher {
  constructor() {
    this.symptomPatterns = this.buildSymptomPatterns();
  }

  buildSymptomPatterns() {
    return {
      'dry eyes': [
        /\b(dry|dryness|itchy|scratchy|gritty|sandy)\s+(eyes?|feeling)\b/i,
        /eyes?\s+(feel|are)\s+(dry|itchy|scratchy)/i,
      ],
      'eye strain': [
        /\b(eye\s+strain|tired\s+eyes?|fatigue|exhausted\s+eyes?)\b/i,
        /eyes?\s+(feel|are)\s+(tired|strained|sore|achy)/i,
      ],
      'blurred vision': [
        /\b(blur|blurry|blurred|fuzzy|hazy|unfocused)\s+(vision|sight|eyes?)\b/i,
        /(can't|cannot|difficulty)\s+(focus|see\s+clearly)/i,
      ],
      'headaches': [
        /\b(headache|head\s+pain|migraine|head\s+hurt)/i,
        /pain\s+(in|behind|around)\s+(head|eyes?|temples?)/i,
      ],
      'light sensitivity': [
        /\b(sensitive|sensitivity)\s+to\s+(light|bright)/i,
        /\b(photophobia|light\s+hurts|squinting)/i,
        /(bright|lights?)\s+(hurt|painful|uncomfortable)/i,
      ],
      'double vision': [
        /\b(double\s+vision|seeing\s+double|diplopia)\b/i,
        /seeing\s+two\s+of\s+everything/i,
      ],
      'floaters': [
        /\b(floaters?|spots?|specks?|strings?)\s+(in|floating)/i,
        /seeing\s+(spots?|floaters?|specks?)/i,
      ],
      'redness': [
        /\b(red|bloodshot|pink)\s+eyes?\b/i,
        /eyes?\s+(are|look)\s+(red|bloodshot)/i,
      ],
      'pain': [
        /\b(eye\s+pain|painful|ache|aching|hurt|hurts|burning)\b/i,
        /pain\s+(in|behind)\s+eyes?/i,
      ],
      'tearing': [
        /\b(watery|watering|tearing|tears?)\s+eyes?\b/i,
        /eyes?\s+(water|tear)\s+(a\s+lot|too\s+much)/i,
      ],
      'difficulty focusing': [
        /\b(can't|cannot|difficulty|trouble|hard\s+to)\s+focus\b/i,
        /focus(ing)?\s+(is|problems?|issues?)/i,
      ],
      'night vision problems': [
        /\b(night\s+vision|seeing\s+at\s+night|dark)\s+(problems?|difficulty|trouble)\b/i,
        /(can't|cannot)\s+see\s+(at\s+night|in\s+dark)/i,
      ],
    };
  }

  detectSymptoms(userInput) {
    const detected = [];
    
    Object.entries(this.symptomPatterns).forEach(([symptom, patterns]) => {
      for (const pattern of patterns) {
        if (pattern.test(userInput)) {
          detected.push(symptom);
          break;
        }
      }
    });

    return [...new Set(detected)]; // Remove duplicates
  }

  extractDuration(userInput) {
    const durationPatterns = [
      { pattern: /(\d+)\s+(day|days)/i, unit: 'days' },
      { pattern: /(\d+)\s+(week|weeks)/i, unit: 'weeks' },
      { pattern: /(\d+)\s+(month|months)/i, unit: 'months' },
      { pattern: /(\d+)\s+(year|years)/i, unit: 'years' },
      { pattern: /\b(today|just\s+started|this\s+morning)\b/i, value: 'just started' },
      { pattern: /\b(few\s+days|couple\s+days)\b/i, value: 'few days' },
      { pattern: /\b(while|long\s+time|years)\b/i, value: 'long time' },
    ];

    for (const { pattern, unit, value } of durationPatterns) {
      const match = userInput.match(pattern);
      if (match) {
        if (value) return value;
        return `${match[1]} ${unit}`;
      }
    }

    return null;
  }

  extractSeverity(userInput) {
    if (/\b(severe|extreme|unbearable|terrible|awful|worst)\b/i.test(userInput)) {
      return 'severe';
    }
    if (/\b(moderate|pretty\s+bad|quite\s+bad)\b/i.test(userInput)) {
      return 'moderate';
    }
    if (/\b(mild|slight|little|minor)\b/i.test(userInput)) {
      return 'mild';
    }
    return null;
  }

  extractFrequency(userInput) {
    if (/\b(constant|constantly|always|all\s+the\s+time)\b/i.test(userInput)) {
      return 'constant';
    }
    if (/\b(intermittent|sometimes|occasionally|comes\s+and\s+goes)\b/i.test(userInput)) {
      return 'intermittent';
    }
    if (/\b(after|during|when)\s+(screen|computer|reading|work)/i.test(userInput)) {
      return 'activity-related';
    }
    return null;
  }
}

// ============================================================================
// 6⃣ USER PROFILE INTEGRATOR - Personalizes based on user data
// ============================================================================

class UserProfileIntegrator {
  constructor(userProfile = null) {
    this.profile = userProfile || this.getDefaultProfile();
  }

  getDefaultProfile() {
    return {
      age: null,
      screenTimeDaily: null,
      wearGlasses: null,
      existingConditions: [],
      lifestyle: {
        outdoorTime: null,
        sleepHours: null,
        workType: null,
      },
    };
  }

  updateProfile(updates) {
    this.profile = { ...this.profile, ...updates };
  }

  getRiskFactors() {
    const risks = [];

    if (this.profile.age > 40) {
      risks.push({ factor: 'Age over 40', impact: 'Increased risk of presbyopia and age-related conditions' });
    }

    if (this.profile.screenTimeDaily > 8) {
      risks.push({ factor: 'High screen time', impact: 'Increased risk of digital eye strain' });
    }

    if (this.profile.lifestyle.sleepHours < 7) {
      risks.push({ factor: 'Insufficient sleep', impact: 'Eye fatigue and dry eyes' });
    }

    return risks;
  }

  getPersonalizedRecommendations(conditions) {
    const recommendations = [];

    // Lifestyle-based
    if (this.profile.screenTimeDaily > 6) {
      recommendations.push({
        category: 'Screen Time',
        priority: 'high',
        action: 'Implement the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds',
      });
    }

    if (this.profile.lifestyle.outdoorTime < 60) {
      recommendations.push({
        category: 'Outdoor Time',
        priority: 'medium',
        action: 'Increase outdoor time to at least 2 hours daily to reduce myopia progression risk',
      });
    }

    // Age-based
    if (this.profile.age > 40 && !this.profile.wearGlasses) {
      recommendations.push({
        category: 'Eye Exam',
        priority: 'high',
        action: 'Schedule a comprehensive eye exam to check for presbyopia and other age-related changes',
      });
    }

    return recommendations;
  }
}

// ============================================================================
// 7⃣ STRUCTURED RESPONSE GENERATOR - Formats professional responses
// ============================================================================

class StructuredResponseGenerator {
  generateResponse(analysisData) {
    const {
      detectedSymptoms,
      matchedConditions,
      redFlags,
      recommendations,
      followUpQuestions,
      urgencyInfo,
      personalizedAdvice,
    } = analysisData;

    let response = '';

    // 1. Urgency Warning (if any)
    if (urgencyInfo) {
      response += `${urgencyInfo.icon} **${urgencyInfo.title}**\n\n`;
      response += `${urgencyInfo.message}\n\n`;
      response += '---\n\n';
    }

    // 2. Symptom Summary
    if (detectedSymptoms && detectedSymptoms.length > 0) {
      response += '** Symptoms Identified:**\n';
      response += detectedSymptoms.map(s => `• ${this.capitalize(s)}`).join('\n');
      response += '\n\n';
    }

    // 3. Possible Conditions
    if (matchedConditions && matchedConditions.length > 0) {
      response += '** Possible Conditions:**\n\n';
      matchedConditions.forEach((condition, idx) => {
        const confidence = Math.round(condition.confidence * 100);
        response += `${idx + 1}. **${condition.name}** (${confidence}% match)\n`;
        response += `   ${condition.description}\n`;
        response += `   *Severity: ${condition.severity}*\n\n`;
      });
    }

    // 4. Personalized Recommendations
    if (recommendations && recommendations.length > 0) {
      response += '** Recommendations:**\n\n';
      recommendations.forEach(rec => {
        const emoji = rec.priority === 'high' ? '' : rec.priority === 'medium' ? '' : '';
        response += `${emoji} **${rec.category}**: ${rec.action}\n\n`;
      });
    }

    // 5. Follow-up Questions
    if (followUpQuestions && followUpQuestions.length > 0) {
      response += '**❓ To better help you, could you tell me:**\n';
      followUpQuestions.forEach(q => {
        response += `• ${q}\n`;
      });
      response += '\n';
    }

    // 6. Educational Information
    if (matchedConditions && matchedConditions.length > 0) {
      response += '**📚 Learn More:**\n';
      response += 'Click on any condition above to see detailed information, prevention tips, and warning signs.\n\n';
    }

    // 7. Disclaimer
    response += '---\n';
    response += '_ This is educational information only. Not medical advice. Always consult an eye care professional for diagnosis and treatment._';

    return response;
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatConditionCard(condition) {
    return {
      name: condition.name,
      severity: condition.severity,
      confidence: condition.confidence,
      description: condition.description,
      keySymptoms: condition.symptoms?.slice(0, 3) || [],
      topRiskFactors: condition.riskFactors?.slice(0, 2) || [],
    };
  }
}

// ============================================================================
// 8⃣ TEST RECOMMENDATION ENGINE - Suggests relevant tests
// ============================================================================

class TestRecommendationEngine {
  constructor() {
    this.testDatabase = {
      visual_acuity: {
        name: 'Visual Acuity Test',
        description: 'Check clarity of your vision',
        icon: '',
        duration: '2 min',
        relevantFor: ['blurred vision', 'difficulty focusing', 'myopia', 'hyperopia'],
      },
      amsler_grid: {
        name: 'Amsler Grid Test',
        description: 'Detect central vision problems',
        icon: '',
        duration: '1 min',
        relevantFor: ['wavy lines', 'distorted vision', 'macular problems'],
      },
      color_vision: {
        name: 'Color Vision Test',
        description: 'Check color perception',
        icon: '',
        duration: '3 min',
        relevantFor: ['color blindness', 'difficulty distinguishing colors'],
      },
      astigmatism: {
        name: 'Astigmatism Test',
        description: 'Check for astigmatism',
        icon: '',
        duration: '2 min',
        relevantFor: ['blurred vision', 'astigmatism', 'distorted vision'],
      },
      contrast_sensitivity: {
        name: 'Contrast Sensitivity',
        description: 'Test ability to see contrasts',
        icon: '',
        duration: '3 min',
        relevantFor: ['night vision', 'difficulty in dim light', 'cataracts'],
      },
      eye_tracking: {
        name: 'Eye Tracking & Blink Analysis',
        description: 'Monitor fatigue and blink rate',
        icon: '',
        duration: '5 min',
        relevantFor: ['eye strain', 'dry eyes', 'fatigue', 'digital eye strain'],
      },
    };
  }

  recommendTests(symptoms, conditions) {
    const recommended = [];
    const symptomsLower = symptoms.map(s => s.toLowerCase());

    Object.entries(this.testDatabase).forEach(([id, test]) => {
      let relevance = 0;

      // Check symptom relevance
      symptomsLower.forEach(symptom => {
        if (test.relevantFor.some(rf => symptom.includes(rf) || rf.includes(symptom))) {
          relevance += 2;
        }
      });

      // Check condition relevance
      conditions.forEach(condition => {
        const conditionName = condition.name.toLowerCase();
        if (test.relevantFor.some(rf => conditionName.includes(rf) || rf.includes(conditionName))) {
          relevance += 3;
        }
      });

      if (relevance > 0) {
        recommended.push({
          ...test,
          id,
          relevanceScore: relevance,
        });
      }
    });

    return recommended
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 3);
  }

  getTestRoute(testId) {
    const routes = {
      visual_acuity: '/vision-tests',
      amsler_grid: '/vision-tests',
      color_vision: '/vision-tests',
      astigmatism: '/vision-tests',
      contrast_sensitivity: '/vision-tests',
      eye_tracking: '/eye-tracking-analysis',
    };
    return routes[testId] || '/vision-tests';
  }
}

// ============================================================================
// 9⃣ DOCTOR-REFERRAL LOGIC - Determines when professional care is needed
// ============================================================================

class DoctorReferralLogic {
  assessNeed(symptoms, conditions, redFlags, duration) {
    const assessment = {
      needsReferral: false,
      urgency: 'routine',
      reason: '',
      timeframe: '',
      specialist: 'optometrist',
    };

    // Immediate emergencies
    if (redFlags.immediate.length > 0) {
      assessment.needsReferral = true;
      assessment.urgency = 'emergency';
      assessment.reason = 'Emergency symptoms detected';
      assessment.timeframe = 'Go to ER immediately';
      assessment.specialist = 'emergency room';
      return assessment;
    }

    // Urgent situations
    if (redFlags.urgent.length > 0) {
      assessment.needsReferral = true;
      assessment.urgency = 'urgent';
      assessment.reason = 'Symptoms require prompt evaluation';
      assessment.timeframe = 'Within 24 hours';
      assessment.specialist = 'ophthalmologist';
      return assessment;
    }

    // Check condition severity
    const hasSevereCondition = conditions.some(c => c.severity === 'severe');
    if (hasSevereCondition) {
      assessment.needsReferral = true;
      assessment.urgency = 'soon';
      assessment.reason = 'Potential serious condition';
      assessment.timeframe = 'Within 1 week';
      assessment.specialist = 'ophthalmologist';
      return assessment;
    }

    // Check symptom duration
    if (duration && this.isDurationLong(duration)) {
      assessment.needsReferral = true;
      assessment.urgency = 'routine';
      assessment.reason = 'Persistent symptoms';
      assessment.timeframe = 'Within 2-4 weeks';
      assessment.specialist = 'optometrist';
      return assessment;
    }

    // Routine check
    assessment.needsReferral = true;
    assessment.urgency = 'routine';
    assessment.reason = 'General eye health check';
    assessment.timeframe = 'Annual exam recommended';
    assessment.specialist = 'optometrist';

    return assessment;
  }

  isDurationLong(duration) {
    if (typeof duration !== 'string') return false;
    
    const longTermIndicators = [
      'months', 'month', 'years', 'year', 'long time', 'while'
    ];
    
    return longTermIndicators.some(indicator => 
      duration.toLowerCase().includes(indicator)
    );
  }

  generateReferralMessage(assessment) {
    const messages = {
      emergency: {
        icon: '',
        title: 'EMERGENCY - SEEK IMMEDIATE CARE',
        body: 'Based on your symptoms, you need immediate medical attention. Go to the emergency room or call 911 now.',
      },
      urgent: {
        icon: '',
        title: 'URGENT - SEE A DOCTOR TODAY',
        body: 'Your symptoms require prompt professional evaluation. Contact an eye care provider today or visit urgent care.',
      },
      soon: {
        icon: '',
        title: 'Schedule an Appointment Soon',
        body: 'You should see an eye care professional within the next week to have these symptoms evaluated properly.',
      },
      routine: {
        icon: '',
        title: 'Consider Scheduling an Eye Exam',
        body: 'Regular eye exams are important for maintaining eye health. Consider scheduling an appointment for a comprehensive evaluation.',
      },
    };

    const message = messages[assessment.urgency];
    
    return {
      ...message,
      specialist: `Recommended specialist: ${this.capitalize(assessment.specialist)}`,
      timeframe: assessment.timeframe,
      reason: assessment.reason,
    };
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// ============================================================================
//  MASTER ENGINE - Orchestrates all components
// ============================================================================

export class AdvancedChatbotEngine {
  constructor(userProfile = null) {
    this.conversationManager = new ConversationManager();
    this.safetyFilter = new MedicalSafetyFilter();
    this.redFlagDetector = new RedFlagDetector();
    this.conditionRAG = new ConditionLibraryRAG();
    this.symptomMatcher = new SymptomMatcher();
    this.profileIntegrator = new UserProfileIntegrator(userProfile);
    this.responseGenerator = new StructuredResponseGenerator();
    this.testRecommender = new TestRecommendationEngine();
    this.referralLogic = new DoctorReferralLogic();
  }

  async processMessage(userInput) {
    // 1. Check for safety issues
    if (this.safetyFilter.requiresProfessionalConsult(userInput)) {
      const redFlags = this.redFlagDetector.analyze(userInput);
      const urgencyMessage = this.redFlagDetector.getUrgencyMessage(redFlags);
      
      return {
        response: this.safetyFilter.wrapWithDisclaimer(urgencyMessage.message),
        urgency: urgencyMessage.level,
        redFlags,
        needsImmediateAction: true,
      };
    }

    // 2. Detect symptoms and extract context
    const symptoms = this.symptomMatcher.detectSymptoms(userInput);
    const duration = this.symptomMatcher.extractDuration(userInput);
    const severity = this.symptomMatcher.extractSeverity(userInput);
    const frequency = this.symptomMatcher.extractFrequency(userInput);

    // 3. Update conversation context
    symptoms.forEach(s => this.conversationManager.addSymptom(s));
    this.conversationManager.updateContext({ duration, severity, frequency });

    // 4. Check for red flags
    const redFlags = this.redFlagDetector.analyze(userInput);
    const urgencyMessage = this.redFlagDetector.getUrgencyMessage(redFlags);

    // 5. Match conditions using RAG
    const matchedConditions = this.conditionRAG.search(userInput);

    // 6. Get personalized recommendations
    const personalizedRecs = this.profileIntegrator.getPersonalizedRecommendations(matchedConditions);

    // 7. Recommend relevant tests
    const recommendedTests = this.testRecommender.recommendTests(symptoms, matchedConditions);

    // 8. Assess doctor referral need
    const referralAssessment = this.referralLogic.assessNeed(
      symptoms,
      matchedConditions,
      redFlags,
      duration
    );
    const referralMessage = this.referralLogic.generateReferralMessage(referralAssessment);

    // 9. Generate follow-up questions
    const followUpQuestions = this.conversationManager.needsMoreInfo() 
      ? this.conversationManager.getFollowUpQuestions() 
      : [];

    // 10. Generate structured response
    const response = this.responseGenerator.generateResponse({
      detectedSymptoms: symptoms,
      matchedConditions,
      redFlags,
      recommendations: personalizedRecs,
      followUpQuestions,
      urgencyInfo: urgencyMessage,
    });

    // 11. Apply safety filter
    const safeResponse = this.safetyFilter.filterResponse(response);

    return {
      response: safeResponse,
      conditions: matchedConditions,
      symptoms,
      recommendedTests,
      referralInfo: referralMessage,
      redFlags,
      urgency: redFlags.urgencyLevel,
      context: this.conversationManager.getContext(),
    };
  }

  reset() {
    this.conversationManager.reset();
  }

  updateUserProfile(updates) {
    this.profileIntegrator.updateProfile(updates);
  }
}

// Export singleton instance
let engineInstance = null;

export const getChatbotEngine = (userProfile = null) => {
  if (!engineInstance) {
    engineInstance = new AdvancedChatbotEngine(userProfile);
  }
  return engineInstance;
};

export const resetChatbotEngine = () => {
  engineInstance = null;
};
