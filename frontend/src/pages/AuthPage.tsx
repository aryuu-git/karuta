import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { UserRound, Lock, Sparkles, LogIn, UserPlus, Ghost, KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { Button, Input, PageSpinner } from '../components/ui'

/** 认证三模式（登录 / 注册 / 访客），由 ?mode= 深链驱动，切换不换页 */
type AuthMode = 'login' | 'register' | 'guest'

const MODES: Array<{ id: AuthMode; label: string; icon: ReactNode }> = [
  { id: 'login', label: '登录', icon: <LogIn size={14} /> },
  { id: 'register', label: '注册', icon: <UserPlus size={14} /> },
  { id: 'guest', label: '访客', icon: <Ghost size={14} /> },
]

/** 各模式卡面题词（和风书卷声线，克制不卖萌） */
const MODE_INTRO: Record<AuthMode, { title: string; subtitle: string; cta: string }> = {
  login: { title: '再临战场', subtitle: '持旧名与暗号，重返牌桌。', cta: '降临战场' },
  register: { title: '初阵登记', subtitle: '留名于战阵名册，自此有籍。', cta: '落名入册' },
  guest: { title: '无名之客', subtitle: '不留名者，亦可赴局观战。', cta: '以客入阵' },
}

/**
 * 统一认证页：登录 / 注册 / 访客三模式合并于此。
 * 已登录的常规用户重定向回大厅；已具名游客直接呈现凭令入场面板。
 */
export function AuthPage() {
  const { user, login, guestLogin, logout, loading } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get('mode')
  const mode: AuthMode = raw === 'register' || raw === 'guest' ? raw : 'login'
  const setMode = (m: AuthMode) => setSearchParams({ mode: m }, { replace: true })

  if (loading) return <div className="min-h-screen washi-bg"><PageSpinner text="施法中…请稍候" /></div>

  // 已登录的正式用户无需再看认证页
  if (user && !user.is_guest) return <Navigate to="/" replace />

  // 已具名游客：展示凭令入场面板（对局邀请码）
  if (user?.is_guest) return <GuestGate username={user.username} onLogout={() => { logout(); setMode('guest') }} />

  return (
    <div className="min-h-screen washi-bg flex items-center justify-center px-4">
      {/* 氛围光晕（固定装饰层） */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold)), transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-[0.08] blur-2xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold-light)), transparent)' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm">
        {/* 品牌位：🌸 唯一允许的品牌 emoji */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-4xl font-bold text-gold-shimmer mb-2 tracking-wide"
            style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.4)' }}>
            🌸 二次元歌牌大乱斗
          </h1>
          <p className="text-muted text-sm">抢牌即决战，一瞬定胜负。</p>
          <Ornament />
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}
          className="card-surface p-8 relative overflow-hidden">
          {/* 描金顶线 */}
          <div className="absolute top-0 left-0 w-full h-0.5"
            style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--gold-foil)/ 0.45), rgb(var(--accent-primary)/ 0.4), transparent)' }} />

          {/* 模式切换（分段控件） */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg mb-6"
            style={{ background: 'rgb(var(--color-ink-deep)/ 0.6)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
            {MODES.map(m => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-serif transition-all duration-fast ${
                  mode === m.id
                    ? 'text-ink font-medium'
                    : 'text-muted hover:text-gold'
                }`}
                style={mode === m.id
                  ? { background: 'linear-gradient(135deg, rgb(var(--color-gold-light)), rgb(var(--color-gold)))' }
                  : undefined}>
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={mode}
              initial={{ opacity: 0, x: mode === 'login' ? -8 : 8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'login' ? 8 : -8 }} transition={{ duration: 0.18 }}>
              <h2 className="text-gold font-serif font-bold text-lg mb-1 text-center">{MODE_INTRO[mode].title}</h2>
              <p className="text-muted/60 text-xs text-center mb-6 font-serif italic">{MODE_INTRO[mode].subtitle}</p>

              {mode === 'login' && <LoginForm onSubmit={async (u, p, fail) => {
                try { await login(u, p); navigate('/') } catch (err) { fail(err instanceof Error ? err.message : '名与暗号不相符，请再试一次。') }
              }} />}
              {mode === 'register' && <RegisterForm onDone={() => navigate('/')} />}
              {mode === 'guest' && <GuestForm onDone={name => guestLogin(name).catch(() => null)} />}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** 登录表单：昵称 + 密码 */
function LoginForm({ onSubmit }: { onSubmit: (u: string, p: string, fail: (msg: string) => void) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    await onSubmit(username, password, setError)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label={<><UserRound size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />战士名</>}
        type="text" value={username} onChange={e => setUsername(e.target.value)}
        placeholder="你的战士名" autoComplete="username" required />
      <Input label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />暗号</>}
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="密码" autoComplete="current-password" required />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" loading={loading} size="lg" className="w-full mt-2 font-serif">{MODE_INTRO.login.cta}</Button>
    </form>
  )
}

/** 注册表单：昵称 + 密码 + 确认 +（按服务端开关）邀请码 */
function RegisterForm({ onDone }: { onDone: () => void }) {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [secretCode, setSecretCode] = useState('')
  const [inviteRequired, setInviteRequired] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 邀请码是否必填以服务端为最终权威；本地开关仅控制显隐
  useEffect(() => {
    api.auth.inviteStatus()
      .then(result => setInviteRequired(result.invite_required))
      .catch(() => setInviteRequired(true))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimName = username.trim()
    if (!trimName) { setError('请先取一个战士名。'); return }
    if (trimName.length < 2) { setError('战士名至少 2 个字符。'); return }
    if (trimName.length > 20) { setError('战士名最多 20 个字符，精简为上。'); return }
    if (inviteRequired && !secretCode.trim()) { setError('需邀请码入册——向已具名者讨一枚吧。'); return }
    if (password.length < 6) { setError('暗号至少 6 位。'); return }
    if (password !== confirm) { setError('两次输入的暗号不一致。'); return }

    setLoading(true)
    try {
      await register(trimName, password, secretCode)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : '入册未成，请再试一次。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label={<><UserRound size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />战士名 <span className="text-muted/50">（2-20 字符）</span></>}
        type="text" value={username} onChange={e => setUsername(e.target.value)}
        placeholder="此名将随你出征" autoComplete="username" maxLength={20} required />
      <Input label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />暗号 <span className="text-muted/50">（至少 6 位）</span></>}
        type="password" value={password} onChange={e => setPassword(e.target.value)}
        placeholder="密码" autoComplete="new-password" required />
      <Input label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />确认暗号</>}
        type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
        placeholder="再输一遍" autoComplete="new-password" required />
      {inviteRequired && (
        <Input label={<><Sparkles size={12} className="inline-block mr-1 -mt-0.5 text-gold-dark" />邀请之证 <span className="text-muted/40 ml-1">（受邀者方知）</span></>}
          type="text" value={secretCode} onChange={e => setSecretCode(e.target.value)}
          className="tracking-[0.3em] text-center" placeholder="？？？？？？" autoComplete="off" required={inviteRequired} />
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" loading={loading} size="lg" className="w-full mt-2 font-serif">{MODE_INTRO.register.cta}</Button>
    </form>
  )
}

/** 访客表单：仅取昵称，成功后由外层切换为游客入场面板 */
function GuestForm({ onDone }: { onDone: (name: string) => void }) {
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name || name.length < 2) { setError('名字至少 2 个字符。'); return }
    if (name.length > 20) { setError('名字最多 20 个字符。'); return }
    setLoading(true)
    setError(null)
    onDone(name)
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input type="text" value={username} onChange={e => setUsername(e.target.value)}
        className="text-center font-serif" placeholder="取一个临时之名" autoFocus />
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button type="submit" loading={loading} className="w-full font-serif">{MODE_INTRO.guest.cta}</Button>
      <p className="text-muted/40 text-[11px] text-center leading-relaxed">
        游客身份仅存于本机浏览器，换设备或清缓存后将无法找回。
      </p>
    </form>
  )
}

/** 已具名游客的凭令入场面板 */
function GuestGate({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { setError('请输入房间邀请码。'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.rooms.join(code.trim().toUpperCase())
      navigate(`/rooms/${res.room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '未能入阵——请核对邀请码。')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen washi-bg flex items-center justify-center px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm card-surface p-8 text-center">
        <h1 className="font-serif text-2xl text-gold font-bold mb-2 flex items-center justify-center gap-2">
          <KeyRound size={18} className="text-gold-dark" />
          凭令入场
        </h1>
        <p className="text-muted text-xs mb-6">无名之客 <span className="text-gold">{username}</span> · 输入邀请码加入对局</p>
        <form onSubmit={handleJoin} className="space-y-4">
          <Input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            className="text-center text-lg tracking-[0.3em] font-mono" placeholder="邀请码" autoFocus maxLength={10} />
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" loading={loading} className="w-full font-serif">入场</Button>
          <button type="button" onClick={onLogout}
            className="flex items-center justify-center gap-1 text-muted/50 text-[11px] hover:text-white/60 transition-colors w-full">
            <LogOut size={11} />
            退出游客身份
          </button>
        </form>
      </motion.div>
    </div>
  )
}

/** 错误提示条（统一声线： crimson 面板 + 克制文案） */
function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
      {children}
    </motion.p>
  )
}

/** 纹样分隔：金粉菱形 + 发丝线（品牌区专用装饰） */
export function Ornament() {
  return (
    <div className="mt-4 flex items-center justify-center gap-3" aria-hidden="true">
      <span className="h-px w-16 bg-gradient-to-l from-gold-foil/50 to-transparent" />
      <span className="w-1.5 h-1.5 rotate-45 bg-gold-foil/70 shadow-foil" />
      <span className="h-px w-16 bg-gradient-to-r from-gold-foil/50 to-transparent" />
    </div>
  )
}
