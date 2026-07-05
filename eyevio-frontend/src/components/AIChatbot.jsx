import React, { useState, useRef, useEffect } from 'react';
import { FaRobot, FaTimes, FaPaperPlane, FaSpinner, FaExclamationTriangle, FaStethoscope, FaVial, FaExpand, FaCompress } from 'react-icons/fa';
import { getChatbotEngine } from '../utils/advancedChatbotEngine';
import { useNavigate } from 'react-router-dom';

const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your **EyeVio AI Medical Assistant** powered by advanced symptom analysis.\n\nI can help you:\n• Identify possible eye conditions\n• Assess symptom urgency\n• Recommend relevant tests\n• Guide you on when to see a doctor\n\n**Tell me about your symptoms** and I'll provide personalized guidance.\n\n_Note: I provide educational information only - not medical diagnosis._",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const chatbotEngine = useRef(getChatbotEngine());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Process with advanced engine
    setTimeout(async () => {
      try {
        const analysis = await chatbotEngine.current.processMessage(input);

        // Build assistant message with all components
        const assistantMessage = {
          role: 'assistant',
          content: analysis.response,
          conditions: analysis.conditions,
          recommendedTests: analysis.recommendedTests,
          referralInfo: analysis.referralInfo,
          urgency: analysis.urgency,
          redFlags: analysis.redFlags,
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Chatbot error:', error);
        const errorMessage = {
          role: 'assistant',
          content: "I'm sorry, I encountered an error processing your message. Please try rephrasing your question or contact support if the issue persists.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
    }, 1500);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleConditionClick = (conditionId) => {
    navigate(`/eye-conditions?condition=${conditionId}`);
    setIsOpen(false);
  };

  const quickQuestions = [
    'My eyes feel dry and tired after screens',
    'I have severe headaches and blurred vision',
    'Sudden flashes of light in my eye',
    'I see double vision when reading',
    'My vision has been getting progressively worse',
  ];

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-white hover:bg-gray-50 p-2 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 flex items-center justify-center group border-2 border-indigo-200"
          aria-label="Open AI Chatbot"
        >
          <img src="/chatbot-logo.svg" alt="AI Assistant" className="w-14 h-14" />
          <span className="absolute right-full mr-3 bg-gray-900 text-white text-sm px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none">
            Ask about your symptoms
          </span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          isExpanded 
            ? 'top-20 bottom-6 left-6 right-6 md:left-[50%] md:right-6' 
            : 'bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-3rem)]'
        }`}>
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white p-1 rounded-full">
                <img src="/chatbot-logo.svg" alt="AI Assistant" className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg">EyeVio AI Assistant</h3>
                <p className="text-xs text-indigo-100">Powered by AI • Educational Only</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="hover:bg-white/20 p-2 rounded-full transition-colors"
                aria-label={isExpanded ? "Collapse chat" : "Expand chat"}
                title={isExpanded ? "Collapse" : "Expand to half screen"}
              >
                {isExpanded ? <FaCompress className="w-4 h-4" /> : <FaExpand className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/20 p-2 rounded-full transition-colors"
                aria-label="Close chat"
              >
                <FaTimes className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {/* Urgency Badge */}
                  {msg.urgency && msg.urgency !== 'normal' && (
                    <div className={`mb-3 pb-3 border-b ${
                      msg.urgency === 'emergency' ? 'border-red-300 bg-red-50' :
                      msg.urgency === 'urgent' ? 'border-orange-300 bg-orange-50' :
                      'border-yellow-300 bg-yellow-50'
                    } -mx-4 -mt-3 px-4 pt-3 rounded-t-2xl`}>
                      <div className="flex items-center space-x-2">
                        <FaExclamationTriangle className={
                          msg.urgency === 'emergency' ? 'text-red-600' :
                          msg.urgency === 'urgent' ? 'text-orange-600' :
                          'text-yellow-600'
                        } />
                        <span className={`text-xs font-bold ${
                          msg.urgency === 'emergency' ? 'text-red-900' :
                          msg.urgency === 'urgent' ? 'text-orange-900' :
                          'text-yellow-900'
                        }`}>
                          {msg.urgency === 'emergency' ? 'EMERGENCY' :
                           msg.urgency === 'urgent' ? 'URGENT' :
                           msg.urgency === 'soon' ? 'NEEDS ATTENTION' : 'ALERT'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Format markdown-style text */}
                  {msg.content.split('\n').map((line, i) => {
                    // Bold text
                    const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    // Italic text
                    const withItalics = formattedLine.replace(/_(.*?)_/g, '<em>$1</em>');
                    
                    return (
                      <p
                        key={i}
                        className={`${i > 0 ? 'mt-2' : ''} ${line.startsWith('•') || line.match(/^\d+\./) ? 'text-sm' : ''} ${line.startsWith('---') ? 'border-t border-gray-300 mt-4 pt-4' : ''}`}
                        dangerouslySetInnerHTML={{ __html: line === '---' ? '' : withItalics }}
                      />
                    );
                  })}

                  {/* Referral Information */}
                  {msg.referralInfo && msg.referralInfo.urgency !== 'routine' && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/20 -mx-4 px-4 py-3 -mb-3 rounded-b-2xl">
                      <div className="flex items-start space-x-2">
                        <FaStethoscope className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            {msg.referralInfo.title}
                          </p>
                          <p className="text-blue-800 dark:text-blue-200 mb-1">
                            {msg.referralInfo.specialist}
                          </p>
                          <p className="text-blue-700 dark:text-blue-300">
                            Timeframe: {msg.referralInfo.timeframe}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recommended Tests */}
                  {msg.recommendedTests && msg.recommendedTests.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center space-x-2 mb-2">
                        <FaVial className="text-purple-600 dark:text-purple-400" />
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                          Recommended Tests:
                        </p>
                      </div>
                      <div className="space-y-2">
                        {msg.recommendedTests.map((test, testIdx) => (
                          <button
                            key={testIdx}
                            onClick={() => {
                              navigate(test.id === 'eye_tracking' ? '/eye-tracking-analysis' : '/vision-tests');
                              setIsOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className="text-lg">{test.icon}</span>
                                <div>
                                  <p className="text-xs font-semibold text-purple-900 dark:text-purple-100">
                                    {test.name}
                                  </p>
                                  <p className="text-xs text-purple-700 dark:text-purple-300">
                                    {test.description} • {test.duration}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs text-purple-600 dark:text-purple-400">→</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Condition Links */}
                  {msg.conditions && msg.conditions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">Learn More About These Conditions:</p>
                      <div className="flex flex-wrap gap-2">
                        {msg.conditions.slice(0, 4).map((condition) => (
                          <button
                            key={condition.id || condition.name}
                            onClick={() => handleConditionClick(condition.id || condition.name.toLowerCase().replace(/\s+/g, '_'))}
                            className="text-xs px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors flex items-center space-x-1"
                          >
                            <span>{condition.name}</span>
                            {condition.confidence && (
                              <span className="text-indigo-500 dark:text-indigo-400">
                                ({Math.round(condition.confidence * 100)}%)
                              </span>
                            )}
                            <span>→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <FaSpinner className="w-4 h-4 animate-spin text-indigo-600" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Analyzing symptoms...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions (only show if no messages yet) */}
          {messages.length === 1 && (
            <div className="px-4 py-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">Quick questions:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(q)}
                    className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-end space-x-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Describe your symptoms..."
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows="2"
                disabled={isTyping}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors"
                aria-label="Send message"
              >
                <FaPaperPlane className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
              Educational information only • Not medical advice
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatbot;
