import { useState } from 'react'
import { toast } from 'react-hot-toast'

function Help() {
  const [activeCategory, setActiveCategory] = useState('getting-started')
  const [expandedFaq, setExpandedFaq] = useState(null)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })

  const faqs = {
    'getting-started': [
      {
        q: 'How do I take my first vision test?',
        a: 'Navigate to Vision Tests from the sidebar, select a test type (Acuity, Contrast, or Color Blindness), and follow the on-screen instructions. Make sure you\'re in a well-lit environment and positioned about 2-3 feet from your screen.'
      },
      {
        q: 'How often should I test my vision?',
        a: 'We recommend taking vision tests weekly for consistent tracking. However, if you notice any changes in your vision or experience eye strain, test more frequently.'
      },
      {
        q: 'What do the test scores mean?',
        a: 'Scores are displayed as percentages. 90-100% indicates excellent vision, 70-89% is good, 50-69% is fair, and below 50% suggests you should consult an eye care professional.'
      },
    ],
    'vision-tests': [
      {
        q: 'What is the Visual Acuity Test?',
        a: 'This test measures how clearly you can see letters at different sizes, similar to traditional eye charts. It helps identify potential nearsightedness or farsightedness.'
      },
      {
        q: 'What does the Contrast Sensitivity Test measure?',
        a: 'Contrast sensitivity tests your ability to distinguish between objects and their background, which is crucial for night driving and reading in low light.'
      },
      {
        q: 'How accurate are these online tests?',
        a: 'While our tests provide good screening indicators, they are NOT a replacement for professional eye exams. Always consult with an optometrist or ophthalmologist for clinical diagnosis.'
      },
    ],
    'lifestyle-tracking': [
      {
        q: 'Why track lifestyle factors?',
        a: 'Research shows that screen time, sleep, outdoor activity, and diet significantly impact eye health. Tracking these helps identify patterns affecting your vision.'
      },
      {
        q: 'How is the correlation calculated?',
        a: 'Our AI analyzes relationships between your lifestyle habits and vision test scores over time to identify which factors most influence your eye health.'
      },
    ],
    'eye-tracking': [
      {
        q: 'How does eye tracking analysis work?',
        a: 'We use MediaPipe\'s advanced face mesh detection for real-time eye tracking. This provides accurate blink detection, gaze patterns, and fatigue monitoring - all processed locally in your browser.'
      },
      {
        q: 'Is my webcam data stored?',
        a: 'No! All webcam processing happens locally in your browser. No video or images are sent to our servers. Only anonymized metrics are stored if you save a session.'
      },
    ],
    'data-privacy': [
      {
        q: 'How is my data protected?',
        a: 'We use industry-standard encryption (AES-256) for data storage and HTTPS for all transmissions. Your data is never shared with third parties without explicit consent.'
      },
      {
        q: 'Can I export or delete my data?',
        a: 'Yes! Go to Settings → Privacy & Data to export all your data as JSON or permanently delete your account and all associated data.'
      },
      {
        q: 'Do you sell my health data?',
        a: 'Absolutely not. We never sell user data. Anonymous aggregated statistics may be used for research purposes only with your permission (opt-in via Settings).'
      },
    ],
  }

  const tips = [
    {
      icon: null,
      title: '20-20-20 Rule',
      desc: 'Every 20 minutes, look at something 20 feet away for 20 seconds to reduce eye strain.'
    },
    {
      icon: null,
      title: 'Outdoor Time',
      desc: 'Spend at least 2 hours outdoors daily. Natural light helps prevent myopia, especially in children.'
    },
    {
      icon: null,
      title: 'Stay Hydrated',
      desc: 'Drink 8 glasses of water daily. Dehydration can cause dry eyes and blurred vision.'
    },
    {
      icon: null,
      title: 'Eye-Healthy Diet',
      desc: 'Eat foods rich in Vitamin A, C, E, and Omega-3s: carrots, spinach, fish, nuts, and citrus fruits.'
    },
    {
      icon: null,
      title: 'Quality Sleep',
      desc: 'Get 7-8 hours of sleep. During sleep, your eyes replenish nutrients and clear out irritants.'
    },
    {
      icon: null,
      title: 'Screen Position',
      desc: 'Position your screen 20-26 inches away and slightly below eye level. Use blue light filters at night.'
    },
  ]

  const glossary = [
    { term: 'Visual Acuity', def: 'The clarity or sharpness of vision, measured as the smallest detail you can see.' },
    { term: 'Contrast Sensitivity', def: 'Ability to distinguish between an object and its background.' },
    { term: 'Myopia', def: 'Nearsightedness - distant objects appear blurry.' },
    { term: 'Hyperopia', def: 'Farsightedness - close objects appear blurry.' },
    { term: 'Astigmatism', def: 'Irregular cornea curvature causing blurred vision at all distances.' },
    { term: 'Eye Strain', def: 'Tired, sore, or irritated eyes from prolonged use, often digital devices.' },
    { term: 'Blue Light', def: 'High-energy visible light from screens that may disrupt sleep and cause eye fatigue.' },
    { term: 'Blink Rate', def: 'Number of blinks per minute. Normal is 15-20; decreases during screen use.' },
  ]

  const handleContactSubmit = (e) => {
    e.preventDefault()
    // In production, this would send to backend
    toast.success('Message sent! We\'ll respond within 24 hours.')
    setContactForm({ name: '', email: '', subject: '', message: '' })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h1 className="page-title">Help & Resources</h1>
        <p className="page-subtitle">Everything you need to know about EyeVio</p>
      </div>

      {/* Quick Links */}
      <div className="grid md:grid-cols-4 gap-4">
        <a href="#faqs" className="card-hover block">
          <div className="text-sm font-medium text-accent-600 mb-2">Quick Access</div>
          <div className="font-semibold text-gray-900">FAQs</div>
          <div className="text-sm text-gray-600 mt-1">Find quick answers</div>
        </a>
        <a href="#tips" className="card-hover block">
          <div className="text-sm font-medium text-accent-600 mb-2">Expert Advice</div>
          <div className="font-semibold text-gray-900">Eye Health Tips</div>
          <div className="text-sm text-gray-600 mt-1">Professional guidance</div>
        </a>
        <a href="#glossary" className="card-hover block">
          <div className="text-sm font-medium text-accent-600 mb-2">Reference</div>
          <div className="font-semibold text-gray-900">Glossary</div>
          <div className="text-sm text-gray-600 mt-1">Vision terms</div>
        </a>
        <a href="#contact" className="card-hover block">
          <div className="text-sm font-medium text-accent-600 mb-2">Support</div>
          <div className="font-semibold text-gray-900">Contact Us</div>
          <div className="text-sm text-gray-600 mt-1">Get in touch</div>
        </a>
      </div>

      {/* FAQs */}
      <div id="faqs" className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-8">
        <h2 className="section-title mb-6">Frequently Asked Questions</h2>
        
        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'getting-started', label: 'Getting Started' },
            { id: 'vision-tests', label: 'Vision Tests' },
            { id: 'lifestyle-tracking', label: 'Lifestyle' },
            { id: 'eye-tracking', label: 'Eye Tracking' },
            { id: 'data-privacy', label: 'Privacy' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeCategory === cat.id
                  ? 'bg-accent-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {faqs[activeCategory].map((faq, idx) => (
            <div key={idx} className="border border-gray-100/80 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <span className="font-semibold text-gray-900">{faq.q}</span>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${
                    expandedFaq === idx ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedFaq === idx && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <p className="text-gray-700 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Eye Health Tips */}
      <div id="tips" className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-8">
        <h2 className="section-title mb-6">Eye Health Tips</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {tips.map((tip, idx) => (
            <div key={idx} className="flex items-start space-x-4 p-6 bg-brand-soft rounded-xl border border-gray-100/80">
              <div className="w-10 h-10 bg-accent-600 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 text-lg mb-2">{tip.title}</h3>
                <p className="text-gray-700 leading-relaxed">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Glossary */}
      <div id="glossary" className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-8">
        <h2 className="section-title mb-6">Vision Terms Glossary</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {glossary.map((item, idx) => (
            <div key={idx} className="p-4 bg-gray-50 rounded-xl">
              <div className="font-semibold text-accent-700 mb-1">{item.term}</div>
              <div className="text-sm text-gray-700">{item.def}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Form */}
      <div id="contact" className="bg-white rounded-2xl shadow-card border border-gray-100/80 p-8">
        <h2 className="section-title mb-6">Contact Support</h2>
        <form onSubmit={handleContactSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
              <input
                type="text"
                required
                value={contactForm.name}
                onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
              <input
                type="email"
                required
                value={contactForm.email}
                onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Subject</label>
            <input
              type="text"
              required
              value={contactForm.subject}
              onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">Message</label>
            <textarea
              required
              rows="6"
              value={contactForm.message}
              onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
              className="input resize-none"
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
          >
            Send Message
          </button>
        </form>
      </div>
    </div>
  )
}

export default Help
