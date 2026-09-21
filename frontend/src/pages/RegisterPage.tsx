import { useState, useEffect, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UserRound, Lock, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import { Input, Button, CenteredShell } from '../components/ui'
import { postAuthDestination } from './LoginPage'


export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [secretCode, setSecretCode] = useState('')
	const [inviteRequired, setInviteRequired] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

	useEffect(() => {
		api.auth.inviteStatus()
			.then((result) => setInviteRequired(result.invite_required))
			.catch(() => setInviteRequired(true))
	}, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // 用户名校验
    const trimName = username.trim()
    if (!trimName) {
      setError('请输入昵称')
      return
    }
    if (trimName.length < 2) {
      setError('昵称需要 2–20 个字符')
      return
    }
    if (trimName.length > 20) {
      setError('昵称需要 2–20 个字符')
      return
    }

    if (!secretCode.trim()) {
      setError('请输入邀请码')
      return
    }

    // 密码校验
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }

    setLoading(true)
    try {
      await register(trimName, password, secretCode.trim())
      navigate(postAuthDestination(location.state))
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <CenteredShell>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 right-1/3 w-80 h-80 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold)), transparent)' }} />
        <div className="absolute bottom-1/3 left-1/4 w-56 h-56 rounded-full opacity-8 blur-2xl"
          style={{ background: 'radial-gradient(circle, rgb(var(--color-gold-light)), transparent)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <Link to={paths.login()}>
            <h1 className="font-serif text-5xl font-bold text-gold-shimmer mb-1 hover:opacity-80 transition-opacity"
              style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.4)' }}>
              🌸 二次元歌牌大乱斗
            </h1>
          </Link>
          <p className="text-muted text-caption mt-1">和朋友一起抢牌对战</p>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="rounded-2xl p-8 relative overflow-hidden border border-gold/15"
          style={{ background: 'linear-gradient(160deg, rgb(var(--accent-bg-end)/ 0.8), rgb(var(--accent-bg-mid)/ 0.95))', boxShadow: '0 0 60px rgb(var(--accent-primary)/ 0.1), 0 20px 40px rgba(0,0,0,0.5)' }}
        >
          <div className="absolute top-0 left-0 w-full h-0.5" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent-primary)/ 0.4), rgb(var(--glow-color)/ 0.4), transparent)' }} />
          <h2 className="text-gold font-serif font-bold text-lg mb-1 text-center">
            加入
          </h2>
          <p className="text-gold/50 text-caption text-center mb-6 font-serif italic">注册账号即可开玩</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* 用户名 */}
            <Input
              label={<><UserRound size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />昵称 <span className="text-muted/50">（2-20字符）</span></>}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入昵称"
              autoComplete="username"
              maxLength={20}
              required
            />

            {/* 密码 */}
            <Input
              label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />密码 <span className="text-muted/50">（至少6位）</span></>}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码"
              autoComplete="new-password"
              required
            />

            {/* 确认密码 */}
            <Input
              label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />确认密码</>}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再输一遍密码"
              autoComplete="new-password"
              required
            />

            {/* 邀请码：框常驻（Owner 决策 2026-09-21 恢复旧交互）。关态服务端校验固定默认码 33989，开态校验一次性码。 */}
            <Input
              label={<><Sparkles size={12} className="inline-block mr-1 -mt-0.5 text-gold-dark" />邀请码 {!inviteRequired && <span className="text-muted/40 ml-1">（默认 33989）</span>}</>}
              type="text"
              value={secretCode}
              onChange={(e) => setSecretCode(e.target.value)}
              className="tracking-[0.3em] text-center"
              placeholder="输入邀请码"
              autoComplete="off"
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
              注册并进入
            </Button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-5 text-muted text-caption"
        >
          已有账号？{' '}
          <Link to={paths.login()} className="text-gold hover:text-gold-light transition-colors underline underline-offset-2">
            去登录
          </Link>
        </motion.p>
      </motion.div>
    </CenteredShell>
  )
}
