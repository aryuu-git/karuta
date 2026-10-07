import { useState, useEffect, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { UserRound, Lock, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import { Input, Button, CenteredShell } from '../components/ui'
import { FadeIn } from '../components/ui/FadeIn'
import { BrandGlow } from '../components/ui/BrandGlow'
import { postAuthDestination } from './LoginPage'


export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [secretCode, setSecretCode] = useState('')
	// null=开关状态未知（框不渲染）；fetch 失败 fail-closed 置 true（要码）。
	const [inviteRequired, setInviteRequired] = useState<boolean | null>(null)
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

    if (inviteRequired === true && !secretCode.trim()) {
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
      <FadeIn y={24} className="relative z-10 w-full max-w-md">
        {/* Logo：图标独占一行 + 标题 nowrap 单行；品牌光晕 BrandGlow 单点垫底 */}
        <div className="relative text-center mb-8">
          <BrandGlow className="left-1/2 top-1/2 w-96 h-96 -translate-x-1/2 -translate-y-1/2" />
          <FadeIn delay={100} y={0}>
            <Link to={paths.login()} className="inline-block hover:opacity-80 transition-opacity">
              <h1 className="font-serif text-display font-bold text-gold-shimmer whitespace-nowrap mb-1"
                style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.4)' }}>
                <span className="block text-4xl leading-none mb-2" aria-hidden="true">🌸</span>
                二次元歌牌大乱斗
              </h1>
            </Link>
          </FadeIn>
          <FadeIn delay={300} y={0} className="text-muted text-caption mt-1">和朋友一起抢牌对战</FadeIn>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        <FadeIn delay={150} y={16} className="rounded-2xl p-8 relative overflow-hidden border border-gold/15 bg-gradient-to-b from-accent-bg-end/80 to-accent-bg-mid/95 shadow-modal">
          {/* 描金顶线：token accent-line */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-accent-line" />
          <h2 className="text-gold-light font-serif font-bold text-lg mb-1 text-center">
            加入
          </h2>
          <p className="text-gold/70 text-caption text-center mb-6">注册账号即可开玩</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* 用户名 */}
            <Input
              label={<><UserRound size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />昵称 <span className="text-muted/70">（2-20字符）</span></>}
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
              label={<><Lock size={12} className="inline-block mr-1 -mt-0.5 text-muted/70" />密码 <span className="text-muted/70">（至少6位）</span></>}
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

            {/* 邀请码：仅开态渲染（Owner 决策 2026-09-30 拆除关态固定码剧场）；开态校验数据库一次性码 */}
            {inviteRequired === true && (
              <Input
                label={<><Sparkles size={12} className="inline-block mr-1 -mt-0.5 text-gold-dark" />邀请码</>}
                type="text"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="code-input tracking-[0.15em] text-center"
                placeholder="输入邀请码"
                autoComplete="off"
                required
              />
            )}

            {error && (
              <FadeIn y={-4} className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                {error}
              </FadeIn>
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
        </FadeIn>

        <FadeIn delay={500} y={0} className="text-center mt-5 text-muted text-caption">
          已有账号？{' '}
          <Button variant="link" onClick={() => navigate(paths.login())}>
            去登录
          </Button>
        </FadeIn>
      </FadeIn>
    </CenteredShell>
  )
}
