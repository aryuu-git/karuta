import { type ReactNode } from 'react'
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { Images, Layers, CircleUserRound, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Changelog } from './Changelog'

interface LayoutProps {
  children: ReactNode
}

/** 全局导航与页面骨架：品牌区（🌸 保留品牌瞬间）+ 功能导航（lucide 图标）+ 用户区 */
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
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 backdrop-blur-sm"
        style={{ background: 'rgb(var(--accent-bg-mid)/ 0.85)', borderBottom: '1px solid rgb(var(--accent-primary)/ 0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 0 rgb(var(--accent-primary)/ 0.05)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* 品牌 + 导航 */}
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 group">
              <span className="font-serif text-xl font-bold text-gold-shimmer group-hover:opacity-90 transition-opacity">
                🌸 二次元歌牌大乱斗
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link to="/cards"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast hover:scale-105 ${
                  location.pathname.startsWith('/cards')
                    ? 'text-gold border border-gold/50 bg-gold/10'
                    : 'text-muted hover:text-gold/70 border border-transparent hover:border-gold/20'
                }`}>
                <Images size={16} />
                牌库
              </Link>
              <Link to="/decks"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast hover:scale-105 ${
                  location.pathname === '/decks'
                    ? 'text-gold border border-gold/50 bg-gold/10'
                    : 'text-muted hover:text-gold/70 border border-transparent hover:border-gold/20'
                }`}>
                <Layers size={16} />
                牌组
              </Link>
            </nav>
          </div>

          {/* 用户区 */}
          <div className="flex items-center gap-2">
            {/* 个人战绩页入口 */}
            <Link to="/profile"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast hover:scale-105 ${
                location.pathname === '/profile'
                  ? 'border border-gold/50 bg-gold/10'
                  : 'border border-border hover:border-gold/40 hover:bg-gold/5'
              }`}
              style={{ color: location.pathname === '/profile' ? 'rgb(var(--color-gold))' : 'rgb(var(--accent-primary)/ 0.7)' }}>
              <CircleUserRound size={16} />
              <span className="hidden sm:inline">{user.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-muted text-sm hover:text-crimson transition-all duration-fast px-3 py-1.5 rounded-lg border border-border hover:border-crimson/40 hover:scale-105"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">下线</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="flex-1">{children}</main>

      {/* 更新日志（只显示一次） */}
      <Changelog />
    </div>
  )
}
