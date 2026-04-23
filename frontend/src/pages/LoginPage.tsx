import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

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
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '账号或密码好像不对哦 (>_<) 再试试？')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen washi-bg flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #e8a4b8, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-8 blur-2xl"
          style={{ background: 'radial-gradient(circle, #f5c6d0, transparent)' }} />
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
            style={{ textShadow: '0 0 40px rgba(232,164,184,0.4)' }}
          >
            🌸 二次元歌牌大乱斗
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted text-sm"
          >
            ✦ 传说中的抢牌战场，你来了吗？(ง •̀_•́)ง ✦
          </motion.p>
          <div className="mt-4 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="bg-surface border border-border rounded-xl p-8"
          style={{ boxShadow: '0 0 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(232,164,184,0.08)' }}
        >
          <h2 className="text-gold font-serif font-medium text-lg mb-1 text-center">
            おかえり～ (｡•̀ᴗ-)✧
          </h2>
          <p className="text-muted text-xs text-center mb-6">战友们已经蓄势待发了！快来集合！(≧▽≦)</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-muted text-xs mb-1.5">
                💭 你的战士昵称
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-dark"
                placeholder="输入昵称，让大家认识你！"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="block text-muted text-xs mb-1.5">
                🔑 密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark"
                placeholder="输入密码"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5"
              >
                😣 {error}
              </motion.p>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-gold w-full mt-2 text-base py-3 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? '正在召唤你的分身… (｡･ω･｡)' : '「冲进去！」ヽ(°〇°)ﾉ'}
            </motion.button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-5 text-muted text-sm"
        >
          还没有账号？{' '}
          <Link to="/register" className="text-gold hover:text-gold-light transition-colors underline underline-offset-2">
            快来加入战场 ✨
          </Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
