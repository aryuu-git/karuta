import { useState } from 'react'
import { motion } from 'framer-motion'
import { Layout } from '../../components/Layout'
import type { QRoom } from '../../api/quadrant'

interface JudgeItem {
  title: string
  image_url: string
  x: number
  y: number
}

interface Props {
  room: QRoom
  send: (data: object) => void
  connected: boolean
  onEvent: (e: any) => void
  latestEvent: any
}

export function QuadrantJudge({ room, send }: Props) {
  const [axisX, setAxisX] = useState('')
  const [axisY, setAxisY] = useState('')
  const [candidateInput, setCandidateInput] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [items, setItems] = useState<JudgeItem[]>([])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const addCandidate = () => {
    const name = candidateInput.trim()
    if (name && !candidates.includes(name)) {
      setCandidates([...candidates, name])
      setCandidateInput('')
    }
  }

  const removeCandidate = (name: string) => {
    setCandidates(candidates.filter(c => c !== name))
  }

  const addItem = () => {
    if (!newItemTitle.trim()) return
    setItems([...items, { title: newItemTitle.trim(), image_url: '', x: 0, y: 0 }])
    setNewItemTitle('')
  }

  const updateItemPos = (index: number, axis: 'x' | 'y', value: number) => {
    setItems(items.map((item, i) => i === index ? { ...item, [axis]: value } : item))
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!axisX || !axisY || candidates.length < 2 || items.length < 3) {
      alert('请至少设置: 2个轴标签, 4个候选标签(含轴), 3个条目')
      return
    }
    const allCandidates = [...new Set([axisX, axisY, ...candidates])]

    send({
      type: 'judge_submit_question',
      data: {
        axis_x: axisX,
        axis_y: axisY,
        candidates: allCandidates,
        items: items,
      }
    })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }}>
            <h1 className="text-2xl font-serif text-gold mb-3">✨ 题目已降临!</h1>
            <p className="text-muted/50 font-serif italic">游戏即将开始，请切换至裁判视角…</p>
          </motion.div>
        </div>
      </Layout>
    )
  }

  const allCandidatesPreview = [...new Set([axisX, axisY, ...candidates].filter(Boolean))]

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-serif text-xl text-gold mb-6"
        >
          👑 裁判出题 — {room.name || '猜象限'}
        </motion.h1>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
          {/* Left: form */}
          <div className="space-y-4">
            {/* Axis */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}
            >
              <h3 className="font-serif text-sm text-gold/80 mb-3">🎯 答案轴标签</h3>
              <p className="text-muted/40 text-xs mb-3 font-serif italic">玩家需要猜出这两个标签 ✧</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted/50 uppercase tracking-wider">X轴</label>
                  <input type="text" value={axisX} onChange={e => setAxisX(e.target.value)}
                    placeholder="如: 科幻"
                    className="input-dark w-full py-2.5 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-[10px] text-muted/50 uppercase tracking-wider">Y轴</label>
                  <input type="text" value={axisY} onChange={e => setAxisY(e.target.value)}
                    placeholder="如: 恋爱"
                    className="input-dark w-full py-2.5 text-sm mt-1" />
                </div>
              </div>
            </motion.div>

            {/* Candidates */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}
            >
              <h3 className="font-serif text-sm text-gold/80 mb-3">🏷 候选标签池</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" value={candidateInput}
                  onChange={e => setCandidateInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addCandidate()}
                  placeholder="输入干扰标签…"
                  className="input-dark flex-1 py-2 text-sm" />
                <button onClick={addCandidate}
                  className="btn-gold px-4 text-sm shadow-md shadow-gold/10">+</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {axisX && <span className="text-xs px-2.5 py-1 rounded-full font-serif bg-gold/15 text-gold border border-gold/30">★ {axisX}</span>}
                {axisY && <span className="text-xs px-2.5 py-1 rounded-full font-serif bg-gold/15 text-gold border border-gold/30">★ {axisY}</span>}
                {candidates.filter(c => c !== axisX && c !== axisY).map(c => (
                  <motion.span key={c} layout
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-xs px-2.5 py-1 rounded-full border border-white/15 text-white/70 cursor-pointer hover:border-crimson/50 hover:text-crimson/80 transition-colors font-serif"
                    onClick={() => removeCandidate(c)}>
                    {c} ×
                  </motion.span>
                ))}
              </div>
            </motion.div>

            {/* Items */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}
            >
              <h3 className="font-serif text-sm text-gold/80 mb-3">📦 条目 & 坐标</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" value={newItemTitle}
                  onChange={e => setNewItemTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  placeholder="条目名称…"
                  className="input-dark flex-1 py-2 text-sm" />
                <button onClick={addItem}
                  className="btn-gold px-4 text-sm shadow-md shadow-gold/10">添加</button>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {items.map((item, i) => (
                  <motion.div key={i} layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-center gap-2 py-2 px-3 rounded-xl"
                    style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.08)' }}>
                    <span className="text-xs text-white/70 w-24 truncate font-serif">{item.title}</span>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-muted/40 shrink-0">X</span>
                      <input type="range" min="-100" max="100" value={item.x * 100}
                        onChange={e => updateItemPos(i, 'x', Number(e.target.value) / 100)}
                        className="flex-1 h-1 accent-gold" />
                      <span className="text-[10px] text-muted/50 w-8 text-right">{item.x.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-muted/40 shrink-0">Y</span>
                      <input type="range" min="-100" max="100" value={item.y * 100}
                        onChange={e => updateItemPos(i, 'y', Number(e.target.value) / 100)}
                        className="flex-1 h-1 accent-gold" />
                      <span className="text-[10px] text-muted/50 w-8 text-right">{item.y.toFixed(1)}</span>
                    </div>
                    <button onClick={() => removeItem(i)}
                      className="text-crimson/40 hover:text-crimson text-xs transition-colors shrink-0">✕</button>
                  </motion.div>
                ))}
                {items.length === 0 && (
                  <p className="text-muted/30 text-xs font-serif italic text-center py-4">添加条目并调整坐标位置…</p>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right: preview + submit */}
          <div className="space-y-4">
            {/* Mini chart preview */}
            <div className="rounded-2xl p-4 sticky top-4"
              style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
              <h3 className="font-serif text-xs text-gold/60 mb-2">预览</h3>
              <MiniQuadrant items={items} />

              {/* Stats */}
              <div className="mt-3 space-y-1 text-[10px] text-muted/50">
                <div className="flex justify-between">
                  <span>候选标签</span>
                  <span className={allCandidatesPreview.length >= 4 ? 'text-green-400' : 'text-crimson'}>{allCandidatesPreview.length}个</span>
                </div>
                <div className="flex justify-between">
                  <span>条目</span>
                  <span className={items.length >= 3 ? 'text-green-400' : 'text-crimson'}>{items.length}个</span>
                </div>
              </div>

              {/* Submit */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleSubmit}
                disabled={!axisX || !axisY || items.length < 3}
                className="btn-gold w-full py-3 text-sm mt-4 disabled:opacity-40 shadow-lg shadow-gold/20"
              >
                🎮 提交题目
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function MiniQuadrant({ items }: { items: Array<{ title: string; x: number; y: number }> }) {
  const size = 220
  const pad = 24
  const cx = size / 2
  const cy = size / 2
  const toX = (v: number) => pad + ((v + 1) / 2) * (size - pad * 2)
  const toY = (v: number) => pad + ((1 - (v + 1) / 2)) * (size - pad * 2)

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`}>
      <rect x={pad} y={pad} width={size - pad * 2} height={size - pad * 2}
        fill="rgba(var(--accent-primary),0.02)" rx="3" stroke="rgba(var(--accent-primary),0.08)" />
      <line x1={pad} y1={cy} x2={size - pad} y2={cy} stroke="rgba(var(--accent-primary),0.12)" />
      <line x1={cx} y1={pad} x2={cx} y2={size - pad} stroke="rgba(var(--accent-primary),0.12)" />
      {items.map((item, i) => (
        <g key={i}>
          <circle cx={toX(item.x)} cy={toY(item.y)} r={8} fill="rgba(var(--glow-color),0.06)" />
          <motion.circle
            cx={toX(item.x)} cy={toY(item.y)} r={4}
            fill="rgba(var(--glow-color),0.9)"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: i * 0.05 }}
          />
          <text x={toX(item.x)} y={toY(item.y) - 8} textAnchor="middle"
            fill="rgba(255,255,255,0.6)" fontSize="7" fontFamily="serif">
            {item.title.length > 6 ? item.title.slice(0, 6) + '…' : item.title}
          </text>
        </g>
      ))}
      {items.length === 0 && (
        <text x={cx} y={cy} textAnchor="middle" fill="rgba(var(--accent-primary),0.2)" fontSize="10" fontFamily="serif">
          空
        </text>
      )}
    </svg>
  )
}
