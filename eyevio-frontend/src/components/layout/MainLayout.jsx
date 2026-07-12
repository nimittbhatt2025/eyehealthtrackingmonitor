import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import { isImmersiveSessionRoute } from '../../utils/visionTestLayout'

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const immersiveTest = isImmersiveSessionRoute(location.pathname)

  return (
    <div className="min-h-screen bg-app-bg transition-colors">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      <Navbar
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        immersiveTest={immersiveTest}
      />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        hidden={immersiveTest}
      />
      
      <main
        id="main-content"
        className={`pt-16 transition-[padding] duration-300 ${immersiveTest ? '' : 'lg:pl-64'}`}
      >
        <div
          className={
            immersiveTest
              ? 'px-2 sm:px-3 py-2 max-w-[1600px] mx-auto'
              : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'
          }
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default MainLayout
