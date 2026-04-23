import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../hooks/useAuth'

const SECRET_CODE = '33989'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [secretCode, setSecretCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    // 用户名校验
    const trimName = username.trim()
    if (!trimName) {
      setError('战士昵称不能为空哦！(｡•́︿•̀｡)')
      return
    }
    if (trimName.length < 2) {
      setError('昵称至少要2个字符！再长一点嘛～ (≧ω≦)')
      return
    }
    if (trimName.length > 20) {
      setError('昵称最多20个字符，精简一下吧！(¬‿¬)')
      return
    }

    // 神秘代号校验
    if (secretCode.trim() !== SECRET_CODE) {
      setError('神秘代号不对哦！没有邀请码无法注册 (；′⌒`)')
      return
    }

    // 密码校验
    if (password.length < 6) {
      setError('密码太短啦！至少要6位哦 (｡•́︿•̀｡)')
      return
    }
    if (password !== confirm) {
      setError('两次密码不一样啦 (>_<) 再确认一下？')
      return
    }

    setLoading(true)
    try {
      await register(trimName, password)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败了… (；′⌒`) 再试试吧！')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen washi-bg flex items-center justify-center px-4">
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute top-1/3 right-1/3 w-80 h-80 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #e8a4b8, transparent)' }} />
        <div className="absolute bottom-1/3 left-1/4 w-56 h-56 rounded-full opacity-8 blur-2xl"
          style={{ background: 'radial-gradient(circle, #f5c6d0, transparent)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <Link to="/login">
            <h1 className="font-serif text-5xl font-bold text-gold-shimmer mb-1 hover:opacity-80 transition-opacity"
              style={{ textShadow: '0 0 40px rgba(232,164,184,0.4)' }}>
              🌸 二次元歌牌大乱斗
            </h1>
          </Link>
          <p className="text-muted text-sm mt-1">成为歌牌战士，一起抢个痛快！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
          <div className="mt-3 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="bg-surface border border-border rounded-xl p-8"
          style={{ boxShadow: '0 0 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(232,164,184,0.08)' }}
        >
          <h2 className="text-gold font-serif font-medium text-lg mb-1 text-center">
            加入战场！✨
          </h2>
          <p className="text-muted text-xs text-center mb-6">战友们都在等你，马上就能开始抢牌啦！(≧ω≦)</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* 用户名 */}
            <div>
              <label className="block text-muted text-xs mb-1.5">
                💭 战士昵称 <span className="text-muted/50">（2-20字符）</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-dark"
                placeholder="起个令人胆寒的名字吧 (¬‿¬)"
                autoComplete="username"
                maxLength={20}
                required
              />
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-muted text-xs mb-1.5">
                🔑 密码 <span className="text-muted/50">（至少6位）</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-dark"
                placeholder="输入密码"
                autoComplete="new-password"
                required
              />
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-muted text-xs mb-1.5">
                🔑 确认密码
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-dark"
                placeholder="再输一遍密码"
                autoComplete="new-password"
                required
              />
            </div>

            {/* 神秘代号 */}
            <div>
              <label className="block text-muted text-xs mb-1.5">
                🔮 神秘代号
                <span className="text-muted/40 ml-1">（只有被邀请的人才知道哦）</span>
              </label>
              <input
                type="text"
                value={secretCode}
                onChange={(e) => setSecretCode(e.target.value)}
                className="input-dark tracking-[0.3em] text-center"
                placeholder="？？？？？"
                autoComplete="off"
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
              {loading ? '召唤中… 请稍等 (｡･ω･｡)' : '「我要加入战场！」ヽ(°〇°)ﾉ'}
            </motion.button>
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-5 text-muted text-sm"
        >
          已经是老战士了？{' '}
          <Link to="/login" className="text-gold hover:text-gold-light transition-colors underline underline-offset-2">
            直接冲进去 →
          </Link>
        </motion.p>
      </motion.div>
    </div>
  )
}
