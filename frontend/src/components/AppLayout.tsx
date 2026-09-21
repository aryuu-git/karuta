import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Swords, Images, Layers, CircleUserRound, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAchievementCenter } from '../features/achievements/useAchievementCenter'
import { paths } from '../routes/paths'

// 更新日志依赖 framer-motion：懒加载隔离，避免拉入首屏主包（决策日志 D2-A2）
const Changelog = lazy(() => import('./Changelog').then(m => ({ default: m.Changelog })))
// 成就弹层同理：依赖 framer-motion，懒加载隔离出首屏主包（同 D2-A2 纪律）
const AchievementPopup = lazy(() => import('../features/achievements/AchievementPopup').then(m => ({ default: m.AchievementPopup })))

/**
 * 滚动位置记忆（重构 L2）：按路由 pathname 记录，返回列表页时恢复上次位置。
 * 原理：SPA 路由切换不重置 window.scrollY——新 pathname 的 effect 触发时，
 * scrollY 仍是旧页面的落点，先记录旧页再恢复新页，一个 effect 完成读改写。
 * 职责边界：
 * - 仅在 AppLayout 壳内生效（无壳页为全屏居中，无滚动语义）；
 * - 无记录的 pathname（前进导航）滚动置顶；
 * - 用 pathname 而非 location.key：同一路径反复进出共享记录，符合列表页直觉。
 */
function useScrollRestoration() {
  const location = useLocation()
  const positionsRef = useRef(new Map<string, number>())
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    // 1) 记录即将离开的页面位置（此刻 scrollY 仍属旧页面）
    positionsRef.current.set(prevPathRef.current, window.scrollY)
    // 2) 恢复目标页面位置或置顶
    const saved = positionsRef.current.get(location.pathname)
    window.scrollTo({ top: saved ?? 0, behavior: 'instant' as ScrollBehavior })
    prevPathRef.current = location.pathname
  }, [location.pathname])
}

/**
 * 应用外壳布局（路由级，基于 Outlet）：
 * 品牌区（🌸 品牌瞬间）+ 功能导航（lucide 图标）+ 用户区 + 主内容插槽。
 * 认证检查由路由守卫（RequireAuth）负责，本组件只负责骨架渲染。
 */
export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  useScrollRestoration()
  // 成就解锁队列（右下角仪式层弹层；来源=WS 推送 + 路由切换 diff）
  const { queue, dismiss } = useAchievementCenter()

  const handleLogout = () => {
    logout()
    navigate(paths.login())
  }

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast hover:scale-105 ${
      active
        ? 'text-gold border border-gold/50 bg-gold/10'
        : 'text-muted hover:text-gold/70 border border-transparent hover:border-gold/20'
    }`

  return (
    <div className="min-h-screen washi-bg flex flex-col">
      <Suspense fallback={null}>
        <AchievementPopup queue={queue} dismiss={dismiss} />
      </Suspense>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-sticky backdrop-blur-sm"
        style={{ background: 'rgb(var(--accent-bg-mid)/ 0.85)', borderBottom: '1px solid rgb(var(--accent-primary)/ 0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 0 rgb(var(--accent-primary)/ 0.05)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[var(--header-h)] flex items-center justify-between">
          {/* 品牌 + 导航 */}
          <div className="flex items-center gap-4">
            <Link to={paths.home()} className="flex items-center gap-2 group">
              <span className="font-serif text-xl font-bold text-gold-shimmer group-hover:opacity-90 transition-opacity">
                🌸 二次元歌牌大乱斗
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link to={paths.home()} className={navLinkClass(location.pathname === paths.home())}>
                <Swords size={16} />
                开战
              </Link>
              <Link to={paths.decks()} className={navLinkClass(location.pathname.startsWith('/decks'))}>
                <Layers size={16} />
                牌组
              </Link>
              <Link to={paths.cards()} className={navLinkClass(location.pathname.startsWith('/cards'))}>
                <Images size={16} />
                牌库
              </Link>
            </nav>
          </div>

          {/* 用户区 */}
          <div className="flex items-center gap-2">
            <Link to={paths.profile()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast hover:scale-105 ${
                location.pathname === paths.profile()
                  ? 'border border-gold/50 bg-gold/10'
                  : 'border border-border hover:border-gold/40 hover:bg-gold/5'
              }`}
              style={{ color: location.pathname === paths.profile() ? 'rgb(var(--color-gold))' : 'rgb(var(--accent-primary)/ 0.7)' }}>
              <CircleUserRound size={16} />
              <span className="hidden sm:inline">{user?.username}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-muted text-sm hover:text-crimson transition-all duration-fast px-3 py-1.5 rounded-lg border border-border hover:border-crimson/40 hover:scale-105"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主内容（路由插槽） */}
      <main className="flex-1">{children ?? <Outlet />}</main>

      {/* 更新日志（只显示一次）：懒加载，不阻塞首屏 */}
      <Suspense fallback={null}>
        <Changelog />
      </Suspense>
    </div>
  )
}
