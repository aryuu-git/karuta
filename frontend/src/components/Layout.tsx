import { type ReactNode } from 'react'
import { Link, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { Castle, Images, Layers, CircleUserRound, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Changelog } from './Changelog'
import { PetalsLayer } from './ui/PetalsLayer'

interface LayoutProps {
  children: ReactNode
}

/** 主导航 tab（信息架构 D5-C1：大厅 / 牌库 / 牌组 / 我的） */
const NAV_TABS = [
  { to: '/', label: '大厅', icon: Castle, match: (p: string) => p === '/' },
  { to: '/cards', label: '牌库', icon: Images, match: (p: string) => p.startsWith('/cards') },
  { to: '/decks', label: '牌组', icon: Layers, match: (p: string) => p.startsWith('/decks') },
  { to: '/profile', label: '我的', icon: CircleUserRound, match: (p: string) => p.startsWith('/profile') },
]

/** 全局导航与页面骨架：品牌区（🌸 品牌位）+ 四 tab 导航（激活态底部金线指示）+ 用户区 */
export function Layout({ children }: LayoutProps) {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen washi-bg flex items-center justify-center">
        <div className="text-gold animate-pulse font-serif text-2xl">施法中…请稍候</div>
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

  // 对战页不铺花瓣：战场信息密度优先，氛围克制
  const isBattle = /^\/rooms\/\d+$/.test(location.pathname)

  return (
    <div className="min-h-screen washi-bg flex flex-col">
      {!isBattle && <PetalsLayer />}
      {/* 顶部导航：毛玻璃 + 细金线底缘 */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md bg-ink-deep/70"
        style={{
          borderBottom: '1px solid rgb(var(--gold-foil)/ 0.18)',
          boxShadow: '0 1px 0 rgb(255 255 255/ 0.03) inset, 0 4px 24px rgb(0 0 0/ 0.35)',
        }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* 品牌 + 导航 */}
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/" className="flex items-center gap-2 group shrink-0">
              <span className="font-serif text-xl font-bold text-gold-shimmer group-hover:opacity-90 transition-opacity whitespace-nowrap">
                🌸 二次元歌牌大乱斗
              </span>
            </Link>
            {/* 四 tab：窄屏仅图标，宽屏图标 + 文字；激活态底部金粉指示线 */}
            <nav className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto" aria-label="主导航">
              {NAV_TABS.map(({ to, label, icon: Icon, match }) => {
                const active = match(location.pathname)
                return (
                  <Link key={to} to={to} aria-current={active ? 'page' : undefined}
                    className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast ${
                      active ? 'text-gold' : 'text-muted hover:text-gold/80'
                    }`}>
                    <Icon size={16} className="shrink-0" />
                    <span className="hidden md:inline">{label}</span>
                    {active && (
                      <span aria-hidden="true"
                        className="absolute inset-x-2 -bottom-[5px] h-px bg-gradient-to-r from-transparent via-gold-foil to-transparent" />
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* 用户区：下线 */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleLogout}
              title={user.username}
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
