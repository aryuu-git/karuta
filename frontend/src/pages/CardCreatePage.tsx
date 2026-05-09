import { useState, useEffect, useRef, useCallback, type FormEvent, type ChangeEvent, type DragEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Card, CardAudio } from '../api/types'
import { AudioUploadOptions } from '../components/AudioUploadOptions'
import { processAudio, type ProcessOptions } from '../utils/audioProcessor'
import { useAuth } from '../hooks/useAuth'

const DEFAULT_TAGS = ['游戏', '动画']

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CardCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = !!id
  const cardId = parseInt(id ?? '0', 10)

  // Form state
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [displayText, setDisplayText] = useState('')
  const [series, setSeries] = useState('')
  const [tags, setTags] = useState('')
  const [hintText, setHintText] = useState('')
  const [isShared, setIsShared] = useState(true)

  // Audio processing
  const [audioOptions, setAudioOptions] = useState<ProcessOptions>({ compress: false, trim: 'none' })
  const [processing, setProcessing] = useState(false)
  const [processProgress, setProcessProgress] = useState(0)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Custom tag dialog
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [customTags, setCustomTags] = useState<string[]>([])

  // Edit mode state
  const [card, setCard] = useState<Card | null>(null)
  const [audios, setAudios] = useState<CardAudio[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addingAudio, setAddingAudio] = useState(false)

  // Drag state
  const [dragOverCover, setDragOverCover] = useState(false)
  const [dragOverAudio, setDragOverAudio] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const newAudioInputRef = useRef<HTMLInputElement>(null)

  // Audio preview
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  // New audio for edit mode
  const [newAudioFile, setNewAudioFile] = useState<File | null>(null)
  const [newHintText, setNewHintText] = useState('')
  const [newAudioOptions, setNewAudioOptions] = useState<ProcessOptions>({ compress: false, trim: 'none' })
  const [newProcessing, setNewProcessing] = useState(false)
  const [newProcessProgress, setNewProcessProgress] = useState(0)

  // Delete audio confirm
  const [deleteAudioId, setDeleteAudioId] = useState<number | null>(null)
  const [deletingAudio, setDeletingAudio] = useState(false)

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (isEdit && cardId) {
      loadCard()
    }
  }, [cardId])

  const loadCard = async () => {
    setLoading(true)
    try {
      const data = await api.cards.get(cardId)
      setCard(data.card)
      setAudios(data.audios ?? [])
      setDisplayText(data.card.display_text || '')
      setSeries(data.card.series || '')
      setTags(data.card.tags || '')
      const existingTags = (data.card.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean)
      setCustomTags(existingTags.filter((t: string) => !DEFAULT_TAGS.includes(t)))
      setIsShared(data.card.is_shared)
      if (data.card.cover_url) {
        setCoverPreview(data.card.cover_url)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const handleCoverChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : coverPreview)
  }

  const handleCoverDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOverCover(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('image/')) return
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }, [])

  const handleAudioDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragOverAudio(false)
    const file = e.dataTransfer.files[0]
    if (!file || !file.type.startsWith('audio/')) return
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('音频文件超过 20MB 啦！(>_<)')
      return
    }
    setAudioFile(file)
  }, [])

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!audioFile || !coverFile) return
    setUploading(true)
    setUploadError(null)
    try {
      // Process audio
      let finalAudio: File = audioFile
      if (audioOptions.compress || audioOptions.trim !== 'none') {
        setProcessing(true)
        setProcessProgress(0)
        try {
          finalAudio = await processAudio(audioFile, audioOptions, setProcessProgress)
        } catch { /* fallback to original */ }
        finally { setProcessing(false) }
      }

      const formData = new FormData()
      formData.append('audio', finalAudio)
      formData.append('cover', coverFile)
      formData.append('display_text', displayText.trim() || '—')
      formData.append('series', series.trim())
      formData.append('tags', tags.trim())
      formData.append('is_shared', String(isShared))
      if (hintText.trim()) formData.append('hint_text', hintText.trim())

      await api.cards.create(formData)
      navigate('/cards')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败了 (>_<)')
    } finally {
      setUploading(false)
      setProcessing(false)
    }
  }

  const handleSave = async () => {
    if (!isEdit) return
    setSaving(true)
    try {
      await api.cards.update(cardId, {
        display_text: displayText.trim(),
        series: series.trim(),
        tags: tags.trim(),
        is_shared: isShared,
      })
      navigate('/cards')
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  const handleAddAudio = async () => {
    if (!newAudioFile) return
    setAddingAudio(true)
    try {
      let finalAudio: File = newAudioFile
      if (newAudioOptions.compress || newAudioOptions.trim !== 'none') {
        setNewProcessing(true)
        setNewProcessProgress(0)
        try {
          finalAudio = await processAudio(newAudioFile, newAudioOptions, setNewProcessProgress)
        } catch { /* fallback */ }
        finally { setNewProcessing(false) }
      }

      const formData = new FormData()
      formData.append('audio', finalAudio)
      if (newHintText.trim()) formData.append('hint_text', newHintText.trim())

      const newAudio = await api.cards.addAudio(cardId, formData)
      setAudios(prev => [...prev, newAudio])
      setNewAudioFile(null)
      setNewHintText('')
      setNewAudioOptions({ compress: false, trim: 'none' })
      if (newAudioInputRef.current) newAudioInputRef.current.value = ''
    } catch { /* ignore */ }
    finally { setAddingAudio(false); setNewProcessing(false) }
  }

  const handleDeleteAudio = async (audioId: number) => {
    if (audios.length <= 1) {
      setDeleteAudioId(null)
      return
    }
    setDeletingAudio(true)
    try {
      await api.cards.deleteAudio(cardId, audioId)
      setAudios(prev => prev.filter(a => a.id !== audioId))
      setDeleteAudioId(null)
    } catch { /* ignore */ }
    finally { setDeletingAudio(false) }
  }

  const togglePlay = (audio: CardAudio) => {
    if (playingAudioId === audio.id) {
      previewAudioRef.current?.pause()
      setPlayingAudioId(null)
      return
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    const el = new Audio(audio.audio_url)
    el.onended = () => setPlayingAudioId(null)
    el.onerror = () => setPlayingAudioId(null)
    el.play()
    previewAudioRef.current = el
    setPlayingAudioId(audio.id)
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-pink-300/50 animate-pulse font-serif text-xl text-center py-24">
            ～ 解封歌牌中 ～ ♪
          </div>
        </div>
      </Layout>
    )
  }

  const isOwner = !isEdit || !!(card && user && card.owner_id === user.id)

  // Read-only view for non-owners in edit mode
  if (isEdit && card && !isOwner) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="relative mb-6 overflow-hidden rounded-2xl p-5"
            style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
            <div className="flex items-center gap-3 relative">
              <button onClick={() => navigate('/cards')}
                className="text-pink-300/50 hover:text-gold transition-all text-sm shrink-0 hover:scale-110">
                ← 撤退
              </button>
              <h1 className="font-serif text-xl text-gold font-bold tracking-wide">
                🎴 {card.display_text || '未命名'}
              </h1>
            </div>
          </div>
          <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5) 0%, rgba(var(--accent-bg-mid),0.8) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
            <div className="flex gap-5">
              {coverPreview && (
                <img src={coverPreview} alt="" className="w-24 rounded-lg object-cover shrink-0" style={{ aspectRatio: '3/4' }} />
              )}
              <div className="flex-1 space-y-2">
                <p className="text-white/90 text-sm font-medium">{card.display_text}</p>
                {card.series && <p className="text-muted text-xs">📺 {card.series}</p>}
                {card.tags && (
                  <div className="flex gap-1 flex-wrap">
                    {card.tags.split(',').filter(Boolean).map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 text-gold/60 border border-gold/20">{t.trim()}</span>
                    ))}
                  </div>
                )}
                <p className="text-pink-300/40 text-xs font-serif">by {card.owner_name || '未知'}</p>
              </div>
            </div>
            {audios.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <h3 className="text-gold/70 text-xs mb-2 font-serif">♪ 歌曲 ({audios.length})</h3>
                <div className="space-y-1.5">
                  {audios.map(a => (
                    <div key={a.id} className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
                      <button onClick={() => togglePlay(a)}
                        className="text-gold/60 hover:text-gold text-sm transition-all shrink-0">
                        {playingAudioId === a.id ? '⏸' : '▶'}
                      </button>
                      <span className="text-xs text-white/60 truncate flex-1">{a.hint_text || `歌曲 ${a.sort_order + 1}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header with decorative gradient */}
        <div className="relative mb-6 overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgba(var(--accent-bg),0.4) 0%, rgba(var(--accent-bg-mid),0.8) 50%, rgba(var(--accent-bg-end),0.4) 100%)', border: '1px solid rgba(var(--accent-primary),0.15)' }}>
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(var(--glow-color),0.8), transparent 70%)' }} />
          <div className="flex items-center gap-3 relative">
            <button onClick={() => navigate('/cards')}
              className="text-pink-300/50 hover:text-gold transition-all duration-200 text-sm shrink-0 hover:scale-110">
              ← 撤退
            </button>
            <div>
              <h1 className="font-serif text-xl text-gold font-bold tracking-wide">
                {isEdit ? `✏️ 铭刻之牌${card ? ` · ${card.display_text}` : ''}` : '✨ 召唤新牌'}
              </h1>
              <p className="text-pink-300/60 text-xs mt-0.5 font-serif italic">
                {isEdit ? '重新刻印这张命运之牌 ♪' : '将新的命运之牌注入此世 ✧'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(180deg, rgba(var(--accent-bg-end),0.5) 0%, rgba(var(--accent-bg-mid),0.8) 100%)', border: '1px solid rgba(var(--accent-primary),0.12)' }}>
          <form onSubmit={isEdit ? (e) => { e.preventDefault(); handleSave() } : handleCreate} className="flex flex-col gap-5">

            {/* Cover image */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5">🖼️ 封面图片 *</label>
                <div className="flex items-start gap-4">
                  <div
                    className="w-24 border border-dashed rounded-lg overflow-hidden cursor-pointer transition-all duration-200 shrink-0"
                    style={{
                      aspectRatio: '3/4',
                      borderColor: dragOverCover ? 'rgba(var(--accent-primary),0.8)' : 'rgba(var(--accent-bg),0.8)',
                      boxShadow: dragOverCover ? '0 0 16px rgba(var(--accent-primary),0.3)' : 'none',
                      background: dragOverCover ? 'rgba(var(--accent-primary),0.05)' : 'var(--color-ink-deep)',
                    }}
                    onClick={() => coverInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOverCover(true) }}
                    onDragLeave={() => setDragOverCover(false)}
                    onDrop={handleCoverDrop}>
                    {coverPreview ? (
                      <img src={coverPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted">
                        <span className="text-lg">{dragOverCover ? '✨' : '🖼️'}</span>
                        <span className="text-[10px]">点击上传</span>
                      </div>
                    )}
                  </div>
                  <div className="text-muted text-xs pt-2">
                    <p>jpg / png / webp</p>
                    <p className="text-muted/40 mt-0.5">≤ 5MB · 建议 3:4 比例</p>
                  </div>
                </div>
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
              </div>
            )}

            {/* Edit mode: show existing cover (small) */}
            {isEdit && coverPreview && (
              <div>
                <label className="text-muted text-xs block mb-1.5">🖼️ 封面</label>
                <img src={coverPreview} alt="cover" className="w-24 rounded-lg object-cover" style={{ aspectRatio: '3/4' }} />
              </div>
            )}

            {/* Audio file (create mode only) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5">🎵 音频文件 *</label>
                <div
                  className="border border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 text-center"
                  style={{
                    borderColor: dragOverAudio ? 'rgba(var(--accent-primary),0.8)' : 'rgba(var(--accent-bg),0.8)',
                    boxShadow: dragOverAudio ? '0 0 16px rgba(var(--accent-primary),0.3)' : 'none',
                    background: dragOverAudio ? 'rgba(var(--accent-primary),0.05)' : 'transparent',
                  }}
                  onClick={() => audioInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOverAudio(true) }}
                  onDragLeave={() => setDragOverAudio(false)}
                  onDrop={handleAudioDrop}>
                  {audioFile ? (
                    <div className="text-xs">
                      <div className="text-gold font-medium truncate">{audioFile.name}</div>
                      <div className="text-muted mt-0.5">{formatBytes(audioFile.size)} · 准备就绪 ✓</div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted">
                      <span className="text-xl">{dragOverAudio ? '✨' : '🎵'}</span>
                      <span className="text-xs">{dragOverAudio ? '松开即可上传！' : '点击或拖拽音频'}</span>
                      <span className="text-xs text-muted/40">mp3 / wav / flac 等 · ≤20MB</span>
                    </div>
                  )}
                </div>
                <input ref={audioInputRef} type="file" accept="audio/*" className="hidden"
                  onChange={e => setAudioFile(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {/* Audio processing options (create mode only) */}
            {!isEdit && (
              <AudioUploadOptions
                audioFile={audioFile}
                onChange={setAudioOptions}
                processing={processing}
                progress={processProgress}
              />
            )}

            {/* Display text */}
            <div>
              <label className="text-muted text-xs block mb-1.5">🎼 牌名（歌曲名） *</label>
              <input type="text" value={displayText} onChange={e => setDisplayText(e.target.value)}
                className="input-dark text-sm" placeholder="例：春晓" required />
            </div>

            {/* Series */}
            <div>
              <label className="text-muted text-xs block mb-1.5">📺 作品名（选填）</label>
              <input type="text" value={series} onChange={e => setSeries(e.target.value)}
                className="input-dark text-sm" placeholder="例：Fate/stay night" />
            </div>

            {/* Tags */}
            <div>
              <label className="text-muted text-xs block mb-1.5">🏷️ 标签（选填）</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(() => {
                  const selectedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
                  const allTags = [...new Set([...DEFAULT_TAGS, ...customTags, ...selectedTags])]
                  return allTags.map(tag => {
                    const isSelected = selectedTags.includes(tag)
                    return (
                      <button key={tag} type="button"
                        onClick={() => {
                          if (isSelected) {
                            setTags(selectedTags.filter(t => t !== tag).join(','))
                          } else {
                            setTags([...selectedTags, tag].join(','))
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded-md transition-all ${
                          isSelected
                            ? 'bg-gold/20 text-gold border border-gold/40'
                            : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
                        }`}>
                        {tag}
                      </button>
                    )
                  })
                })()}
                <button type="button"
                  onClick={() => { setNewTagInput(''); setShowTagDialog(true) }}
                  className="text-xs px-2.5 py-1 rounded-md bg-white/5 text-muted border border-dashed border-white/10 hover:border-gold/30 hover:text-gold/70 transition-all">
                  + 自定义
                </button>
              </div>
            </div>

            {/* Hint text (create mode only) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5">
                  📜 播放提示
                  <span className="text-muted/50 ml-1">（选填，播放时显示的上句提示）</span>
                </label>
                <input type="text" value={hintText} onChange={e => setHintText(e.target.value)}
                  className="input-dark text-sm" placeholder="播放时显示在读牌区的提示文字" />
              </div>
            )}

            {/* Is shared (only owner can toggle) */}
            {(!isEdit || (card && user && card.owner_id === user.id)) && (
              <div
                onClick={() => setIsShared(!isShared)}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                  isShared
                    ? 'border border-green-500/30 bg-green-500/5'
                    : 'border border-white/10 bg-white/5 hover:border-white/20'
                }`}>
                <div className={`w-9 h-5 rounded-full transition-all duration-200 relative ${
                  isShared ? 'bg-green-500/50' : 'bg-white/10'
                }`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
                    isShared ? 'left-[18px] bg-green-400' : 'left-0.5 bg-white/40'
                  }`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isShared ? 'text-green-300/90' : 'text-white/50'}`}>
                    {isShared ? '🌐 公开共享中' : '🔒 仅自己可见'}
                  </p>
                  <p className="text-[10px] text-muted/50">
                    {isShared ? '其他玩家可在公共牌库中找到此牌' : '牌不会出现在公共牌库'}
                  </p>
                </div>
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-crimson text-xs bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                😣 {uploadError}
              </motion.p>
            )}

            {/* Submit button */}
            <button type="submit"
              disabled={uploading || processing || (!isEdit && (!audioFile || !coverFile))}
              className="btn-gold w-full disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]">
              {processing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-ink/50 border-t-ink rounded-full animate-spin" />
                  处理音频中…
                </span>
              ) : uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3 h-3 border-2 border-ink/50 border-t-ink rounded-full animate-spin" />
                  上传中… (｡･ω･｡)
                </span>
              ) : saving ? (
                '保存中…'
              ) : isEdit ? (
                '✓ 保存修改'
              ) : (
                '✨ 上传新牌！'
              )}
            </button>
          </form>
        </div>

        {/* Edit mode: Audio list */}
        {isEdit && (
          <div className="mt-8">
            <h2 className="text-gold text-sm font-medium mb-3">🎵 音频列表 ({audios.length} 条)</h2>
            <div className="space-y-2">
              <AnimatePresence>
                {audios.map((audio, i) => (
                  <motion.div key={audio.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 group hover:border-gold/20 transition-colors">
                    <button onClick={() => togglePlay(audio)}
                      className="text-gold/60 hover:text-gold text-sm px-2 py-1 rounded hover:bg-gold/10 transition-all shrink-0"
                      title={playingAudioId === audio.id ? '暂停' : '播放'}>
                      {playingAudioId === audio.id ? '⏸' : '▶'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/80 text-sm truncate">
                        音频 #{audio.sort_order + 1}
                      </p>
                      <input
                        type="text"
                        defaultValue={audio.hint_text || ''}
                        placeholder="输入提示文字（如歌名/上句）…"
                        className="text-muted text-xs mt-0.5 bg-transparent border-b border-transparent hover:border-border focus:border-gold focus:text-white/80 outline-none w-full transition-all"
                        onBlur={async (e) => {
                          const newHint = e.target.value.trim()
                          if (newHint !== (audio.hint_text || '')) {
                            try {
                              await api.cards.updateAudioHint(cardId, audio.id, newHint)
                              setAudios(prev => prev.map(a => a.id === audio.id ? { ...a, hint_text: newHint } : a))
                            } catch { /* ignore */ }
                          }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </div>
                    <button onClick={() => setDeleteAudioId(audio.id)}
                      disabled={audios.length <= 1}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-crimson text-xs px-2 py-1 rounded hover:bg-crimson/10 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={audios.length <= 1 ? '至少保留 1 条音频' : '删除'}>
                      删除
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Add new audio (edit mode) */}
            <div className="mt-4 bg-surface border border-border rounded-xl p-4">
              <h3 className="text-gold/80 text-xs font-medium mb-3">➕ 添加新音频</h3>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <button type="button" onClick={() => newAudioInputRef.current?.click()}
                    className="btn-outline text-xs flex-1">
                    {newAudioFile ? `✓ ${newAudioFile.name}` : '🎵 选择音频文件'}
                  </button>
                  <input ref={newAudioInputRef} type="file" accept="audio/*" className="hidden"
                    onChange={e => setNewAudioFile(e.target.files?.[0] ?? null)} />
                </div>
                {newAudioFile && (
                  <>
                    <AudioUploadOptions
                      audioFile={newAudioFile}
                      onChange={setNewAudioOptions}
                      processing={newProcessing}
                      progress={newProcessProgress}
                    />
                    <input type="text" value={newHintText} onChange={e => setNewHintText(e.target.value)}
                      className="input-dark text-sm" placeholder="播放提示（选填）" />
                    <button type="button" onClick={handleAddAudio}
                      disabled={addingAudio || newProcessing}
                      className="btn-gold text-sm disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]">
                      {addingAudio ? '添加中…' : '➕ 添加音频'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete audio confirm */}
      <AnimatePresence>
        {deleteAudioId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.7)' }}
            onClick={() => setDeleteAudioId(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-3xl mb-3">🗑️</div>
              <p className="text-white font-medium mb-1">要删除这条音频吗？</p>
              <p className="text-muted text-sm mb-5">删掉后无法恢复哦 (；′⌒`)</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteAudioId(null)} className="btn-outline flex-1 text-sm">取消</button>
                <button onClick={() => handleDeleteAudio(deleteAudioId)}
                  disabled={deletingAudio}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light text-white font-medium text-sm transition-all disabled:opacity-50">
                  {deletingAudio ? '删除中…' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom tag dialog */}
      <AnimatePresence>
        {showTagDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowTagDialog(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs rounded-2xl p-5"
              style={{ background: 'linear-gradient(160deg, var(--color-ink), var(--color-ink-deep))', border: '1px solid rgba(var(--accent-primary),0.2)' }}
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif text-gold text-base mb-1">✦ 自定义标签</h3>
              <p className="text-pink-300/40 text-xs mb-4 font-serif">为歌牌赋予独特属性吧～</p>
              <input
                type="text"
                value={newTagInput}
                onChange={e => setNewTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTagInput.trim()) {
                    const selectedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
                    const nt = newTagInput.trim()
                    if (!selectedTags.includes(nt)) {
                      setTags([...selectedTags, nt].join(','))
                    }
                    if (!DEFAULT_TAGS.includes(nt) && !customTags.includes(nt)) {
                      setCustomTags(prev => [...prev, nt])
                    }
                    setShowTagDialog(false)
                  }
                }}
                className="input-dark w-full text-sm mb-4"
                placeholder="输入标签名…"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => setShowTagDialog(false)}
                  className="btn-outline flex-1 text-sm">取消</button>
                <button
                  onClick={() => {
                    if (newTagInput.trim()) {
                      const selectedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []
                      const nt = newTagInput.trim()
                      if (!selectedTags.includes(nt)) {
                        setTags([...selectedTags, nt].join(','))
                      }
                      if (!DEFAULT_TAGS.includes(nt) && !customTags.includes(nt)) {
                        setCustomTags(prev => [...prev, nt])
                      }
                    }
                    setShowTagDialog(false)
                  }}
                  disabled={!newTagInput.trim()}
                  className="btn-gold flex-1 text-sm disabled:opacity-50">
                  ✦ 添加
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
