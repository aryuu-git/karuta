import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../../components/Layout'
import { quadrantApi, type QBank, type QItem, type QLabel, type QQuestion } from '../../api/quadrant'

interface BangumiResult {
  id: number
  name: string
  name_cn: string
  image: string
  summary: string
  tags: Array<{ name: string; count: number }>
}

export function QuadrantBankEdit() {
  const { id } = useParams<{ id: string }>()
  const bankId = Number(id)
  const navigate = useNavigate()

  const [bank, setBank] = useState<QBank | null>(null)
  const [items, setItems] = useState<QItem[]>([])
  const [labels, setLabels] = useState<QLabel[]>([])
  const [questions, setQuestions] = useState<QQuestion[]>([])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newLabelName, setNewLabelName] = useState('')

  // Bangumi search
  const [bgmSearch, setBgmSearch] = useState('')
  const [bgmResults, setBgmResults] = useState<BangumiResult[]>([])
  const [bgmLoading, setBgmLoading] = useState(false)
  const bgmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Question builder
  const [showQBuilder, setShowQBuilder] = useState(false)
  const [qAxisX, setQAxisX] = useState(0)
  const [qAxisY, setQAxisY] = useState(0)
  const [qCandidates, setQCandidates] = useState<number[]>([])
  const [qPlacements, setQPlacements] = useState<Array<{ item_id: number; x: number; y: number }>>([])

  useEffect(() => {
    quadrantApi.banks.get(bankId).then(setBank).catch(() => navigate('/quadrant/banks'))
    loadContent()
  }, [bankId, navigate])

  const loadContent = () => {
    quadrantApi.items.list(bankId).then(setItems)
    quadrantApi.labels.list(bankId).then(setLabels)
    quadrantApi.questions.list(bankId).then(setQuestions)
  }

  // Debounced Bangumi search
  const doBgmSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) { setBgmResults([]); return }
    setBgmLoading(true)
    try {
      const token = localStorage.getItem('karuta_token')
      const res = await fetch(`/api/bangumi/search?keyword=${encodeURIComponent(keyword)}&type=2`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) { setBgmResults([]); return }
      const data = await res.json()
      const results = (data.data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        name_cn: r.name_cn || r.name,
        image: r.images?.medium || r.images?.common || '',
        summary: r.summary || '',
        tags: (r.tags || []).slice(0, 10),
      }))
      setBgmResults(results)
    } catch {
      setBgmResults([])
    } finally {
      setBgmLoading(false)
    }
  }, [])

  const onBgmSearchChange = (v: string) => {
    setBgmSearch(v)
    if (bgmTimer.current) clearTimeout(bgmTimer.current)
    bgmTimer.current = setTimeout(() => doBgmSearch(v), 500)
  }

  const addFromBangumi = async (r: BangumiResult) => {
    const title = r.name_cn || r.name
    const item = await quadrantApi.items.create(bankId, {
      title,
      image_url: r.image ? `/api/bangumi/image?url=${encodeURIComponent(r.image)}` : '',
      source: 'bangumi',
      source_id: String(r.id),
    })
    setItems(prev => [...prev, item])

    // Auto-add tags as labels
    for (const tag of r.tags.slice(0, 8)) {
      const label = await quadrantApi.labels.create(bankId, tag.name)
      setLabels(prev => prev.find(l => l.name === tag.name) ? prev : [...prev, label])
    }
    setBgmSearch('')
    setBgmResults([])
  }

  const addItem = async () => {
    if (!newItemTitle.trim()) return
    const item = await quadrantApi.items.create(bankId, { title: newItemTitle.trim() })
    setItems(prev => [...prev, item])
    setNewItemTitle('')
  }

  const addLabel = async () => {
    if (!newLabelName.trim()) return
    const label = await quadrantApi.labels.create(bankId, newLabelName.trim())
    setLabels(prev => prev.find(l => l.name === newLabelName.trim()) ? prev : [...prev, label])
    setNewLabelName('')
  }

  const deleteItem = async (itemId: number) => {
    await quadrantApi.items.delete(itemId)
    setItems(items.filter(i => i.id !== itemId))
  }

  const deleteLabel = async (labelId: number) => {
    await quadrantApi.labels.delete(labelId)
    setLabels(labels.filter(l => l.id !== labelId))
  }

  const toggleCandidate = (labelId: number) => {
    setQCandidates(prev => prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId])
  }

  const updatePlacement = (itemId: number, axis: 'x' | 'y', value: number) => {
    setQPlacements(prev => {
      const existing = prev.find(p => p.item_id === itemId)
      if (existing) {
        return prev.map(p => p.item_id === itemId ? { ...p, [axis]: value } : p)
      }
      return [...prev, { item_id: itemId, x: axis === 'x' ? value : 0, y: axis === 'y' ? value : 0 }]
    })
  }

  const saveQuestion = async () => {
    if (!qAxisX || !qAxisY || qCandidates.length < 4 || qPlacements.length < 3) {
      alert('需要: 选2个轴标签, 至少4个候选, 至少3个条目坐标')
      return
    }
    const allCandidates = [...new Set([qAxisX, qAxisY, ...qCandidates])]
    await quadrantApi.questions.create(bankId, {
      axis_x_label_id: qAxisX,
      axis_y_label_id: qAxisY,
      score_source: 'manual',
      candidate_ids: allCandidates,
      placements: qPlacements,
    })
    setShowQBuilder(false)
    setQAxisX(0)
    setQAxisY(0)
    setQCandidates([])
    setQPlacements([])
    loadContent()
  }

  if (!bank) return <Layout><div className="text-center py-20 text-white/50">Loading...</div></Layout>

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-serif text-xl text-gold font-bold">{bank.name}</h1>
          <button onClick={() => navigate('/quadrant/banks')}
            className="text-xs text-muted/50 hover:text-gold transition-colors font-serif">
            ← 返回题库列表
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: Items + Bangumi */}
          <div className="space-y-4">
            {/* Bangumi Search */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
              <h3 className="font-serif text-sm text-gold/80 mb-2">🔍 Bangumi 搜索导入</h3>
              <p className="text-muted/40 text-xs mb-3 font-serif italic">搜索并导入作品，自动拉取标签 ✧</p>
              <input type="text" value={bgmSearch}
                onChange={e => onBgmSearchChange(e.target.value)}
                placeholder="输入作品名…"
                className="input-dark w-full py-2.5 text-sm" />
              {bgmLoading && <p className="text-muted/40 text-xs mt-2 font-serif italic">搜索中…</p>}
              <AnimatePresence>
                {bgmResults.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    className="mt-2 max-h-64 overflow-y-auto space-y-1.5 pr-1">
                    {bgmResults.map(r => (
                      <motion.div key={r.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.01, x: 3 }}
                        className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
                        style={{ background: 'rgba(var(--accent-primary),0.04)', border: '1px solid rgba(var(--accent-primary),0.06)' }}
                        onClick={() => addFromBangumi(r)}>
                        {r.image && (
                          <img src={`/api/bangumi/image?url=${encodeURIComponent(r.image)}`}
                            alt="" className="w-10 h-14 object-cover rounded" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white/80 font-serif truncate">{r.name_cn || r.name}</p>
                          {r.name_cn && r.name !== r.name_cn && (
                            <p className="text-[10px] text-muted/40 truncate">{r.name}</p>
                          )}
                          {r.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {r.tags.slice(0, 5).map(t => (
                                <span key={t.name} className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-muted/50">
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-gold/50 text-xs">+导入</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* Manual Add + Items */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
              <h3 className="font-serif text-sm text-gold/80 mb-3">📦 条目列表 ({items.length})</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" value={newItemTitle} onChange={e => setNewItemTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  placeholder="手动添加条目…"
                  className="input-dark flex-1 py-2 text-sm" />
                <button onClick={addItem} className="btn-gold px-4 text-sm shadow-md shadow-gold/10">+</button>
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                {items.map(item => (
                  <motion.div key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-2">
                      {item.image_url && (
                        <img src={item.image_url} alt="" className="w-6 h-8 object-cover rounded" />
                      )}
                      <span className="text-xs text-white/70 font-serif">{item.title}</span>
                      {item.source === 'bangumi' && (
                        <span className="text-[9px] text-muted/40">bgm:{item.source_id}</span>
                      )}
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-crimson/40 hover:text-crimson text-xs transition-colors">✕</button>
                  </motion.div>
                ))}
                {items.length === 0 && (
                  <p className="text-muted/30 text-xs font-serif italic text-center py-4">还没有条目，从上方搜索导入或手动添加</p>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right: Labels + Questions */}
          <div className="space-y-4">
            {/* Labels */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
              <h3 className="font-serif text-sm text-gold/80 mb-3">🏷 标签池 ({labels.length})</h3>
              <div className="flex gap-2 mb-3">
                <input type="text" value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addLabel()}
                  placeholder="手动添加标签…"
                  className="input-dark flex-1 py-2 text-sm" />
                <button onClick={addLabel} className="btn-gold px-4 text-sm shadow-md shadow-gold/10">+</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {labels.map(label => (
                  <motion.span key={label.id} layout
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-xs px-2.5 py-1 rounded-full border border-white/15 text-white/70 cursor-pointer hover:border-crimson/50 hover:text-crimson/80 transition-colors font-serif"
                    onClick={() => deleteLabel(label.id)}>
                    {label.name} ×
                  </motion.span>
                ))}
              </div>
            </motion.div>

            {/* Questions */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-2xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.3), rgba(var(--accent-bg-mid),0.7))', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-sm text-gold/80">📝 题目 ({questions.length})</h3>
                <button onClick={() => setShowQBuilder(!showQBuilder)}
                  className="text-xs px-3 py-1.5 font-serif text-gold/70 border border-gold/20 rounded-lg hover:border-gold/40 hover:text-gold transition-colors">
                  {showQBuilder ? '收起' : '+ 新建题目'}
                </button>
              </div>

              <AnimatePresence>
                {showQBuilder && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl p-4 mb-4"
                    style={{ background: 'rgba(var(--glow-color),0.03)', border: '1px solid rgba(var(--glow-color),0.1)' }}>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-[10px] text-muted/50 uppercase tracking-wider">X轴答案</label>
                        <select value={qAxisX} onChange={e => setQAxisX(Number(e.target.value))}
                          className="input-dark w-full py-2 text-xs mt-1">
                          <option value={0}>选择标签…</option>
                          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted/50 uppercase tracking-wider">Y轴答案</label>
                        <select value={qAxisY} onChange={e => setQAxisY(Number(e.target.value))}
                          className="input-dark w-full py-2 text-xs mt-1">
                          <option value={0}>选择标签…</option>
                          {labels.filter(l => l.id !== qAxisX).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-[10px] text-muted/50 uppercase tracking-wider">候选标签 (点击选中)</label>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {labels.map(l => (
                          <span key={l.id} onClick={() => toggleCandidate(l.id)}
                            className={`text-xs px-2.5 py-1 rounded-full border cursor-pointer font-serif transition-all ${
                              qCandidates.includes(l.id) || l.id === qAxisX || l.id === qAxisY
                                ? 'border-gold/50 text-gold bg-gold/10'
                                : 'border-white/15 text-white/50 hover:border-white/30'
                            }`}>
                            {l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-[10px] text-muted/50 uppercase tracking-wider">条目坐标 (拖拽滑块)</label>
                      <div className="space-y-2 mt-2 max-h-40 overflow-y-auto pr-1">
                        {items.map(item => {
                          const p = qPlacements.find(pl => pl.item_id === item.id)
                          return (
                            <div key={item.id} className="flex items-center gap-2 text-xs">
                              <span className="w-24 truncate text-white/60 font-serif">{item.title}</span>
                              <span className="text-muted/40">X:</span>
                              <input type="range" min="-100" max="100" value={(p?.x ?? 0) * 100}
                                onChange={e => updatePlacement(item.id, 'x', Number(e.target.value) / 100)}
                                className="flex-1 h-1 accent-gold" />
                              <span className="text-muted/40">Y:</span>
                              <input type="range" min="-100" max="100" value={(p?.y ?? 0) * 100}
                                onChange={e => updatePlacement(item.id, 'y', Number(e.target.value) / 100)}
                                className="flex-1 h-1 accent-gold" />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={saveQuestion}
                      className="btn-gold w-full py-2.5 text-xs shadow-lg shadow-gold/10">
                      保存题目
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-1">
                {questions.map(q => (
                  <div key={q.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                    <span className="text-xs text-white/60 font-serif">题目 #{q.id} · {q.score_source}</span>
                    <button onClick={() => quadrantApi.questions.delete(q.id).then(loadContent)}
                      className="text-crimson/40 hover:text-crimson text-xs transition-colors">删除</button>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
