import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useKeyboardShortcuts } from '../../context/KeyboardShortcutsContext'
import { useState, useEffect } from 'react'
import { alertsAPI } from '../../services/api'
import { 
  FaBell, 
  FaBars,
  FaKeyboard
} from 'react-icons/fa'

function Navbar({ toggleSidebar }) {
  const { user, logout } = useAuthStore()
  const { showShortcutsHelp } = useKeyboardShortcuts()
  const [notificationCount, setNotificationCount] = useState(0)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    try {
      const response = await alertsAPI.getAll({ limit: 100 })
      const unreadCount = response.data.alerts?.filter(alert => !alert.is_read)?.length || 0
      setNotificationCount(unreadCount)
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
  }

  return (
    <nav className="fixed top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-200/70 transition-colors">
      <div className="px-3 py-2.5 lg:px-5 lg:pl-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start">
            <button
              onClick={toggleSidebar}
              aria-label="Open navigation menu"
              className="inline-flex items-center justify-center p-3 min-h-[44px] min-w-[44px] text-sm text-gray-600 rounded-xl lg:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-400"
            >
              <FaBars className="w-6 h-6" />
            </button>
            <Link to="/dashboard" className="flex ml-2 md:mr-24 items-center gap-2.5 group">
              <img src="/logo.svg" alt="EyeVio Logo" className="h-8 w-auto transition-transform group-hover:scale-105" />
              <span className="text-xl font-serif font-bold tracking-tight text-gray-900">eyevio</span>
            </Link>
          </div>
          
          <div className="flex items-center gap-1 md:gap-2">
            {/* Keyboard Shortcuts */}
            <button 
              onClick={showShortcutsHelp}
              className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 rounded-xl hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400"
              title="Keyboard shortcuts (?)"
              aria-label="Show keyboard shortcuts"
            >
              <FaKeyboard className="w-5 h-5" />
            </button>

            {/* Notifications */}
            <Link
              to="/alerts"
              aria-label={notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'}
              className="p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-500 rounded-xl hover:bg-gray-100 hover:text-gray-900 relative transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400"
            >
              <FaBell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full ring-2 ring-white">
                  {notificationCount}
                </span>
              )}
            </Link>

            {/* User chip */}
            <div className="flex items-center gap-2.5 ml-1 pl-2 md:pl-3 md:border-l md:border-gray-200">
              <div className="w-9 h-9 rounded-full bg-brand-gradient flex items-center justify-center text-white font-semibold text-sm shadow-soft">
                {(user?.name || user?.full_name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:block leading-tight">
                <p className="text-sm font-semibold text-gray-900">{user?.name || user?.full_name || 'User'}</p>
                <button
                  onClick={logout}
                  aria-label="Log out of your account"
                  className="text-xs font-medium text-gray-500 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400 rounded"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
