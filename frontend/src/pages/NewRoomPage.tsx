import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Deck, Room } from '../api/types'

export function NewRoomPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const presetDeckId = searchParams.get('deck_id')

  const [decks, setDecks] = useState<Deck[]>([])
  const [loadingDecks, setLoadingDecks] = useState(true)

  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    presetDeckId ? parseInt(presetDeckId, 10) : null
  )
  const [intervalSec, setIntervalSec] = useState(5)
  const [selectedMode, setSelectedMode] = useState<'auto' | 'judge'>('auto')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.decks.list()
      .then((data) => {
        setDecks(data)
        if (!selectedDeckId && data.length > 0) {
          setSelectedDeckId(data[0].id)
        }
      })
      .catch(() => null)
      .finally(() => setLoadingDecks(false))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedDeckId) return
    setCreating(true)
    setError(null)
    try {
      const room = await api.rooms.create(selectedDeckId, intervalSec, selectedMode)
      setCreatedRoom(room)
    } catch (err) {
      setError(err instanceof Error ? err.message : '战场开辟失败了… (；′⌒`) 再试一次吧！')
    } finally {
      setCreating(false)
    }
  }

  const copyCode = async () => {
    if (!createdRoom) return
    await navigator.clipboard.writeText(createdRoom.code).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="text-muted hover:text-gold transition-all duration-200 text-sm hover:scale-110">
            ← 撤退
          </button>
          <h1 className="font-serif text-xl text-gold">⚔️ 开辟战场！</h1>
        </div>

        <AnimatePresence mode="wait">
          {createdRoom ? (
            // Success state
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-border rounded-xl p-8 text-center"
            >
              <div className="text-5xl mb-2">🏯</div>
              <p className="text-gold font-serif text-base mb-1">战场已开辟！✨</p>
              <p className="text-muted text-xs mb-4 tracking-widest">把邀请码发给战友，一起来抢！(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
              <div
                className="font-serif text-6xl font-bold tracking-[0.2em] text-gold cursor-pointer mb-2 hover:scale-105 transition-transform duration-200"
                style={{ textShadow: '0 0 30px rgba(232,164,184,0.5)' }}
                onClick={copyCode}
              >
                {createdRoom.code}
              </div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: copied ? 1 : 0 }}
                className="text-green-400 text-xs mb-1"
              >
                复制成功 ✓ 快去分享！
              </motion.p>
              <p className="text-muted text-xs mb-8">
                点击复制 · 发给好友 · 一起来战！
              </p>
              <button
                onClick={() => navigate(`/rooms/${createdRoom.id}`)}
                className="btn-gold w-full text-lg py-4 transition-all duration-200 hover:scale-[1.02]"
              >
                「冲进去！」ヽ(°〇°)ﾉ
              </button>
            </motion.div>
          ) : (
            // Form
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <form
                onSubmit={handleSubmit}
                className="bg-surface border border-border rounded-xl p-6 flex flex-col gap-6"
              >
                {/* Deck selection */}
                <div>
                  <label className="text-muted text-xs block mb-3 tracking-widest">
                    🃏 选择作战牌组 *
                  </label>
                  {loadingDecks ? (
                    <div className="text-muted text-sm animate-pulse py-4 text-center">
                      加载牌组中… (｡･ω･｡)
                    </div>
                  ) : decks.length === 0 ? (
                    <div className="text-muted text-sm text-center py-4">
                      还没有牌组哦 (｡•́︿•̀｡)
                      <button
                        type="button"
                        onClick={() => navigate('/decks')}
                        className="text-gold underline ml-1 hover:text-gold-light transition-colors"
                      >
                        去创建一副！
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto">
                      {decks.map((deck) => (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setSelectedDeckId(deck.id)}
                          className={[
                            'flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all',
                            selectedDeckId === deck.id
                              ? 'border-gold bg-gold/10 text-white'
                              : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
                          ].join(' ')}
                        >
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center font-serif text-gold text-sm shrink-0"
                            style={{
                              background: 'rgba(232,164,184,0.1)',
                              border: '1px solid rgba(232,164,184,0.2)',
                            }}
                          >
                            歌
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-sans font-medium truncate">{deck.name}</div>
                            <div className="text-xs text-muted">{deck.card_count} 张</div>
                          </div>
                          {selectedDeckId === deck.id && (
                            <span className="text-gold text-sm shrink-0">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Interval slider */}
                <div>
                  <label className="text-muted text-xs block mb-3 tracking-widest">
                    ⏱️ 每张牌间隔时间:{' '}
                    <span className="text-gold font-medium">{intervalSec} 秒</span>
                    {intervalSec <= 5 && <span className="text-crimson ml-1 text-xs">（地狱难度 (ﾟДﾟ；)）</span>}
                    {intervalSec >= 20 && <span className="text-green-400 ml-1 text-xs">（休闲模式 (*´▽`*)）</span>}
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    step={1}
                    value={intervalSec}
                    onChange={(e) => setIntervalSec(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #e8a4b8 ${((intervalSec - 3) / 27) * 100}%, #3d1525 ${((intervalSec - 3) / 27) * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between text-muted text-xs mt-1.5">
                    <span>3秒</span>
                    <span>30秒</span>
                  </div>
                </div>

                {/* Mode selection */}
                <div>
                  <label className="text-muted text-xs block mb-3 tracking-widest">
                    🎭 游戏模式
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('auto')}
                      className={[
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-left transition-all',
                        selectedMode === 'auto'
                          ? 'border-gold bg-gold/10 text-white'
                          : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
                      ].join(' ')}
                    >
                      <span className="text-xl">🤖</span>
                      <span className="text-xs font-medium">自动模式</span>
                      <span className="text-xs text-muted text-center leading-relaxed">系统自动按间隔播放</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMode('judge')}
                      className={[
                        'flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-left transition-all',
                        selectedMode === 'judge'
                          ? 'border-gold bg-gold/10 text-white'
                          : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
                      ].join(' ')}
                    >
                      <span className="text-xl">👑</span>
                      <span className="text-xs font-medium">裁判模式</span>
                      <span className="text-xs text-muted text-center leading-relaxed">房主手动选每一首</span>
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                    😣 {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creating || !selectedDeckId}
                  className="btn-gold w-full text-base py-3 disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]"
                >
                  {creating ? '战场开辟中… (｡･ω･｡)' : '「开辟战场！」(ง •̀_•́)ง'}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  )
}
