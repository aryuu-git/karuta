import { type ReactNode } from 'react'
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Changelog } from './Changelog'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen washi-bg flex items-center justify-center">
        <div className="text-gold animate-pulse font-serif text-2xl">施法中… 请稍等 (´。• ω •。`)</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen washi-bg flex flex-col">
      {/* Top nav */}
      <header className="border-b border-border bg-ink-deep/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Brand */}
          <Link to="/" className="flex items-center gap-2 group">
            <span className="font-serif text-xl font-bold text-gold-shimmer group-hover:opacity-90 transition-opacity">
              🌸 二次元歌牌大乱斗
            </span>
          </Link>

          {/* User area */}
          <div className="flex items-center gap-2">
            {/* 个人战绩页入口 */}
            <Link to="/profile"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:scale-105 ${
                location.pathname === '/profile'
                  ? 'border border-gold/50 bg-gold/10'
                  : 'border border-border hover:border-gold/40 hover:bg-gold/5'
              }`}
              style={{ color: location.pathname === '/profile' ? '#e8a4b8' : 'rgba(232,164,184,0.7)' }}>
              <span>👤</span>
              <span className="hidden sm:inline">{user.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-muted text-sm hover:text-crimson transition-all duration-200 px-3 py-1.5 rounded-lg border border-border hover:border-crimson/40 hover:scale-105"
            >
              <span className="hidden sm:inline">下线 (－ω－ ) zzZ</span>
              <span className="sm:hidden text-base">🚪</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* 更新日志（只显示一次） */}
      <Changelog />
    </div>
  )
}
