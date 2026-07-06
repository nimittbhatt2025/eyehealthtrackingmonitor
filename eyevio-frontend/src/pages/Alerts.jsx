import { useState, useEffect } from 'react'
import { alertsAPI } from '../services/api'
import { toast } from 'react-hot-toast'

function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, critical

  useEffect(() => {
    loadAlerts()
  }, [filter])

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filter === 'unread') params.unread = true
      if (filter === 'critical') params.severity = 'critical'
      
      const response = await alertsAPI.getAll(params)
      setAlerts(response.data.alerts || [])
    } catch (error) {
      console.error('Failed to load alerts:', error)
      setAlerts([])
    } finally {
      setLoading(false)
    }
  }

  const handleMarkRead = async (id) => {
    try {
      await alertsAPI.markRead(id)
      setAlerts(alerts.map(alert => 
        alert.id === id ? { ...alert, read: true } : alert
      ))
      toast.success('Alert marked as read')
    } catch (error) {
      console.error('Failed to mark alert as read:', error)
    }
  }

  const handleDismiss = async (id) => {
    try {
      await alertsAPI.dismiss(id)
      setAlerts(alerts.filter(alert => alert.id !== id))
      toast.success('Alert dismissed')
    } catch (error) {
      console.error('Failed to dismiss alert:', error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await alertsAPI.markAllRead()
      setAlerts(alerts.map(alert => ({ ...alert, read: true })))
      toast.success('All alerts marked as read')
    } catch (error) {
      console.error('Failed to mark all as read:', error)
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  // Text label so severity is never communicated by color alone
  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'critical':
        return { label: 'Needs attention', className: 'bg-red-100 text-red-800' }
      case 'warning':
        return { label: 'Heads-up', className: 'bg-yellow-100 text-yellow-900' }
      case 'info':
        return { label: 'Info', className: 'bg-blue-100 text-blue-800' }
      default:
        return { label: 'Reminder', className: 'bg-gray-100 text-gray-700' }
    }
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return (
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      case 'info':
        return (
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
      default:
        return (
          <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        )
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const unreadCount = alerts.filter(a => !a.read).length

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-serif font-bold text-gray-900">Alerts & Notifications</h1>
          <p className="text-gray-600 mt-2 text-lg">
            Stay informed about your vision health
            {unreadCount > 0 && (
              <span className="ml-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="px-6 py-3 bg-primary-600 text-white rounded-full font-semibold hover:bg-primary-700 transition-colors"
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 bg-white rounded-full p-1 border border-gray-200 w-fit">
        {['all', 'unread', 'critical'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-6 py-3 rounded-full font-semibold text-sm transition-colors capitalize ${
              filter === tab
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No alerts</h3>
          <p className="text-gray-600">You're all caught up! Check back later for new notifications.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`${getSeverityColor(alert.severity)} border-2 rounded-2xl p-6 transition-all ${
                !alert.read ? 'shadow-md' : 'opacity-75'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4 flex-1">
                  {/* Icon */}
                  <div className="flex-shrink-0" aria-hidden="true">
                    {getSeverityIcon(alert.severity)}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getSeverityBadge(alert.severity).className}`}>
                        {getSeverityBadge(alert.severity).label}
                      </span>
                      <h3 className="text-lg font-semibold text-gray-900">{alert.title}</h3>
                      {!alert.read && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">New</span>
                      )}
                      <span className="text-sm text-gray-500">{formatDate(alert.created_at)}</span>
                    </div>
                    
                    <p className="text-gray-700 leading-relaxed mb-4">{alert.message}</p>

                    {alert.action_url && (
                      <a
                        href={alert.action_url}
                        className="inline-flex items-center text-primary-600 hover:text-primary-700 font-semibold text-sm"
                      >
                        {alert.action_text || 'Take Action'}
                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 ml-4">
                  {!alert.read && (
                    <button
                      onClick={() => handleMarkRead(alert.id)}
                      className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Mark as read"
                      aria-label={`Mark "${alert.title}" as read`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(alert.id)}
                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Dismiss"
                    aria-label={`Dismiss "${alert.title}"`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Alerts
