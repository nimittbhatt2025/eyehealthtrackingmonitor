import { Outlet } from 'react-router-dom'

function AuthLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary-700 mb-2">EyeVio</h1>
          <p className="text-gray-600">AI-Powered Vision Health Monitoring</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}

export default AuthLayout
