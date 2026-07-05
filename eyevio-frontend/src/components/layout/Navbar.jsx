import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useKeyboardShortcuts } from '../../context/KeyboardShortcutsContext'
import { useState, useEffect } from 'react'
import { alertsAPI } from '../../services/api'
import { 
  FaBell, 
  FaUserCircle, 
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
    <nav className="fixed top-0 z-50 w-full bg-white border-b border-gray-200 transition-colors">
      <div className="px-3 py-3 lg:px-5 lg:pl-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start">
            <button
              onClick={toggleSidebar}
              className="inline-flex items-center p-2 text-sm text-gray-500 rounded-lg lg:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              <FaBars className="w-6 h-6" />
            </button>
            <Link to="/dashboard" className="flex ml-2 md:mr-24 items-center space-x-2">
              <img src="/logo.svg" alt="EyeVio Logo" className="h-8 w-auto" />
              <span className="text-xl font-semibold text-gray-900">eyevio</span>
            </Link>
          </div>
          
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Keyboard Shortcuts */}
            <button 
              onClick={showShortcutsHelp}
              className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
              title="Keyboard shortcuts (?)"
            >
              <FaKeyboard className="w-5 h-5" />
            </button>

            {/* Notifications */}
            <Link to="/alerts" className="p-2 text-gray-500 rounded-lg hover:bg-gray-100 relative transition-colors">
              <FaBell className="w-5 h-5" />
              {notificationCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
                  {notificationCount}
                </span>
              )}
            </Link>

            {/* User Dropdown */}
            <div className="flex items-center space-x-2">
              <FaUserCircle className="w-8 h-8 text-gray-500" />
              <div className="hidden md:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <button
                  onClick={logout}
                  className="text-xs text-gray-500 hover:text-primary-600"
                >
                  Logout
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
