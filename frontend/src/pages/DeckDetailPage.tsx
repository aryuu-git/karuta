import { useState, useEffect, useRef, useCallback, type FormEvent, type ChangeEvent, type DragEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Layout } from '../components/Layout'
import { api } from '../api/client'
import type { Card } from '../api/types'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DeckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [deckName, setDeckName] = useState('')
  const [deckDesc, setDeckDesc] = useState('')
  const [deckCardCount, setDeckCardCount] = useState(0)
  const [isPublic, setIsPublic] = useState(false)
  const [togglingShare, setTogglingShare] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 编辑牌组名
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingName, setSavingName] = useState(false)

  // 添加牌表单
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [displayText, setDisplayText] = useState('')   // 歌曲名称（选填，仅牌组清单展示）
  const [hintText, setHintText] = useState('')          // 播放时提示文字（上句，选填）
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [deleteCardId, setDeleteCardId] = useState<number | null>(null)
  const [showDeleteDeck, setShowDeleteDeck] = useState(false)
  const [deletingDeck, setDeletingDeck] = useState(false)
  const [dragOverCover, setDragOverCover] = useState(false)
  const [dragOverAudio, setDragOverAudio] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const deckId = parseInt(id ?? '0', 10)

  useEffect(() => { if (deckId) loadDeck() }, [deckId])

  const loadDeck = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.decks.get(deckId)
      const deck = data.deck
      setDeckName(deck.name)
      setDeckDesc(deck.description ?? '')
      setDeckCardCount(deck.card_count)
      setIsPublic(deck.is_public ?? false)
      setCards(data.cards ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '牌组加载失败了… (；′⌒`)')
    } finally {
      setLoading(false)
    }
  }

  const toggleShare = async () => {
    setTogglingShare(true)
    try {
      const res = await api.decks.share(deckId, !isPublic)
      setIsPublic(res.is_public)
    } catch { }
    finally { setTogglingShare(false) }
  }

  const startEdit = () => {
    setEditName(deckName || '')
    setEditDesc(deckDesc || '')
    setEditingName(true)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    setSavingName(true)
    try {
      const updated = await api.decks.update(deckId, editName.trim(), editDesc.trim())
      if (updated && updated.name) {
        setDeckName(updated.name)
        setDeckDesc(updated.description ?? '')
        setEditingName(false)
      }
    } catch (e) {
      // 保存失败只提示，不退出编辑状态
      alert(e instanceof Error ? e.message : '保存失败，请重试 (；′⌒`)')
    } finally {
      setSavingName(false)
    }
  }

  const handleCoverChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : null)
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

  const handleAddCard = async (e: FormEvent) => {
    e.preventDefault()
    if (!audioFile || !coverFile) return
    setUploading(true)
    setUploadError(null)
    try {
      const formData = new FormData()
      formData.append('audio', audioFile)
      formData.append('cover', coverFile)
      formData.append('display_text', displayText.trim() || '—')
      if (hintText.trim()) formData.append('hint_text', hintText.trim())
      const newCard = await api.decks.createCard(deckId, formData)
      setCards(prev => [...prev, newCard])
      setDeckCardCount(prev => prev + 1)
      setAudioFile(null); setCoverFile(null); setCoverPreview(null)
      setDisplayText(''); setHintText('')
      if (audioInputRef.current) audioInputRef.current.value = ''
      if (coverInputRef.current) coverInputRef.current.value = ''
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteCard = async (cardId: number) => {
    try {
      await api.decks.deleteCard(deckId, cardId)
      setCards(prev => prev.filter(c => c.id !== cardId))
      setDeckCardCount(prev => Math.max(0, prev - 1))
      setDeleteCardId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败啦 (；′⌒`)')
    }
  }

  const handleDeleteDeck = async () => {
    setDeletingDeck(true)
    try {
      await api.decks.delete(deckId)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败啦 (；′⌒`)')
      setShowDeleteDeck(false)
    } finally {
      setDeletingDeck(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <button onClick={() => navigate('/')}
              className="text-muted hover:text-gold transition-all duration-200 text-sm mt-1 shrink-0 hover:scale-110">
              ← 撤退
            </button>

            {loading ? (
              <div className="text-gold animate-pulse font-serif">加载中… (｡･ω･｡)</div>
            ) : (
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-serif text-xl text-gold font-medium truncate">{deckName}</h1>
                  <button onClick={startEdit}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0"
                    style={{ background: 'rgba(232,164,184,0.1)', border: '1px solid rgba(232,164,184,0.3)', color: '#e8a4b8' }}>
                    ✏️ 修改
                  </button>
                  <button onClick={toggleShare} disabled={togglingShare}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 disabled:opacity-50"
                    style={{
                      background: isPublic ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isPublic ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.1)'}`,
                      color: isPublic ? '#4ade80' : 'rgba(255,255,255,0.4)'
                    }}>
                    {isPublic ? '🌐 已共享' : '🔒 私有'}
                  </button>
                </div>
                <p className="text-muted text-xs mt-0.5 truncate">
                  {deckDesc || '（还没有简介哦～）'} · {deckCardCount} 张
                  {isPublic && <span className="text-green-400/60 ml-1">· 其他玩家可使用</span>}
                </p>
              </div>
            )}
          </div>

          {!loading && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => navigate(`/rooms/new?deck_id=${deckId}`)}
                className="btn-gold text-sm transition-all duration-200 hover:scale-105">
                ⚔️ 用这副牌开战！
              </button>
              <button onClick={() => setShowDeleteDeck(true)}
                className="text-xs px-3 py-2 rounded-lg transition-all duration-200 hover:scale-105"
                style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', color: 'rgba(192,57,43,0.8)' }}>
                🗑️ 删除
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="text-crimson text-center py-12">
            {error}
            <button onClick={loadDeck} className="block mx-auto mt-2 text-sm underline hover:text-gold transition-colors">再试一次！(ง •̀_•́)ง</button>
          </div>
        )}

        {!loading && !error && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* 牌列表 */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-muted text-xs tracking-widest">🎵 战斗曲库 ({cards.length} 张)</h2>
              </div>

              {cards.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted">
                  <div className="text-4xl mb-3">🎵</div>
                  <p className="text-gold text-sm font-serif mb-1">牌组还是空的～</p>
                  <p className="text-xs">(｡•̀ᴗ-) 从右边添加音频和封面，打造你的专属牌库！</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {cards.map((card, i) => (
                      <motion.div key={card.id}
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }} transition={{ delay: i * 0.02 }}
                        className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 group hover:border-gold/20 transition-colors">
                        {/* 封面缩略图 */}
                        <div className="w-10 h-14 rounded shrink-0 overflow-hidden flex items-center justify-center"
                          style={{ background: '#200814', border: '1px solid rgba(232,164,184,0.15)' }}>
                          {card.cover_url ? (
                            <img src={card.cover_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-gold/20 font-serif text-sm">歌</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* display_text 作为歌曲名 */}
                          <p className="font-sans text-white/80 text-sm truncate">
                            {card.display_text && card.display_text !== '—' ? card.display_text : (
                              <span className="text-muted italic text-xs">神秘歌曲 (¬‿¬)</span>
                            )}
                          </p>
                          {card.hint_text && (
                            <p className="text-muted text-xs truncate mt-0.5">
                              提示：{card.hint_text}
                            </p>
                          )}
                          <p className="text-gold/40 text-xs mt-0.5">♪ 音频就绪</p>
                        </div>

                        <button onClick={() => setDeleteCardId(card.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-crimson text-xs px-2 py-1 rounded hover:bg-crimson/10">
                          删除
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* 添加牌表单 */}
            <div className="lg:col-span-1">
              <div className="bg-surface border border-border rounded-xl p-5 sticky top-20">
                <h2 className="text-gold text-sm font-medium mb-1">✨ 添加新牌</h2>
              <p className="text-muted text-xs mb-4">封面 + 音频，打造你的专属歌牌！(ﾉ◕ヮ◕)ﾉ</p>
                <form onSubmit={handleAddCard} className="flex flex-col gap-4">

                  {/* 封面图（必选，支持拖拽） */}
                  <div>
                    <label className="text-muted text-xs block mb-1.5">🖼️ 封面图片 *</label>
                    <div
                      className="border border-dashed rounded-lg overflow-hidden cursor-pointer transition-all duration-200"
                      style={{
                        borderColor: dragOverCover ? 'rgba(232,164,184,0.8)' : 'rgba(92,26,48,0.8)',
                        boxShadow: dragOverCover ? '0 0 16px rgba(232,164,184,0.3)' : 'none',
                        background: dragOverCover ? 'rgba(232,164,184,0.05)' : 'transparent',
                      }}
                      onClick={() => coverInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOverCover(true) }}
                      onDragLeave={() => setDragOverCover(false)}
                      onDrop={handleCoverDrop}
                    >
                      {coverPreview ? (
                        <div className="relative">
                          <img src={coverPreview} alt="preview" className="w-full h-32 object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-white text-xs">点击或拖拽更换</span>
                          </div>
                        </div>
                      ) : (
                        <div className="h-24 flex flex-col items-center justify-center gap-1 text-muted">
                          <span className="text-2xl">{dragOverCover ? '✨' : '🖼️'}</span>
                          <span className="text-xs">{dragOverCover ? '松开即可上传！' : '点击或拖拽图片'}</span>
                          <span className="text-xs text-muted/40">jpg / png / webp · ≤5MB</span>
                        </div>
                      )}
                    </div>
                    <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
                  </div>

                  {/* 音频（必选，支持拖拽） */}
                  <div>
                    <label className="text-muted text-xs block mb-1.5">🎵 音频文件 *</label>
                    <div
                      className="border border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 text-center"
                      style={{
                        borderColor: dragOverAudio ? 'rgba(232,164,184,0.8)' : 'rgba(92,26,48,0.8)',
                        boxShadow: dragOverAudio ? '0 0 16px rgba(232,164,184,0.3)' : 'none',
                        background: dragOverAudio ? 'rgba(232,164,184,0.05)' : 'transparent',
                      }}
                      onClick={() => audioInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDragOverAudio(true) }}
                      onDragLeave={() => setDragOverAudio(false)}
                      onDrop={handleAudioDrop}
                    >
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

                  {/* 歌曲名称（选填，仅在牌组清单展示） */}
                  <div>
                    <label className="text-muted text-xs block mb-1.5">
                      🎼 歌曲名称
                      <span className="text-muted/50 ml-1">（选填，仅牌组清单展示）</span>
                    </label>
                    <input type="text" value={displayText} onChange={e => setDisplayText(e.target.value)}
                      className="input-dark text-sm" placeholder="例：春晓" />
                  </div>

                  {/* 播放提示文字（选填，上句） */}
                  <div>
                    <label className="text-muted text-xs block mb-1.5">
                      📜 播放时提示文字
                      <span className="text-muted/50 ml-1">（选填，上句）</span>
                    </label>
                    <input type="text" value={hintText} onChange={e => setHintText(e.target.value)}
                      className="input-dark text-sm" placeholder="播放时显示在读牌区，让玩家热血沸腾！" />
                  </div>

                  {uploadError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-crimson text-xs bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                      😣 {uploadError}
                    </motion.p>
                  )}

                  <button type="submit"
                    disabled={uploading || !audioFile || !coverFile}
                    className="btn-gold w-full disabled:opacity-50 transition-all duration-200 hover:scale-[1.02]">
                    {uploading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-ink/50 border-t-ink rounded-full animate-spin" />
                        上传中… (｡･ω･｡)
                      </span>
                    ) : '✨ 把这张牌加入战场！'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {deleteCardId !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setDeleteCardId(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-3xl mb-3">🗑️</div>
              <p className="text-white font-medium mb-1">真的要把这张牌驱逐出境吗？(；′⌒`)</p>
              <p className="text-muted text-sm mb-5">删掉就找不回来了！(｡•́︿•̀｡)</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteCardId(null)} className="btn-outline flex-1 text-sm transition-all duration-200 hover:scale-[1.02]">再想想</button>
                <button onClick={() => handleDeleteCard(deleteCardId)}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light text-white font-medium text-sm transition-all duration-200 hover:scale-[1.02]">
                  狠心删掉 (╥_╥)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除牌组确认弹窗 */}
      <AnimatePresence>
        {showDeleteDeck && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setShowDeleteDeck(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-xs text-center"
              onClick={e => e.stopPropagation()}>
              <div className="text-4xl mb-3">💣</div>
              <p className="text-white font-medium mb-1">真的要解散这个牌组吗？</p>
              <p className="text-muted text-sm mb-1">「{deckName}」和里面所有的牌都会消失！</p>
              <p className="text-crimson/70 text-xs mb-5">(╥_╥) 这个操作不可撤销哦！</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteDeck(false)}
                  className="btn-outline flex-1 text-sm">
                  算了算了
                </button>
                <button onClick={handleDeleteDeck} disabled={deletingDeck}
                  className="flex-1 px-4 py-2.5 rounded bg-crimson hover:bg-crimson-light text-white font-medium text-sm transition-all disabled:opacity-50">
                  {deletingDeck ? '解散中…' : '狠心解散 (╥_╥)'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 修改牌组名称弹窗 */}
      <AnimatePresence>
        {editingName && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setEditingName(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-ink-deep border border-border rounded-xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <h3 className="font-serif text-gold text-lg font-medium mb-1">✏️ 修改牌组</h3>
              <p className="text-muted text-xs mb-5">改个更霸气的名字吧！(ง •̀_•́)ง</p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-muted text-xs block mb-1.5">牌组名称 *</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingName(false) }}
                    className="input-dark"
                    placeholder="牌组名称"
                  />
                </div>
                <div>
                  <label className="text-muted text-xs block mb-1.5">描述（选填）</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingName(false) }}
                    className="input-dark"
                    placeholder="描述（选填）"
                  />
                </div>
                <div className="flex gap-3 mt-1">
                  <button onClick={() => setEditingName(false)} className="btn-outline flex-1 text-sm">算了</button>
                  <button onClick={saveEdit} disabled={savingName || !editName.trim()}
                    className="btn-gold flex-1 text-sm disabled:opacity-50">
                    {savingName ? '保存中…' : '✓ 搞定！'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  )
}
