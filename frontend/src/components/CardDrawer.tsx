import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Play, Pause, Layers, Copy, Pencil, Trash2, Plus, Heart, Download } from 'lucide-react'
import { api } from '../api/client'
import type { Card, CardAudio } from '../api/types'
import { Button } from './ui'
import { cardPlaceholderStyle, formatDuration } from './CardTile'
import { Waveform } from './Waveform'
import { extractPeaks } from '../utils/waveform'

interface DrawerState {
  card: Card | null
  audios: CardAudio[]
  deckRefs: number
  loading: boolean
}

/**
 * 牌详情右侧抽屉（V2）：大封面、音频逐条试听（单实例 audio 元素 + 进度）、
 * 播放提示预览、元信息、操作组。数据经 GET /api/cards/{id}（后端可见性门生效）。
 */
export function CardDrawer({ cardId, onClose, onEdit, onDelete, onClone, onAddToDeck, onExport }: {
  cardId: number | null
  onClose: () => void
  onEdit?: (card: Card) => void
  onDelete?: (card: Card) => void
  onClone?: (card: Card) => void
  onAddToDeck?: (card: Card) => void
  onExport?: (card: Card) => void
}) {
  const [state, setState] = useState<DrawerState>({ card: null, audios: [], deckRefs: 0, loading: false })
  const [playingId, setPlayingId] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [peaksMap, setPeaksMap] = useState<Map<number, number[] | null>>(new Map())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /** 按需提取波形峰值（解码失败缓存 null，不再重试——波形是增强展示） */
  const ensurePeaks = async (audio: CardAudio) => {
    if (peaksMap.has(audio.id) || !audio.audio_url) return
    const peaks = await extractPeaks(audio.audio_url)
    setPeaksMap(prev => new Map(prev).set(audio.id, peaks))
  }

  // 打开时拉详情；关闭时停播清态
  useEffect(() => {
    if (cardId === null) return
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    api.cards.get(cardId)
      .then(res => {
        if (cancelled) return
        setState({ card: res.card, audios: res.audios ?? [], deckRefs: res.deck_refs ?? 0, loading: false })
        // 首音频波形预热（其余在播放时按需解码）
        if (res.audios?.[0]) void ensurePeaks(res.audios[0])
      })
      .catch(() => {
        if (!cancelled) setState({ card: null, audios: [], deckRefs: 0, loading: false })
      })
    return () => {
      cancelled = true
      audioRef.current?.pause()
    }
  }, [cardId])

  // Esc 关闭
  useEffect(() => {
    if (cardId === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cardId, onClose])

  const togglePlay = (audio: CardAudio) => {
    const el = audioRef.current
    if (!el) return
    void ensurePeaks(audio)
    if (playingId === audio.id) {
      el.pause()
      setPlayingId(null)
      return
    }
    el.src = audio.audio_url ?? ''
    el.currentTime = 0
    void el.play().then(() => setPlayingId(audio.id)).catch(() => setPlayingId(null))
  }

  /** 点赞开关（本地即时更新；in-flight 守卫防连击导致的开关错乱——
   *  回顾修复：两次快速点击会发两个 toggle，响应乱序时终态不可控） */
  const [likeBusy, setLikeBusy] = useState(false)
  const toggleLike = async () => {
    if (!card || likeBusy) return
    setLikeBusy(true)
    try {
      const res = await api.cards.toggleLike(card.id)
      setState(s => s.card ? { ...s, card: { ...s.card, liked_by_me: res.liked, likes: res.likes } } : s)
    } catch { /* ignore */ }
    finally { setLikeBusy(false) }
  }

  const { card, audios, deckRefs, loading } = state

  return (
    <AnimatePresence>
      {cardId !== null && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-overlay bg-black/50" onClick={onClose} />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 z-modal w-full max-w-md bg-ink-deep border-l border-gold/20 overflow-y-auto">
            {loading || !card ? (
              <div className="p-6 text-center text-muted text-sm">加载中…</div>
            ) : (
              <div className="flex flex-col">
                {/* 封面头 */}
                <div className="relative aspect-[3/4] max-h-72 w-full overflow-hidden"
                  style={card.cover_url ? undefined : cardPlaceholderStyle(card.id)}>
                  {card.cover_url
                    ? <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">
                        <span className="text-6xl font-serif font-bold text-white/70">
                          {(card.display_text || card.series || '牌').trim().charAt(0)}
                        </span>
                      </div>}
                  <button onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
                    <X size={16} />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-10"
                    style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.8))' }}>
                    <h2 className="font-serif text-lg font-bold text-white">{card.display_text || '未命名'}</h2>
                    {card.series && <p className="text-xs text-white/70">{card.series}</p>}
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* 音频试听列表 */}
                  <section>
                    <p className="text-muted text-xs tracking-widest mb-2">音频（{audios.length} 首）</p>
                    <div className="space-y-1.5">
                      {audios.map(a => (
                        <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                          <button onClick={() => togglePlay(a)}
                            className="w-7 h-7 shrink-0 rounded-full bg-gold/90 text-ink-deep flex items-center justify-center">
                            {playingId === a.id ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-body-text/90 truncate">{a.hint_text || `音频 ${a.id}`}</p>
                            {/* 波形（解码成功时）；失败回退细进度条 */}
                            {peaksMap.get(a.id) ? (
                              <div className="mt-1">
                                <Waveform peaks={peaksMap.get(a.id) ?? null} progress={playingId === a.id ? progress : 0} />
                              </div>
                            ) : playingId === a.id ? (
                              <div className="h-0.5 mt-1 rounded bg-white/10 overflow-hidden">
                                <div className="h-full bg-gold" style={{ width: `${progress * 100}%` }} />
                              </div>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-muted tabular-nums">{formatDuration(a.duration_sec ?? 0)}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* 播放提示预览 */}
                  {audios.some(a => a.hint_text) && (
                    <section>
                      <p className="text-muted text-xs tracking-widest mb-1">播放提示</p>
                      <p className="text-xs text-body-text/80 font-serif italic">
                        「{audios.find(a => a.hint_text)?.hint_text}」
                      </p>
                    </section>
                  )}

                  {/* 元信息 + 点赞 */}
                  <section className="flex flex-wrap items-center gap-2 text-[10px]">
                    {card.tags && card.tags.split(',').filter(Boolean).map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-gold/90">{t.trim()}</span>
                    ))}
                    <span className="flex items-center gap-1 text-muted"><Layers size={10} />被 {deckRefs} 个牌组使用</span>
                    <button onClick={() => void toggleLike()} disabled={likeBusy}
                      className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all disabled:opacity-50 ${
                        card.liked_by_me
                          ? 'bg-crimson/15 border-crimson/40 text-crimson'
                          : 'bg-white/5 border-white/10 text-muted hover:text-crimson hover:border-crimson/30'}`}>
                      <Heart size={12} fill={card.liked_by_me ? 'currentColor' : 'none'} />
                      <span className="tabular-nums text-xs">{card.likes ?? 0}</span>
                    </button>
                  </section>

                  {/* 操作组 */}
                  <section className="flex flex-wrap gap-2 pt-2 border-t border-gold/10">
                    {onAddToDeck && <Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => onAddToDeck(card)}>加入牌组</Button>}
                    {onExport && <Button size="sm" variant="outline" icon={<Download size={13} />} onClick={() => onExport(card)}>导出</Button>}
                    {onEdit && <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => onEdit(card)}>编辑</Button>}
                    {onClone && <Button size="sm" variant="ghost" icon={<Copy size={13} />} onClick={() => onClone(card)}>复制</Button>}
                    {onDelete && <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => onDelete(card)}>删除</Button>}
                  </section>
                </div>
              </div>
            )}
            {/* 单实例音频元素：timeupdate 驱动进度条，ended 复位 */}
            <audio ref={audioRef} className="hidden"
              onTimeUpdate={e => {
                const el = e.currentTarget
                if (el.duration) setProgress(el.currentTime / el.duration)
              }}
              onEnded={() => { setPlayingId(null); setProgress(0) }} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
