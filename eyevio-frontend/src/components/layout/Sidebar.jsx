import { Link, useLocation } from 'react-router-dom'
import { 
  FaTachometerAlt, 
  FaEye, 
  FaChartLine, 
  FaVideo,
  FaHeartbeat,
  FaTrophy,
  FaUsers,
  FaBell,
  FaCog,
  FaQuestionCircle,
  FaUser, 
  FaFileAlt,
  FaTimes,
  FaBook,
  FaBrain
} from 'react-icons/fa'

function Sidebar({ isOpen, onClose }) {
  const location = useLocation()

  const menuItems = [
    { path: '/dashboard', icon: FaTachometerAlt, label: 'Dashboard' },
    { path: '/vision-tests', icon: FaEye, label: 'Vision Tests' },
    { path: '/eye-tracking-analysis', icon: FaBrain, label: 'Eye Tracking Analysis' },
    { path: '/eye-conditions', icon: FaBook, label: 'Eye Conditions Library' },
    { path: '/trends', icon: FaChartLine, label: 'Trends & Predictions' },
    { path: '/lifestyle', icon: FaHeartbeat, label: 'Lifestyle' },
    { path: '/achievements', icon: FaTrophy, label: 'Achievements' },
    { path: '/community', icon: FaUsers, label: 'Community' },
    { path: '/alerts', icon: FaBell, label: 'Alerts' },
    { path: '/reports', icon: FaFileAlt, label: 'Reports' },
    { path: '/profile', icon: FaUser, label: 'Profile' },
    { path: '/settings', icon: FaCog, label: 'Settings' },
    { path: '/help', icon: FaQuestionCircle, label: 'Help' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-gray-900 bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-screen pt-20 transition-transform ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-white border-r border-gray-200 lg:translate-x-0`}
      >
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-4 right-4 p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 rounded-lg lg:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          <FaTimes className="w-5 h-5" />
        </button>

        <div className="h-full px-3 pb-4 overflow-y-auto bg-white">
          <ul className="space-y-2 font-medium">
            {menuItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onClose}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  className={`flex items-center p-3 min-h-[44px] rounded-lg hover:bg-gray-100 group transition-colors focus:outline-none focus:ring-2 focus:ring-primary-400 ${
                    isActive(item.path)
                      ? 'bg-primary-50 text-primary-700 font-semibold border-l-4 border-primary-600 pl-2'
                      : 'text-gray-900'
                  }`}
                >
                  <item.icon
                    className={`w-5 h-5 transition duration-75 ${
                      isActive(item.path)
                        ? 'text-primary-700'
                        : 'text-gray-500 group-hover:text-gray-900'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="ml-3">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
