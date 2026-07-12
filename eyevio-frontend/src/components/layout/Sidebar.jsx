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
  FaBrain,
  FaCamera
} from 'react-icons/fa'

function Sidebar({ isOpen, onClose, hidden = false }) {
  const location = useLocation()

  const menuGroups = [
    {
      title: 'Overview',
      items: [
        { path: '/dashboard', icon: FaTachometerAlt, label: 'Dashboard' },
        { path: '/trends', icon: FaChartLine, label: 'Trends & Predictions' },
        { path: '/reports', icon: FaFileAlt, label: 'Reports' },
      ],
    },
    {
      title: 'Testing',
      items: [
        { path: '/vision-tests', icon: FaEye, label: 'Vision Tests' },
        { path: '/eye-health-monitor', icon: FaCamera, label: 'Eye Photo Monitor' },
        { path: '/eye-tracking-analysis', icon: FaBrain, label: 'Eye Tracking Analysis' },
        { path: '/eye-conditions', icon: FaBook, label: 'Eye Conditions Library' },
      ],
    },
    {
      title: 'You',
      items: [
        { path: '/lifestyle', icon: FaHeartbeat, label: 'Lifestyle' },
        { path: '/achievements', icon: FaTrophy, label: 'Achievements' },
        { path: '/community', icon: FaUsers, label: 'Community' },
        { path: '/alerts', icon: FaBell, label: 'Alerts' },
      ],
    },
    {
      title: 'Account',
      items: [
        { path: '/profile', icon: FaUser, label: 'Profile' },
        { path: '/settings', icon: FaCog, label: 'Settings' },
        { path: '/help', icon: FaQuestionCircle, label: 'Help' },
      ],
    },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && !hidden && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 w-64 h-screen pt-20 transition-transform duration-300 bg-white/90 backdrop-blur-md border-r border-gray-200/70 ${
          hidden
            ? '-translate-x-full'
            : isOpen
              ? 'translate-x-0'
              : '-translate-x-full lg:translate-x-0'
        }`}
        aria-hidden={hidden}
      >
        <button
          onClick={onClose}
          aria-label="Close navigation menu"
          className="absolute top-4 right-4 p-3 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-600 rounded-xl lg:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-400"
        >
          <FaTimes className="w-5 h-5" />
        </button>

        <div className="h-full px-3 pb-6 overflow-y-auto">
          <nav className="space-y-6">
            {menuGroups.map((group) => (
              <div key={group.title}>
                <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  {group.title}
                </p>
                <ul className="space-y-1 font-medium">
                  {group.items.map((item) => {
                    const active = isActive(item.path)
                    return (
                      <li key={item.path}>
                        <Link
                          to={item.path}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={`relative flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl group transition-all focus:outline-none focus:ring-2 focus:ring-accent-400 ${
                            active
                              ? 'bg-accent-50 text-accent-700 font-semibold'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-accent-600" />
                          )}
                          <item.icon
                            className={`w-5 h-5 transition-colors ${
                              active ? 'text-accent-600' : 'text-gray-400 group-hover:text-gray-700'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="text-sm">{item.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
