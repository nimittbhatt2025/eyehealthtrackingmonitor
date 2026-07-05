import { Component } from 'react'
import { Link } from 'react-router-dom'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    })
    
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // In production, you would send this to an error tracking service like Sentry
    // logErrorToService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#f3f0e9] to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border-2 border-red-200 dark:border-red-900 p-8 md:p-12">
              {/* Error Icon */}
              <div className="w-16 h-16 md:w-20 md:h-20 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              {/* Error Message */}
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900 dark:text-white text-center mb-4">
                Oops! Something went wrong
              </h1>
              <p className="text-base md:text-lg text-gray-600 dark:text-gray-300 text-center mb-8">
                We apologize for the inconvenience. The page encountered an unexpected error.
              </p>

              {/* Error Details (Development Mode) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                  <h3 className="font-semibold text-red-900 dark:text-red-400 mb-2">Error Details:</h3>
                  <pre className="text-xs text-red-800 dark:text-red-300 overflow-auto max-h-40">
                    {this.state.error.toString()}
                  </pre>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-red-700 dark:text-red-400 hover:underline">
                        Stack Trace
                      </summary>
                      <pre className="text-xs text-red-800 dark:text-red-300 overflow-auto max-h-60 mt-2">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={this.handleReset}
                  className="bg-gradient-to-r from-[#7dcab9] to-[#a39c85] text-white font-semibold px-6 py-3 rounded-xl hover:shadow-lg transition-all min-h-[44px]"
                >
                  Try Again
                </button>
                <Link
                  to="/dashboard"
                  className="bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-2 border-gray-200 dark:border-gray-600 font-semibold px-6 py-3 rounded-xl hover:shadow-lg transition-all min-h-[44px] flex items-center justify-center"
                >
                  Go to Dashboard
                </Link>
              </div>

              {/* Help Text */}
              <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  If this problem persists, please contact support or try refreshing the page.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
