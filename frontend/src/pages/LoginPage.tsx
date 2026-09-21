import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserRound, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { paths } from '../routes/paths'
import { Button, Input, CenteredShell } from '../components/ui'

/**
 * 深链回跳目标（修复 #3）：RequireAuth 守卫与 JoinRoomPage 通过 state.from
 * 记录来源路径，此前 LoginPage/RegisterPage 成功后固定回首页、从不读取，
 * 注释承诺的回跳从未生效。仅接受站内相对路径（拒绝 `//host` 协议相对
 * 与绝对 URL），防开放重定向。
 */
export function postAuthDestination(state: unknown): string {
  const from = (state as { from?: string } | null)?.from
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    return from
  }
  return paths.home()
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
      navigate(postAuthDestination(location.state))
    } catch (err) {
      setError(err instanceof Error ? err.message : '昵称或密码不正确')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CenteredShell>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold)), transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-8 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold-light)), transparent)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.h1
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="font-serif text-6xl font-bold text-gold-shimmer mb-2"
            style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.4)' }}
          >
            🌸 二次元歌牌大乱斗
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted text-sm"
          >
            和风歌牌，指尖对决
          </motion.p>
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="rounded-2xl p-8 relative overflow-hidden border border-gold/15"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.8), rgb(var(--accent-bg-mid)/ 0.95))', boxShadow: '0 0 60px rgb(var(--accent-primary)/ 0.1), 0 20px 40px rgba(0,0,0,0.5)' }}
        >
          <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--glow-color)/ 0.4), rgb(var(--accent-primary)/ 0.4), transparent)' }} />
          <h2 className="text-gold font-serif font-bold text-lg mb-1 text-center">
            欢迎回来
          </h2>
          <p className="text-gold/50 text-caption text-center mb-6 font-serif italic">登录后继续对局</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label={<><UserRound size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />昵称</>}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入昵称"
              autoComplete="username"
              required
            />

            <Input
              label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />密码</>}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              autoComplete="current-password"
              required
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5"
              >
                {error}
              </motion.p>
            )}

            <Button
              type="submit"
              loading={loading}
              size="lg"
              className="w-full mt-2 font-serif"
            >
              进入战场
            </Button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-5 text-muted text-caption"
        >
          还没有账号？{' '}
          <Link to={paths.register()} className="text-gold hover:text-gold-light transition-colors underline underline-offset-2">
            注册
          </Link>
          {' · '}
          <Link to={paths.guest()} className="text-muted hover:text-body-text/70 transition-colors underline underline-offset-2">
            游客进入
          </Link>
        </motion.p>
      </motion.div>
    </CenteredShell>
  )
}
