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
  const [maskEnabled, setMaskEnabled] = useState(false)
  const [maskDifficulty, setMaskDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal')
  const [penaltyWrong, setPenaltyWrong] = useState(false)
  const [penaltySlow, setPenaltySlow] = useState(false)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [shuffleRemaining, setShuffleRemaining] = useState(5)
  const [randomStart, setRandomStart] = useState(false)
  const [randomStartMax, setRandomStartMax] = useState(50)
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
      const room = await api.rooms.create(selectedDeckId, intervalSec, selectedMode, maskEnabled, maskDifficulty, penaltyWrong, penaltySlow, shuffleEnabled ? shuffleRemaining : 0, randomStart, randomStartMax)
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
        {/* Header with decorative gradient */}
        <div className="relative mb-8 overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
          <div className="flex items-center gap-4 relative">
            <button onClick={() => navigate(-1)} className="text-pink-300/50 hover:text-gold transition-all duration-200 text-sm hover:scale-110">
              ← 撤退
            </button>
            <div>
              <h1 className="font-serif text-xl text-gold font-bold tracking-wide">⚔️ 开辟战场！</h1>
              <p className="text-pink-300/60 text-xs mt-0.5 font-serif italic">调配阵容、设置规则，向命运宣战 ✧</p>
            </div>
          </div>
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
                style={{ textShadow: '0 0 30px rgba(var(--accent-primary),0.5)' }}
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
                className="rounded-2xl p-6 flex flex-col gap-6"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.6) 0%, rgba(var(--accent-bg-mid),0.9) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}
              >
                {/* Deck selection */}
                <div>
                  <label className="text-gold/70 text-xs block mb-3 tracking-widest font-serif">
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
                              background: 'rgba(var(--accent-primary),0.1)',
                              border: '1px solid rgba(var(--accent-primary),0.2)',
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
                  <label className="text-gold/70 text-xs block mb-3 tracking-widest font-serif">
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
                      background: `linear-gradient(to right, var(--color-gold) ${((intervalSec - 3) / 27) * 100}%, var(--color-surface) ${((intervalSec - 3) / 27) * 100}%)`,
                    }}
                  />
                  <div className="flex justify-between text-muted text-xs mt-1.5">
                    <span>3秒</span>
                    <span>30秒</span>
                  </div>
                </div>

                {/* Mode selection */}
                <div>
                  <label className="text-gold/70 text-xs block mb-3 tracking-widest font-serif">
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

                {/* Mask (blur) option */}
                <div>
                  <label className="text-gold/70 text-xs block mb-3 tracking-widest font-serif">
                    🎭 模糊牌面
                  </label>
                  <div
                    onClick={() => setMaskEnabled(!maskEnabled)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                      maskEnabled
                        ? 'bg-gold/10 border border-gold/30'
                        : 'bg-white/5 border border-white/5 hover:border-gold/20'
                    }`}>
                    <div className={`w-9 h-5 rounded-full transition-all duration-200 relative shrink-0 ${
                      maskEnabled ? 'bg-gold/50' : 'bg-white/10'
                    }`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                        maskEnabled ? 'left-[18px] bg-gold' : 'left-0.5 bg-white/30'
                      }`} />
                    </div>
                    <div>
                      <span className={`text-sm ${maskEnabled ? 'text-white/90' : 'text-white/60'}`}>开启模糊牌面</span>
                      <p className="text-xs text-pink-300/40 mt-0.5">封面图会被随机遮罩，增加辨识难度 (*´艸`*)</p>
                    </div>
                  </div>
                  {maskEnabled && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {([
                        { key: 'easy', label: '简单', desc: '遮1/4' },
                        { key: 'normal', label: '普通', desc: '遮1/2' },
                        { key: 'hard', label: '困难', desc: '遮3/4' },
                      ] as const).map(({ key, label, desc }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setMaskDifficulty(key)}
                          className={[
                            'flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-center transition-all',
                            maskDifficulty === key
                              ? 'border-gold bg-gold/10 text-white'
                              : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
                          ].join(' ')}
                        >
                          <span className="text-xs font-medium">{label}</span>
                          <span className="text-xs text-muted">{desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 扣分设置 */}
                <div className="rounded-xl p-4"
                  style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.15), rgba(var(--accent-bg-mid),0.4))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                  <h3 className="text-gold/80 text-xs font-serif mb-3">⚡ 惩罚规则</h3>
                  <div className="space-y-3">
                    {[
                      { label: '🎯 抢错扣分', desc: '点了不是当前播放的牌', checked: penaltyWrong, onChange: setPenaltyWrong },
                      { label: '💨 抢慢扣分', desc: '牌已被别人先抢走', checked: penaltySlow, onChange: setPenaltySlow },
                    ].map(item => (
                      <div key={item.label}
                        onClick={() => item.onChange(!item.checked)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                          item.checked
                            ? 'bg-crimson/10 border border-crimson/25'
                            : 'bg-white/5 border border-white/5 hover:border-white/10'
                        }`}>
                        <div className={`w-8 h-4 rounded-full transition-all duration-200 relative shrink-0 ${
                          item.checked ? 'bg-crimson/50' : 'bg-white/10'
                        }`}>
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${
                            item.checked ? 'left-[17px] bg-crimson' : 'left-0.5 bg-white/30'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${item.checked ? 'text-white/80' : 'text-white/40'}`}>
                            {item.label}
                          </p>
                          <p className="text-[10px] text-muted/50">{item.desc}</p>
                        </div>
                        <span className={`text-[10px] shrink-0 ${item.checked ? 'text-crimson/70' : 'text-white/20'}`}>
                          {item.checked ? '-1' : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-muted/40 text-[10px] mt-2 text-center font-serif">关闭后仅禁止本轮继续抢，不扣分 ♪</p>
                </div>

                {/* 牌面打乱 */}
                <div className="rounded-xl p-4"
                  style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.15), rgba(var(--accent-bg-mid),0.4))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                  <h3 className="text-gold/80 text-xs font-serif mb-3">🔀 牌面打乱</h3>
                  <div onClick={() => setShuffleEnabled(!shuffleEnabled)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                      shuffleEnabled ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                    }`}>
                    <div className={`w-8 h-4 rounded-full transition-all duration-200 relative shrink-0 ${
                      shuffleEnabled ? 'bg-gold/50' : 'bg-white/10'
                    }`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${
                        shuffleEnabled ? 'left-[17px] bg-gold' : 'left-0.5 bg-white/30'
                      }`} />
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${shuffleEnabled ? 'text-white/80' : 'text-white/40'}`}>
                        🌀 每轮抢完后打乱牌面
                      </p>
                      <p className="text-[10px] text-muted/50">增加混乱度，考验记忆力！</p>
                    </div>
                  </div>
                  {shuffleEnabled && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-muted text-xs">剩余</span>
                      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                        <button type="button" onClick={() => setShuffleRemaining(Math.max(1, shuffleRemaining - 1))}
                          className="px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold">−</button>
                        <input type="text" value={shuffleRemaining}
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setShuffleRemaining(Math.min(99, Math.max(1, v))) }}
                          className="w-8 text-center text-sm text-white/90 font-medium bg-transparent outline-none py-1"
                          style={{ background: 'rgba(var(--accent-primary),0.05)' }} />
                        <button type="button" onClick={() => setShuffleRemaining(Math.min(99, shuffleRemaining + 1))}
                          className="px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold">+</button>
                      </div>
                      <span className="text-muted text-xs">张时开始打乱</span>
                    </div>
                  )}
                </div>

                {/* 随机片段播放 */}
                <div className="rounded-xl p-4"
                  style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.15), rgba(var(--accent-bg-mid),0.4))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
                  <h3 className="text-gold/80 text-xs font-serif mb-3">🎲 随机片段</h3>
                  <div onClick={() => setRandomStart(!randomStart)}
                    className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                      randomStart ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                    }`}>
                    <div className={`w-8 h-4 rounded-full transition-all duration-200 relative shrink-0 ${
                      randomStart ? 'bg-gold/50' : 'bg-white/10'
                    }`}>
                      <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${
                        randomStart ? 'left-[17px] bg-gold' : 'left-0.5 bg-white/30'
                      }`} />
                    </div>
                    <div>
                      <p className={`text-xs font-medium ${randomStart ? 'text-white/80' : 'text-white/40'}`}>
                        🎵 每首歌从随机位置开始播放
                      </p>
                      <p className="text-[10px] text-muted/50">不从头播，增加听歌难度！</p>
                    </div>
                  </div>
                  {randomStart && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-muted text-xs">最大起始位置</span>
                      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid rgba(var(--accent-primary),0.2)' }}>
                        <button type="button" onClick={() => setRandomStartMax(Math.max(10, randomStartMax - 10))}
                          className="px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold">−</button>
                        <input type="text" value={randomStartMax}
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setRandomStartMax(Math.min(80, Math.max(10, v))) }}
                          className="w-8 text-center text-sm text-white/90 font-medium bg-transparent outline-none py-1"
                          style={{ background: 'rgba(var(--accent-primary),0.05)' }} />
                        <span className="text-white/50 text-xs pr-1">%</span>
                        <button type="button" onClick={() => setRandomStartMax(Math.min(80, randomStartMax + 10))}
                          className="px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold">+</button>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <p className="text-crimson text-sm text-center bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                    😣 {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creating || !selectedDeckId}
                  className="btn-gold w-full text-base py-3.5 disabled:opacity-50 transition-all duration-200 hover:scale-[1.02] shadow-lg shadow-gold/20 font-serif"
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
