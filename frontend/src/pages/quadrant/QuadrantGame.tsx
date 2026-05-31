import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { useAuth } from '../../hooks/useAuth'
import type { QRoom, QPlayer, QWSEvent } from '../../api/quadrant'

interface RevealedItem {
  index: number
  title: string
  image_url: string
  x: number
  y: number
}

interface Props {
  room: QRoom
  players?: QPlayer[]
  send: (data: object) => void
  connected: boolean
  onEvent?: (e: QWSEvent) => void
  latestEvent: QWSEvent | null
  isJudge: boolean
}

// Tag colors for visual distinction
const TAG_COLORS = [
  { bg: 'rgba(255,99,132,0.15)', border: 'rgba(255,99,132,0.4)', text: 'rgb(255,140,170)' },
  { bg: 'rgba(54,162,235,0.15)', border: 'rgba(54,162,235,0.4)', text: 'rgb(100,190,255)' },
  { bg: 'rgba(255,206,86,0.15)', border: 'rgba(255,206,86,0.4)', text: 'rgb(255,220,100)' },
  { bg: 'rgba(75,192,192,0.15)', border: 'rgba(75,192,192,0.4)', text: 'rgb(100,220,220)' },
  { bg: 'rgba(153,102,255,0.15)', border: 'rgba(153,102,255,0.4)', text: 'rgb(180,140,255)' },
  { bg: 'rgba(255,159,64,0.15)', border: 'rgba(255,159,64,0.4)', text: 'rgb(255,180,100)' },
  { bg: 'rgba(46,204,113,0.15)', border: 'rgba(46,204,113,0.4)', text: 'rgb(80,230,140)' },
  { bg: 'rgba(241,196,15,0.15)', border: 'rgba(241,196,15,0.4)', text: 'rgb(241,210,80)' },
  { bg: 'rgba(230,126,34,0.15)', border: 'rgba(230,126,34,0.4)', text: 'rgb(240,160,70)' },
  { bg: 'rgba(142,68,173,0.15)', border: 'rgba(142,68,173,0.4)', text: 'rgb(180,110,210)' },
  { bg: 'rgba(26,188,156,0.15)', border: 'rgba(26,188,156,0.4)', text: 'rgb(60,210,185)' },
  { bg: 'rgba(231,76,60,0.15)', border: 'rgba(231,76,60,0.4)', text: 'rgb(240,120,110)' },
]

function getTagColor(tag: string, candidates: string[]): { bg: string; border: string; text: string } {
  const idx = candidates.indexOf(tag)
  return TAG_COLORS[idx % TAG_COLORS.length] || TAG_COLORS[0]
}

// Sound effects
function playSound(type: 'reveal' | 'correct' | 'wrong' | 'start' | 'end') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.value = 0.1

    switch (type) {
      case 'reveal':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(800, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
        osc.start()
        osc.stop(ctx.currentTime + 0.2)
        break
      case 'correct':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(523, ctx.currentTime)
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1)
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
        osc.start()
        osc.stop(ctx.currentTime + 0.4)
        break
      case 'wrong':
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
        osc.start()
        osc.stop(ctx.currentTime + 0.3)
        break
      case 'start':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.setValueAtTime(554, ctx.currentTime + 0.15)
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
        osc.start()
        osc.stop(ctx.currentTime + 0.5)
        break
      case 'end':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(523, ctx.currentTime)
        osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1)
        osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2)
        osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.3)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
        osc.start()
        osc.stop(ctx.currentTime + 0.6)
        break
    }
  } catch { /* ignore audio errors */ }
}

export function QuadrantGame({ room, send, connected, latestEvent, isJudge }: Props) {
  useAuth()
  const [candidates, setCandidates] = useState<string[]>([])
  const [revealedItems, setRevealedItems] = useState<RevealedItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [guessX, setGuessX] = useState('')
  const [guessY, setGuessY] = useState('')
  const [guessResult, setGuessResult] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [correctPlayers, setCorrectPlayers] = useState<Array<{ username: string; score: number }>>([])
  const [roundEnd, setRoundEnd] = useState<any>(null)
  const [eliminated, setEliminated] = useState<string[]>([])
  const [hints, setHints] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const [currentRound, setCurrentRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(1)
  const guessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleWS = useCallback((e: QWSEvent) => {
    switch (e.type) {
      case 'game_start':
        setCandidates(e.candidates)
        setTotalCount(e.item_count)
        setRevealedItems([])
        setRoundEnd(null)
        setCorrectPlayers([])
        setEliminated([])
        setHints([])
        setCooldown(0)
        setCurrentRound(e.round)
        setTotalRounds(e.total_rounds)
        playSound('start')
        break
      case 'game_state':
        setCandidates(e.candidates)
        setTotalCount(e.item_count)
        setRevealedItems(e.revealed_items)
        setPaused(e.paused)
        break
      case 'item_revealed':
        setRevealedItems(prev => [...prev, { index: e.index, title: e.title, image_url: e.image_url, x: e.x, y: e.y }])
        setCooldown(prev => Math.max(0, prev - 1))
        playSound('reveal')
        break
      case 'guess_result':
        if (e.correct) {
          setGuessResult(`✧ 正解! +${e.score}分 ✧`)
          playSound('correct')
        } else if (e.error === 'cooldown') {
          setGuessResult(`冷却中…还剩 ${e.cooldown_remaining} 轮`)
        } else {
          setGuessResult(`✗ 不对哦 ${e.score}分`)
          setCooldown(e.cooldown_rounds || 1)
          playSound('wrong')
        }
        if (guessTimerRef.current) clearTimeout(guessTimerRef.current)
        guessTimerRef.current = setTimeout(() => setGuessResult(null), 3000)
        break
      case 'player_correct':
        setCorrectPlayers(prev => [...prev, { username: e.username, score: e.score }])
        break
      case 'round_end':
        setRoundEnd(e)
        playSound('end')
        break
      case 'hint':
        if (e.hint_type === 'eliminate' && e.label) {
          setEliminated(prev => [...prev, e.label!])
        } else if (e.hint_type === 'text' && e.text) {
          setHints(prev => [...prev, e.text!])
        }
        break
      case 'game_paused':
        setPaused(true)
        break
      case 'game_resumed':
        setPaused(false)
        break
    }
  }, [])

  useEffect(() => {
    if (latestEvent) handleWS(latestEvent)
  }, [latestEvent, handleWS])

  useEffect(() => {
    return () => { if (guessTimerRef.current) clearTimeout(guessTimerRef.current) }
  }, [])

  const handleGuess = () => {
    if (!guessX || !guessY || guessX === guessY) return
    send({ type: 'guess', data: { x_label: guessX, y_label: guessY } })
    setGuessX('')
    setGuessY('')
  }

  const activeCandidates = candidates.filter(c => !eliminated.includes(c))

  // --- Round End Screen ---
  if (roundEnd) {
    const hasNext = roundEnd.has_next_round
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}>
            <div className="text-center mb-2">
              {totalRounds > 1 && (
                <p className="text-muted/40 text-xs font-serif">第 {roundEnd.round}/{roundEnd.total_rounds} 题</p>
              )}
              <h1 className="text-2xl font-serif text-gold font-bold">🎉 本局终了</h1>
              <p className="text-muted/50 text-sm font-serif italic">真相揭晓…</p>
            </div>

            {/* Answer reveal */}
            <div className="flex justify-center gap-4 mb-8">
              <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                className="rounded-xl px-6 py-3 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.3)' }}>
                <p className="text-muted/50 text-xs mb-1">X轴</p>
                <p className="text-gold font-serif font-bold text-lg">{roundEnd.axis_x}</p>
              </motion.div>
              <motion.div initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                className="rounded-xl px-6 py-3 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.5), rgba(var(--accent-bg-mid),0.8))', border: '1px solid rgba(var(--accent-primary),0.3)' }}>
                <p className="text-muted/50 text-xs mb-1">Y轴</p>
                <p className="text-gold font-serif font-bold text-lg">{roundEnd.axis_y}</p>
              </motion.div>
            </div>

            {/* Full chart */}
            <div className="rounded-2xl p-6 mb-6"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
              <QuadrantChart items={roundEnd.all_placements || []} axisX={roundEnd.axis_x} axisY={roundEnd.axis_y} showAll />
            </div>

            {/* Rankings */}
            <div className="rounded-2xl overflow-hidden mb-6"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(var(--accent-primary),0.08)' }}>
                <h3 className="font-serif text-sm text-gold">🏆 战果</h3>
              </div>
              <div className="p-3">
                {roundEnd.rankings?.sort((a: any, b: any) => b.score - a.score).map((r: any, i: number) => (
                  <motion.div key={r.user_id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.1 }}
                    className="flex items-center justify-between py-2.5 px-3 rounded-lg mb-1"
                    style={{ background: i === 0 ? 'rgba(var(--glow-color),0.08)' : 'transparent' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-gold/60 font-serif font-bold text-sm w-6">#{i + 1}</span>
                      <span className="text-white/80 text-sm">{r.username}</span>
                    </div>
                    <span className="text-gold font-serif font-bold">{r.score}分</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Next round / Restart buttons */}
            {(isJudge || room.host_id > 0) && (
              <div className="flex gap-3 justify-center">
                {hasNext && (
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => send({ type: 'next_round' })}
                    className="btn-gold px-6 py-3 text-sm shadow-lg shadow-gold/20">
                    ⚡ 下一题
                  </motion.button>
                )}
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => send({ type: 'restart' })}
                  className="px-6 py-3 rounded-xl font-serif text-sm text-muted/70 transition-colors hover:text-white/80"
                  style={{ border: '1px solid rgba(var(--accent-primary),0.15)' }}>
                  🔄 重新开始
                </motion.button>
              </div>
            )}
          </motion.div>
        </div>
      </Layout>
    )
  }

  // --- Game Screen ---
  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-6">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.span
              animate={{ scale: connected ? [1, 1.2, 1] : 1, opacity: connected ? 1 : 0.3 }}
              transition={{ repeat: connected ? Infinity : 0, duration: 2 }}
              className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`}
            />
            <span className="text-sm text-muted/60 font-serif">{room.name || '猜象限'}</span>
            {totalRounds > 1 && (
              <span className="text-xs text-muted/40 font-serif">第 {currentRound}/{totalRounds} 题</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs">
            {/* Progress bar */}
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--accent-primary),0.1)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'rgba(var(--glow-color),0.8)' }}
                  animate={{ width: `${(revealedItems.length / Math.max(totalCount, 1)) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 200 }}
                />
              </div>
              <span className="text-muted/40 font-mono">{revealedItems.length}/{totalCount}</span>
            </div>
            {paused && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-yellow-300 font-serif">⏸ 暂停</motion.span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Main: Quadrant Chart */}
          <div className="rounded-2xl p-4 sm:p-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5) 0%, rgba(var(--accent-bg-mid),0.7) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 opacity-5 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),1), transparent 70%)' }} />
            <QuadrantChart items={revealedItems} />
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* Candidates with colors */}
            <div className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
              <h3 className="font-serif text-xs text-gold/70 mb-2">候选标签</h3>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map(c => {
                  const color = getTagColor(c, candidates)
                  const isEliminated = eliminated.includes(c)
                  return (
                    <motion.span key={c} layout
                      className="text-xs px-2.5 py-1 rounded-full font-serif transition-all"
                      style={{
                        background: isEliminated ? 'rgba(248,112,144,0.08)' : color.bg,
                        border: `1px solid ${isEliminated ? 'rgba(248,112,144,0.25)' : color.border}`,
                        color: isEliminated ? 'rgba(248,112,144,0.4)' : color.text,
                        textDecoration: isEliminated ? 'line-through' : 'none',
                        opacity: isEliminated ? 0.5 : 1,
                      }}>
                      {c}
                    </motion.span>
                  )
                })}
              </div>
            </div>

            {/* Hints */}
            <AnimatePresence>
              {hints.length > 0 && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="rounded-2xl p-3"
                  style={{ background: 'rgba(var(--glow-color),0.05)', border: '1px solid rgba(var(--glow-color),0.15)' }}>
                  <h3 className="font-serif text-xs text-gold/60 mb-1">💡 提示</h3>
                  {hints.map((h, i) => <p key={i} className="text-xs text-gold/70 font-serif italic">{h}</p>)}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Guess panel */}
            {!isJudge && (
              <div className="rounded-2xl p-4"
                style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
                <h3 className="font-serif text-xs text-gold/70 mb-2">🎯 猜测</h3>
                <div className="space-y-2">
                  <select value={guessX} onChange={e => setGuessX(e.target.value)}
                    className="input-dark w-full py-2 text-xs">
                    <option value="">选择标签 1…</option>
                    {activeCandidates.map(c => {
                      const color = getTagColor(c, candidates)
                      return <option key={c} value={c} style={{ color: color.text }}>{c}</option>
                    })}
                  </select>
                  <select value={guessY} onChange={e => setGuessY(e.target.value)}
                    className="input-dark w-full py-2 text-xs">
                    <option value="">选择标签 2…</option>
                    {activeCandidates.filter(c => c !== guessX).map(c => {
                      const color = getTagColor(c, candidates)
                      return <option key={c} value={c} style={{ color: color.text }}>{c}</option>
                    })}
                  </select>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleGuess}
                    disabled={!guessX || !guessY || cooldown > 0}
                    className="btn-gold w-full py-2.5 text-xs disabled:opacity-40 shadow-lg shadow-gold/10">
                    {cooldown > 0 ? `冷却中 (${cooldown}轮)` : '提交猜测'}
                  </motion.button>
                </div>
                <AnimatePresence>
                  {guessResult && (
                    <motion.p
                      initial={{ opacity: 0, y: -5, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`text-xs mt-2 text-center font-serif py-1.5 rounded-lg ${
                        guessResult.includes('正解') ? 'text-green-300 bg-green-900/20' : 'text-crimson bg-crimson/10'
                      }`}>
                      {guessResult}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Judge controls */}
            {isJudge && (
              <div className="rounded-2xl p-4"
                style={{ background: 'linear-gradient(180deg, rgba(100,50,150,0.2), rgba(60,20,100,0.3))', border: '1px solid rgba(180,100,255,0.15)' }}>
                <h3 className="font-serif text-xs text-purple-300/70 mb-3">👑 裁判操作</h3>
                <div className="space-y-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => send({ type: 'judge_reveal_next' })}
                    className="w-full py-2 rounded-lg text-xs font-serif text-purple-200 transition-colors"
                    style={{ background: 'rgba(180,100,255,0.12)', border: '1px solid rgba(180,100,255,0.25)' }}>
                    揭示下一部
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => send({ type: paused ? 'judge_resume' : 'judge_pause' })}
                    className="w-full py-2 rounded-lg text-xs font-serif text-purple-200/70 transition-colors"
                    style={{ background: 'rgba(180,100,255,0.06)', border: '1px solid rgba(180,100,255,0.15)' }}>
                    {paused ? '▶ 继续' : '⏸ 暂停'}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => send({ type: 'judge_end' })}
                    className="w-full py-2 rounded-lg text-xs font-serif text-crimson/70 transition-colors"
                    style={{ background: 'rgba(248,112,144,0.06)', border: '1px solid rgba(248,112,144,0.15)' }}>
                    结束本局
                  </motion.button>
                </div>
              </div>
            )}

            {/* Scoreboard */}
            <div className="rounded-2xl p-4"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.4), rgba(var(--accent-bg-mid),0.6))', border: '1px solid rgba(var(--accent-primary),0.1)' }}>
              <h3 className="font-serif text-xs text-gold/70 mb-2">🏆 猜对的勇者</h3>
              <AnimatePresence>
                {correctPlayers.map((cp, i) => (
                  <motion.div key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-between text-xs py-1.5 px-2 rounded-lg mb-1"
                    style={{ background: 'rgba(var(--glow-color),0.05)' }}>
                    <span className="text-green-300 font-serif">{cp.username}</span>
                    <span className="text-gold font-bold">+{cp.score}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {correctPlayers.length === 0 && (
                <p className="text-muted/30 text-xs font-serif italic text-center py-2">等待推理中…</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

// --- Quadrant Chart SVG ---
function QuadrantChart({ items, axisX, axisY, showAll }: {
  items: Array<{ title: string; image_url?: string; x: number; y: number }>
  axisX?: string
  axisY?: string
  showAll?: boolean
}) {
  const size = 360
  const pad = 40

  const toX = (v: number) => pad + ((v + 1) / 2) * (size - pad * 2)
  const toY = (v: number) => pad + ((1 - (v + 1) / 2)) * (size - pad * 2)
  const cx = size / 2
  const cy = size / 2

  return (
    <div className="flex justify-center">
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="max-w-[360px]">
        {/* Background quadrant shading */}
        <rect x={pad} y={pad} width={(size - pad * 2) / 2} height={(size - pad * 2) / 2}
          fill="rgba(var(--accent-primary),0.02)" />
        <rect x={cx} y={pad} width={(size - pad * 2) / 2} height={(size - pad * 2) / 2}
          fill="rgba(var(--accent-primary),0.04)" />
        <rect x={pad} y={cy} width={(size - pad * 2) / 2} height={(size - pad * 2) / 2}
          fill="rgba(var(--accent-primary),0.01)" />
        <rect x={cx} y={cy} width={(size - pad * 2) / 2} height={(size - pad * 2) / 2}
          fill="rgba(var(--accent-primary),0.03)" />

        {/* Grid lines */}
        <line x1={pad} y1={cy} x2={size - pad} y2={cy} stroke="rgba(var(--accent-primary),0.15)" strokeWidth="1" />
        <line x1={cx} y1={pad} x2={cx} y2={size - pad} stroke="rgba(var(--accent-primary),0.15)" strokeWidth="1" />

        {/* Border */}
        <rect x={pad} y={pad} width={size - pad * 2} height={size - pad * 2}
          fill="none" stroke="rgba(var(--accent-primary),0.1)" strokeWidth="1" rx="4" />

        {/* Axis arrows */}
        <polygon points={`${size - pad + 5},${cy} ${size - pad - 2},${cy - 4} ${size - pad - 2},${cy + 4}`}
          fill="rgba(var(--accent-primary),0.3)" />
        <polygon points={`${cx},${pad - 5} ${cx - 4},${pad + 2} ${cx + 4},${pad + 2}`}
          fill="rgba(var(--accent-primary),0.3)" />

        {/* Axis labels */}
        {axisX && <text x={size - pad + 8} y={cy + 4} fill="rgba(var(--glow-color),0.8)" fontSize="10" fontFamily="serif">{axisX}</text>}
        {axisY && <text x={cx + 6} y={pad - 10} fill="rgba(var(--glow-color),0.8)" fontSize="10" fontFamily="serif">{axisY}</text>}
        {!axisX && <text x={size - pad + 4} y={cy + 4} fill="rgba(var(--accent-primary),0.3)" fontSize="9">+X</text>}
        {!axisY && <text x={cx + 4} y={pad - 6} fill="rgba(var(--accent-primary),0.3)" fontSize="9">+Y</text>}

        {/* Items */}
        {items.map((item, i) => {
          const px = toX(item.x)
          const py = toY(item.y)
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={12} fill="rgba(var(--glow-color),0.08)" />
              <motion.circle
                cx={px} cy={py} r={5}
                fill="rgba(var(--glow-color),0.9)"
                stroke="rgba(var(--glow-color),1)"
                strokeWidth="1.5"
                initial={showAll ? {} : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, delay: showAll ? i * 0.05 : 0 }}
              />
              <text x={px} y={py - 12} textAnchor="middle"
                fill="rgba(255,255,255,0.85)" fontSize="9" fontFamily="serif">
                {item.title.length > 10 ? item.title.slice(0, 10) + '…' : item.title}
              </text>
            </g>
          )
        })}

        {items.length === 0 && (
          <text x={cx} y={cy} textAnchor="middle" fill="rgba(var(--accent-primary),0.2)" fontSize="12" fontFamily="serif">
            等待揭示…
          </text>
        )}
      </svg>
    </div>
  )
}
