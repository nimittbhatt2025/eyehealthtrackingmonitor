import { Outlet } from 'react-router-dom'

function AuthLayout() {
  return (
    <div className="min-h-screen bg-brand-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="EyeVio Logo" className="h-14 w-auto mx-auto mb-4" />
          <h1 className="page-title mb-2">eyevio</h1>
          <p className="page-subtitle">AI-powered vision health monitoring</p>
        </div>
        <Outlet />
      </div>
    </div>
  )
}

export default AuthLayout
