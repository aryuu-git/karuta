import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner, CenteredShell } from '../components/ui'
import { paths } from './paths'

/** 认证引导中的全屏占位（恢复会话请求进行中） */
function AuthBootLoading() {
  return (
    <CenteredShell className="flex-col gap-3">
      <Spinner size={32} />
      <p className="text-gold font-serif text-lg">加载中…</p>
    </CenteredShell>
  )
}

/**
 * 登录守卫：会话恢复中显示占位，未登录重定向到登录页。
 * 重定向前记住来源路径，登录成功后可回跳（state.from）。
 */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthBootLoading />
  if (!user) {
    return <Navigate to={paths.login()} state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}

/**
 * 正式用户守卫：游客被重定向回游客页（游客仅可访问 /guest 与房间页）。
 * 嵌套在 RequireAuth 内部使用，loading 已被外层消化。
 */
export function RequireMember() {
  const { user } = useAuth()
  if (user?.is_guest) return <Navigate to={paths.guest()} replace />
  return <Outlet />
}
