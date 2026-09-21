import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { createElement } from 'react'
import { api } from '../api/client'
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
    api.auth
      .me()
      .then((u) => {
        setUser(u)
        setToken(storedToken)
		if (u.is_guest && !localStorage.getItem(guestRecoveryKey(u.username))) {
			void api.auth.issueGuestRecovery().then(({ guest_recovery_token }) => {
				localStorage.setItem(guestRecoveryKey(u.username), guest_recovery_token)
			}).catch(() => undefined)
		}
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
      })
      .finally(() => setLoading(false))
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
