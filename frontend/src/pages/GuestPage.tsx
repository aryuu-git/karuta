import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { api, HttpError } from '../api/client'
import { paths } from '../routes/paths'
import { Button, Input, CenteredShell, useToast } from '../components/ui'

export function GuestPage() {
  const { user, guestLogin, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'name' | 'code'>(user?.is_guest ? 'code' : 'name')
  const toast = useToast()

  // 游客转正（v7 增补）：战绩成就零迁移，成功后重载页面解锁成员区
  const [upgradeName, setUpgradeName] = useState('')
  const [upgradePw, setUpgradePw] = useState('')
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const handleUpgrade = async (e: FormEvent) => {
    e.preventDefault()
    const name = upgradeName.trim()
    if (name.length < 2 || name.length > 20) { setUpgradeError('昵称需要 2–20 个字符'); return }
    if (upgradePw.length < 6) { setUpgradeError('密码至少 6 位'); return }
    setUpgrading(true)
    setUpgradeError(null)
    try {
      await api.auth.upgrade(name, upgradePw)
      toast.success('✓ 已升级为正式账号，欢迎回来！')
      setTimeout(() => window.location.reload(), 900)
    } catch (err) {
      const code = err instanceof HttpError ? err.code : undefined
      setUpgradeError(code === 'USER_EXISTS' ? '昵称已被占用，换一个吧' : (err as Error).message || '升级失败，请重试')
    } finally {
      setUpgrading(false)
    }
  }

  // 深链预填（§3.3）：/guest?code=XXXXXX 填好邀请码；已是游客则直接落步骤 2
  useEffect(() => {
    const deepCode = searchParams.get('code')?.trim().toUpperCase()
    if (deepCode) {
      setCode(deepCode)
      if (user?.is_guest) setStep('code')
    }
  }, [searchParams, user?.is_guest])

  const handleSetName = async (e: FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name || name.length < 2) { setError('昵称需要 2–20 个字符'); return }
    if (name.length > 20) { setError('昵称需要 2–20 个字符'); return }
    setLoading(true)
    setError(null)
    try {
      await guestLogin(name)
      setStep('code')
    } catch (err) {
      // 游客身份错误码本地化（后端 message 为英文 API 惯例）
      if (err instanceof HttpError) {
        const zh: Record<string, string> = {
          GUEST_NAME_UNAVAILABLE: '这个昵称不可用，换一个试试',
          INVALID_GUEST_RECOVERY: '该昵称已被其他会话使用（如曾在别的设备登录）',
          GUEST_RECOVERY_REQUIRED: '该昵称是早期游客身份，请在原设备登录恢复',
          ACCOUNT_DISABLED: '该账号已被禁用',
        }
        setError(zh[err.code ?? ''] ?? err.message)
      } else {
        setError(err instanceof Error ? err.message : '创建失败')
      }
    } finally { setLoading(false) }
  }

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { setError('请输入房间邀请码'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.rooms.join(code.trim().toUpperCase())
      navigate(paths.room(res.room.id))
    } catch (err) {
      // 账号态错误本地化（如禁用账号在会话中途被拦）
      if (err instanceof HttpError && err.code === 'ACCOUNT_DISABLED') {
        setError('该账号已被禁用')
      } else {
        setError(err instanceof Error ? err.message : '加入失败，请检查邀请码')
      }
    } finally { setLoading(false) }
  }

  return (
    <CenteredShell>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl p-8 text-center border border-gold/15"
          style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.6) 0%, rgb(var(--accent-bg-mid)/ 0.9) 100%)' }}
        >
          <h1 className="font-serif text-2xl text-gold font-bold mb-2">🌸 歌牌 Karuta</h1>
          <p className="text-muted text-caption mb-6">游客模式 · 输入邀请码加入对局</p>

          {step === 'name' ? (
            <form onSubmit={handleSetName} className="space-y-4">
              <Input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="text-center" placeholder="取一个昵称" autoFocus />
              {error && <p className="text-crimson text-caption">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                确定昵称
              </Button>
              <p className="text-muted/40 text-[10px]">
                已有账号？<Link to={paths.login()} className="text-gold/60 hover:text-gold">去登录</Link>
              </p>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <p className="text-body-text/60 text-caption mb-2">你好，<span className="text-gold">{user?.username}</span>！</p>
              <Input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                className="text-center text-lg tracking-[0.3em] font-mono" placeholder="输入邀请码" autoFocus
                maxLength={6} />
              {error && <p className="text-crimson text-caption">{error}</p>}
              <Button type="submit" loading={loading} className="w-full">
                加入对局
              </Button>
              <button type="button" onClick={() => { logout(); setStep('name') }}
                className="text-muted/50 text-[10px] hover:text-muted transition-colors w-full">
                退出当前账号
              </button>
            </form>
          )}
        </motion.div>

        {/* 转正入口（v7 增补）：仅已登录游客可见 */}
        {user?.is_guest && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="w-full max-w-sm rounded-2xl p-6 mt-4 text-left border border-white/10"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgb(var(--accent-bg-mid)/ 0.6) 100%)' }}>
            <p className="text-gold text-caption font-serif mb-1 flex items-center gap-1.5">
              <Sparkles size={12} /> 升级为正式账号
            </p>
            <p className="text-muted/50 text-[10px] mb-3">
              保留全部战绩、成就与牌库；换个昵称设置密码即可（原游客昵称与恢复码作废）
            </p>
            <form onSubmit={handleUpgrade} className="space-y-3">
              <Input type="text" value={upgradeName} onChange={e => setUpgradeName(e.target.value)}
                placeholder="正式昵称（2-20 字符）" />
              <Input type="password" value={upgradePw} onChange={e => setUpgradePw(e.target.value)}
                placeholder="设置密码（至少 6 位）" autoComplete="new-password" />
              {upgradeError && <p className="text-crimson text-caption">{upgradeError}</p>}
              <Button type="submit" loading={upgrading} variant="outline" className="w-full">立即升级</Button>
            </form>
          </motion.div>
        )}
    </CenteredShell>
  )
}
