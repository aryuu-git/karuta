import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { ccpApi, type CcpRoom, type CcpPlayer, type RoomImageInfo } from '../../api/ccp'

export function CcpResult() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [room, setRoom] = useState<CcpRoom | null>(null)
  const [players, setPlayers] = useState<CcpPlayer[]>([])
  const [images, setImages] = useState<RoomImageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!code) return
    ccpApi.rooms.get(code).then(state => {
      setRoom(state.room)
      setPlayers(state.players)
      setImages(state.images)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [code])

  const handlePlayAgain = async () => {
    if (!code || resetting) return
    setResetting(true)
    try {
      await ccpApi.games.resetGame(code)
      navigate(`/ccp/rooms/${code}`)
    } catch {
      navigate('/ccp')
    } finally { setResetting(false) }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="text-gold/50 font-serif">加载中…</motion.div>
        </div>
      </Layout>
    )
  }

  if (!room) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-muted/40 font-serif mb-4">冒险已结束或房间不存在</p>
          <button onClick={() => navigate('/ccp')} className="btn-gold px-6 py-3 rounded-xl font-serif">返回大厅</button>
        </div>
      </Layout>
    )
  }

  const sorted = [...players].filter(p => !p.is_host).sort((a, b) => b.score - a.score)
  const winner = sorted[0]
  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center mb-8"
        >
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-3xl font-serif font-bold mb-2">
            <span className="text-gold-shimmer">冒险结束啦~</span>
          </h1>
          <p className="text-muted/40 font-serif">感谢所有勇者的精彩表现！</p>
        </motion.div>

        {/* Rankings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-6 mb-6"
          style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
        >
          {/* Podium */}
          <div className="flex justify-center items-end gap-4 mb-6">
            {sorted[1] && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 ring-1 ring-muted/20 flex items-center justify-center mb-2 text-2xl">
                  {sorted[1].avatar_url ? <img src={sorted[1].avatar_url} className="w-10 h-10 rounded-lg" alt="" /> : '👤'}
                </div>
                <span className="text-xl mb-1">🥈</span>
                <span className="font-serif text-sm text-white/70">{sorted[1].username || `User#${sorted[1].user_id}`}</span>
                <span className="font-serif font-bold text-gold">{sorted[1].score} 分</span>
              </motion.div>
            )}
            {winner && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col items-center -mt-4"
              >
                <div className="w-16 h-16 rounded-xl bg-gold/10 ring-2 ring-gold/50 flex items-center justify-center mb-2 text-3xl"
                  style={{ boxShadow: '0 0 24px rgba(var(--accent-primary),0.25)' }}>
                  {winner.avatar_url ? <img src={winner.avatar_url} className="w-14 h-14 rounded-xl" alt="" /> : '👑'}
                </div>
                <span className="text-xl mb-1">🥇</span>
                <span className="font-serif font-bold text-lg text-gold">{winner.username || `User#${winner.user_id}`}</span>
                <span className="font-serif font-bold text-2xl text-gold-shimmer">{winner.score} 分</span>
                <span className="text-xs text-gold mt-1 font-serif">🏆 最强勇者！</span>
              </motion.div>
            )}
            {sorted[2] && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 ring-1 ring-muted/20 flex items-center justify-center mb-2 text-2xl">
                  {sorted[2].avatar_url ? <img src={sorted[2].avatar_url} className="w-10 h-10 rounded-lg" alt="" /> : '👤'}
                </div>
                <span className="text-xl mb-1">🥉</span>
                <span className="font-serif text-sm text-white/70">{sorted[2].username || `User#${sorted[2].user_id}`}</span>
                <span className="font-serif font-bold text-gold">{sorted[2].score} 分</span>
              </motion.div>
            )}
          </div>

          {/* Rest */}
          {sorted.slice(3).map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-3 p-3 rounded-xl mb-1.5"
              style={{ background: 'rgba(var(--accent-primary),0.04)' }}>
              <span className="font-serif text-muted/30 w-6 text-center text-sm">{i + 4}</span>
              <span className="flex-1 font-serif text-sm">{p.username || `User#${p.user_id}`}</span>
              <span className="font-serif font-bold text-gold">{p.score} 分</span>
            </div>
          ))}
        </motion.div>

        {/* CG Gallery */}
        {images.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl p-5 mb-6"
            style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}
          >
            <h2 className="font-serif text-sm text-gold/80 mb-3">🎨 本次 CG</h2>
            <div className="grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                <img key={i} src={img.image_url} className="w-full rounded-xl shadow-md bg-white/[0.03]" alt=""
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex gap-3"
        >
          <button onClick={() => navigate('/ccp')}
            className="flex-1 py-3 bg-white/5 rounded-xl font-serif text-muted/60 hover:bg-white/10 flex items-center justify-center gap-2">
            🏠 返回大厅
          </button>
          <button onClick={handlePlayAgain} disabled={resetting}
            className="flex-1 py-3 btn-gold rounded-xl font-serif font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            🔄 再来一局！
          </button>
        </motion.div>
      </div>
    </Layout>
  )
}
