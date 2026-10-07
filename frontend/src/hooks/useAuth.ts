import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { createElement } from 'react'
import { api, HttpError } from '../api/client'
import type { User } from '../api/types'
import { AUTH_TOKEN_KEY } from '../config'

interface AuthContextValue {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, inviteCode?: string) => Promise<void>
  guestLogin: (username: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = AUTH_TOKEN_KEY
const GUEST_RECOVERY_PREFIX = 'karuta_guest_recovery:'
// 恢复码本地存取键：与后端 GetByUsername 的精确匹配语义对齐——
// 后端 username UNIQUE 为 BINARY collation（区分大小写），"Alice" 与 "alice"
// 是两个独立游客账号。若此处做小写折叠（旧实现 toLocaleLowerCase），
// 两个账号会共享同一 localStorage key 互相覆盖恢复码 → 后注册者顶掉
// 先注册者的 token，先注册者同浏览器再登录即 401 锁死（视觉审计发现）。
// 附带消除 toLocaleLowerCase 的 locale 陷阱（tr-TR 下 "I" 折叠为 "ı"）。
function guestRecoveryKey(username: string): string {
  return GUEST_RECOVERY_PREFIX + username.trim()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  )
  const [loading, setLoading] = useState(true)

  // On mount, try to restore session from token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY)
    if (!storedToken) {
      setLoading(false)
      return
    }
    let cancelled = false

    // 仅鉴权失效（401/403）才销毁会话。网络抖动/5xx/429 属瞬时故障，旧实现
    // catch 一刀切 removeItem，一次失败即永久踢出登录（「每次都得重登」的根因）；
    // 现在保留 token 并退避重试一次，仍失败则本次按未登录渲染，下次进入自动再恢复。
    const restore = async (attempt: number): Promise<void> => {
      try {
        const u = await api.auth.me()
        if (cancelled) return
        setUser(u)
        setToken(storedToken)
        if (u.is_guest && !localStorage.getItem(guestRecoveryKey(u.username))) {
          void api.auth.issueGuestRecovery().then(({ guest_recovery_token }) => {
            localStorage.setItem(guestRecoveryKey(u.username), guest_recovery_token)
          }).catch(() => undefined)
        }
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 0
        if (status === 401 || status === 403) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          return
        }
        if (attempt < 1 && !cancelled) {
          const { promise, resolve } = Promise.withResolvers<void>()
          setTimeout(resolve, 600)
          await promise
          return restore(attempt + 1)
        }
      }
    }

    void restore(0).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.auth.login(username, password)
    localStorage.setItem(TOKEN_KEY, res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const register = useCallback(
    async (username: string, password: string, inviteCode?: string) => {
      const res = await api.auth.register(username, password, inviteCode)
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
    },
    []
  )

  const guestLogin = useCallback(
    async (username: string) => {
		const recoveryKey = guestRecoveryKey(username)
		const recoveryToken = localStorage.getItem(recoveryKey) ?? undefined
		const res = await api.auth.guestLogin(username, recoveryToken)
      localStorage.setItem(TOKEN_KEY, res.token)
		if (res.guest_recovery_token) {
			localStorage.setItem(recoveryKey, res.guest_recovery_token)
		}
      setToken(res.token)
      setUser(res.user)
    },
    []
  )

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, token, loading, login, register, guestLogin, logout } },
    children
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
