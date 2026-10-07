import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { UserRound, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { paths } from '../routes/paths'
import { Button, Input, CenteredShell } from '../components/ui'
import { FadeIn } from '../components/ui/FadeIn'
import { BrandGlow } from '../components/ui/BrandGlow'

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
      <FadeIn y={24} className="relative z-10 w-full max-w-md">
        {/* Logo：图标独占一行 + 标题 nowrap 单行；品牌光晕 BrandGlow 单点垫底 */}
        <div className="relative text-center mb-6">
          <BrandGlow className="left-1/2 top-1/2 w-96 h-96 -translate-x-1/2 -translate-y-1/2" />
          <FadeIn delay={100} y={0}>
            <h1
              className="font-serif text-display font-bold text-gold-shimmer whitespace-nowrap mb-2"
              style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.4)' }}
            >
              <span className="block text-4xl leading-none mb-2" aria-hidden="true">🌸</span>
              二次元歌牌大乱斗
            </h1>
          </FadeIn>
          <FadeIn delay={300} y={0} className="text-muted text-sm">
            和风歌牌，指尖对决
          </FadeIn>
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        {/* Card（投影走 shadow-modal token，替代手写 boxShadow 字面量） */}
        <FadeIn delay={200} y={16} className="rounded-2xl p-8 relative overflow-hidden border border-gold/15 bg-gradient-to-b from-accent-bg-end/80 to-accent-bg-mid/95 shadow-modal">
          {/* 描金顶线：token accent-line */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-accent-line" />
          <h2 className="text-gold-light font-serif font-bold text-lg mb-1 text-center">
            欢迎回来
          </h2>
          <p className="text-gold/70 text-caption text-center mb-6">登录后继续对局</p>

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
              进入战场
            </Button>
          </form>
        </FadeIn>

        <FadeIn delay={500} y={0} className="text-center mt-5 text-muted text-caption">
          还没有账号？{' '}
          <Button variant="link" onClick={() => navigate(paths.register())}>
            注册
          </Button>
          {' · '}
          <Button variant="link" onClick={() => navigate(paths.guest())}>
            游客进入
          </Button>
        </FadeIn>
      </FadeIn>
    </CenteredShell>
  )
}
