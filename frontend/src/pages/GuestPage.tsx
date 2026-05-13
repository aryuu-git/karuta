import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'

export function GuestPage() {
  const { user, guestLogin, logout } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'name' | 'code'>(user?.is_guest ? 'code' : 'name')

  const handleSetName = async (e: FormEvent) => {
    e.preventDefault()
    const name = username.trim()
    if (!name || name.length < 2) { setError('昵称至少2个字符'); return }
    if (name.length > 20) { setError('昵称最多20个字符'); return }
    setLoading(true)
    setError(null)
    try {
      await guestLogin(name)
      setStep('code')
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally { setLoading(false) }
  }

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { setError('请输入房间邀请码'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.rooms.join(code.trim().toUpperCase())
      navigate(`/rooms/${res.room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen washi-bg">
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.6) 0%, rgba(var(--accent-bg-mid),0.9) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}
        >
          <h1 className="font-serif text-2xl text-gold font-bold mb-2">🌸 歌牌 Karuta</h1>
          <p className="text-muted text-xs mb-6">游客模式 · 输入邀请码加入对局</p>

          {step === 'name' ? (
            <form onSubmit={handleSetName} className="space-y-4">
              <div>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                  className="input-dark text-center w-full" placeholder="取一个昵称" autoFocus />
              </div>
              {error && <p className="text-crimson text-xs">{error}</p>}
              <button type="submit" disabled={loading} className="btn-gold w-full py-3 text-sm disabled:opacity-50">
                {loading ? '创建中…' : '确定昵称'}
              </button>
              <p className="text-muted/40 text-[10px]">
                已有账号？<a href="/login" className="text-gold/60 hover:text-gold">去登录</a>
              </p>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <p className="text-white/60 text-xs mb-2">你好，<span className="text-gold">{user?.username}</span>！</p>
              <div>
                <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  className="input-dark text-center w-full text-lg tracking-[0.3em] font-mono" placeholder="输入邀请码" autoFocus
                  maxLength={6} />
              </div>
              {error && <p className="text-crimson text-xs">{error}</p>}
              <button type="submit" disabled={loading} className="btn-gold w-full py-3 text-sm disabled:opacity-50">
                {loading ? '加入中…' : '加入对局'}
              </button>
              <button type="button" onClick={() => { logout(); setStep('name') }}
                className="text-muted/50 text-[10px] hover:text-white/60 transition-colors w-full">
                退出当前账号
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </div>
  )
}
