import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'

export function JoinRoomPage() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) {
      setError('邀请码还没输呢！(＠＿＠) 快填上～')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const res = await api.rooms.join(trimmed)
      navigate(`/rooms/${res.room.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '闯入失败了… (；′⌒`) 检查一下邀请码？')
    } finally {
      setJoining(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Allow only alphanumeric input for invitation codes
    const allowed = /^[a-zA-Z0-9]$/
    if (!allowed.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault()
    }
  }

  return (
    <Layout>
      <div className="max-w-sm mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate(-1)} className="text-muted hover:text-gold transition-all duration-200 text-sm hover:scale-110">
            ← 撤退
          </button>
          <h1 className="font-serif text-xl text-gold">🔑 凭码入场！</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface border border-border rounded-xl p-8"
        >
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🗝️</div>
            <p className="text-gold text-sm font-serif tracking-widest mb-1">输入战场邀请码</p>
            <p className="text-muted text-xs">向朋友索取邀请码，冲进战场！(ง •̀_•́)ง</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase())
                  setError(null)
                }}
                onKeyDown={handleKeyDown}
                className="input-dark text-center font-serif font-bold tracking-[0.3em]"
                style={{ fontSize: '2rem', letterSpacing: '0.3em' }}
                placeholder="XXXXXX"
                maxLength={10}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                required
                autoFocus
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
              disabled={joining || !code.trim()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-gold w-full text-base py-4 disabled:opacity-50 transition-all duration-200"
            >
              {joining ? '闯入中… (ง •̀_•́)ง' : '「冲进去！」ヽ(°〇°)ﾉ'}
            </motion.button>
          </form>
        </motion.div>

        <p className="text-center mt-6 text-muted text-sm">
          想自己开战场？点击{' '}
          <button
            onClick={() => navigate('/rooms/new')}
            className="text-gold hover:text-gold-light transition-colors underline underline-offset-2"
          >
            这里开辟 ⚔️
          </button>
        </p>
      </div>
    </Layout>
  )
}
