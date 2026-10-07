import { useState, lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Swords, Images, Layers, CircleUserRound, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAchievementCenter } from '../features/achievements/useAchievementCenter'
import { paths } from '../routes/paths'
import { Avatar, Menu, type MenuItem } from './ui'

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

  // 用户菜单开合（受控传给 Menu）
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate(paths.login())
  }

  // 路由变化即收起用户菜单（2026-09-30：防跨页残留）
  useEffect(() => {
    setUserMenuOpen(false)
  }, [location.pathname])

  // 用户菜单两项：个人主页 / 退出（danger 档高亮）
  const userMenuItems: MenuItem[] = [
    { key: 'profile', label: '个人主页', icon: <CircleUserRound size={16} />, onSelect: () => navigate(paths.profile()) },
    { key: 'logout', label: '退出', icon: <LogOut size={16} />, tone: 'danger', onSelect: handleLogout },
  ]

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
      {/* 顶部导航（投影走 shadow-card token，替代手写 boxShadow 字面量） */}
      <header className="sticky top-0 z-sticky backdrop-blur-sm bg-accent-bg-mid/85 border-b border-accent/10 shadow-card">
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

          {/* 用户区：头像/昵称锚定菜单（个人主页 / 退出）；开源仓库入口归内容页脚 SiteFooter */}
          <div className="flex items-center gap-2">
            <Menu
              open={userMenuOpen}
              onOpenChange={setUserMenuOpen}
              trigger={
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-transparent hover:border-gold/30 hover:bg-gold/5 transition-colors duration-fast"
                >
                  <Avatar username={user?.username ?? ''} avatarUrl={user?.avatar_url} size={28} />
                  <span className="hidden sm:inline text-caption text-body-text">{user?.username}</span>
                </button>
              }
              items={userMenuItems}
            />
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
