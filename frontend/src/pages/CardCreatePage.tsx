import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layout } from '../components/Layout'
import { Button, Input } from '../components/ui'
import { api } from '../api/client'
import type { Card, CardAudio } from '../api/types'
import { AudioUploadOptions } from '../components/AudioUploadOptions'
import { getAudioDuration } from '../utils/audioProcessor'
import { useAuth } from '../hooks/useAuth'
import { useCardForm, DEFAULT_TAGS, isShareLevel } from '../features/card-create/useCardForm'
import { useBangumiSearch, type BangumiResult } from '../features/card-create/useBangumiSearch'
import { useAudioProcessing } from '../features/card-create/useAudioProcessing'
import { BangumiSearch } from '../features/card-create/BangumiSearch'
import { UploadZone, isAudioFile } from '../features/card-create/UploadZone'
import { EditAudioPanel } from '../features/card-create/EditAudioPanel'
import { CustomTagDialog } from '../features/card-create/CustomTagDialog'
import { ReadOnlyCardView } from '../features/card-create/ReadOnlyCardView'
import { TagPicker } from '../features/card-create/TagPicker'
import { ShareLevelPicker } from '../features/card-create/ShareLevelPicker'
import { EditCoverField } from '../features/card-create/EditCoverField'
import { ArrowLeft, Pencil, Sparkles, Image as ImageIcon, Music, Music2, Search, Tv, ScrollText, Check } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 卡牌创建/编辑双模式页面：表单字段与上传链路已拆至 features/card-create */
export function CardCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = !!id
  const cardId = parseInt(id ?? '0', 10)

  // 表单字段（创建/编辑双模式共用）
  const {
    displayText, setDisplayText, series, setSeries, tags, setTags,
    hintText, setHintText, isShared, setIsShared, shareLevel, setShareLevel,
    addTag, toggleTag,
  } = useCardForm()

  // Bangumi 搜索
  const {
    bangumiQuery, handleQueryChange, bangumiResults, bangumiLoading,
    showBangumi, toggleBangumi, closeBangumi, searchBangumi,
  } = useBangumiSearch()

  // 音频选择与处理（创建模式）
  const {
    audioFile, createAudioFiles, setAudioOptions,
    processing, setProcessing, processProgress, selectFiles, processIfNeeded,
  } = useAudioProcessing()

  // Cover state
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Custom tag dialog
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [customTags, setCustomTags] = useState<string[]>([])

  // Edit mode state
  const [card, setCard] = useState<Card | null>(null)
  const [audios, setAudios] = useState<CardAudio[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Audio preview
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

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
    // Load all public tags + my own tags
    api.cards.listTags().then(tags => {
      setCustomTags(prev => [...new Set([...prev, ...tags.filter(t => !DEFAULT_TAGS.includes(t))])])
    }).catch(() => {})
  }, [cardId])

  /** 编辑模式：拉取卡牌详情并回填表单字段与封面 */
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
      // share_level 运行时收窄为合法联合；缺省/非法值按 is_shared 推断
      const rawLevel = data.card.share_level
      setShareLevel(isShareLevel(rawLevel) ? rawLevel : (data.card.is_shared ? 'playable' : 'private'))
      if (data.card.cover_url) {
        setCoverPreview(data.card.cover_url)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  /** 封面选定（文件框或拖入）：首个文件作为封面并生成预览 */
  const handleCoverFiles = (files: File[]) => {
    const file = files[0] ?? null
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : coverPreview)
  }

  /** 选中 Bangumi 条目：回填作品名、并入类型标签、经代理抓取封面图 */
  const handleBangumiSelect = (item: BangumiResult) => {
    setSeries(item.name_cn || item.name)
    const typeTag = item.type === 2 ? '动画' : item.type === 4 ? '游戏' : ''
    if (typeTag) addTag(typeTag)
    if (item.images?.large) {
      const proxyUrl = `/api/bangumi/image?url=${encodeURIComponent(item.images.large)}`
      setCoverPreview(proxyUrl)
      fetch(proxyUrl).then(r => r.blob()).then(blob => {
        const file = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' })
        setCoverFile(file)
      }).catch(() => {})
    }
    closeBangumi()
  }

  /** 创建模式提交：按需处理音频 → 建牌 → 追加多选音频 → 跳转列表 */
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!audioFile || !coverFile) return
    setUploading(true)
    setUploadError(null)
    try {
      // Process first audio（未启用压缩/裁剪时原样返回；同时取得实测时长供服务端回合时钟）
      const { file: finalAudio, durationSec } = await processIfNeeded(audioFile)

      const formData = new FormData()
      formData.append('audio', finalAudio)
      formData.append('audio_duration', durationSec ? String(durationSec) : '0')
      formData.append('cover', coverFile)
      formData.append('display_text', displayText.trim() || '—')
      formData.append('series', series.trim())
      formData.append('tags', tags.trim())
      formData.append('is_shared', String(isShared))
      if (hintText.trim()) formData.append('hint_text', hintText.trim())

      const newCard = await api.cards.create(formData)

      // Upload remaining audio files (if multiple selected)
      if (createAudioFiles.length > 1) {
        for (let i = 1; i < createAudioFiles.length; i++) {
          const fd = new FormData()
          fd.append('audio', createAudioFiles[i])
          // 追加音频同样测量时长（B1 服务端权威回合时钟数据源）
          let extraDuration = 0
          try {
            extraDuration = await getAudioDuration(createAudioFiles[i])
          } catch { extraDuration = 0 }
          fd.append('audio_duration', extraDuration ? String(extraDuration) : '0')
          await api.cards.addAudio(newCard.id, fd)
        }
      }

      navigate('/cards')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '上传失败，请重试。')
    } finally {
      setUploading(false)
      setProcessing(false)
    }
  }

  /** 编辑模式保存：回写表单字段后跳转列表 */
  const handleSave = async () => {
    if (!isEdit) return
    setSaving(true)
    try {
      await api.cards.update(cardId, {
        display_text: displayText.trim(),
        series: series.trim(),
        tags: tags.trim(),
        is_shared: shareLevel !== 'private',
        share_level: shareLevel,
      })
      navigate('/cards')
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  /** 试听指定音频，切歌时先停掉上一条；结束/出错自动复位 */
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

  /** 自定义标签确认：并入 tags 逗号串，并注册到自定义标签集 */
  const handleAddCustomTag = (nt: string) => {
    addTag(nt)
    if (!DEFAULT_TAGS.includes(nt) && !customTags.includes(nt)) {
      setCustomTags(prev => [...prev, nt])
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="text-pink-300/50 animate-pulse font-serif text-xl text-center py-24">
            解封歌牌中…
          </div>
        </div>
      </Layout>
    )
  }

  const isOwner = !isEdit || !!(card && user && card.owner_id === user.id)

  // Read-only view for non-owners in edit mode
  if (isEdit && card && !isOwner) {
    return (
      <ReadOnlyCardView card={card} coverPreview={coverPreview} audios={audios}
        playingAudioId={playingAudioId} onTogglePlay={togglePlay} />
    )
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header with decorative gradient */}
        <div className="relative mb-6 overflow-hidden rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.4) 0%, rgb(var(--accent-bg-mid)/ 0.8) 50%, rgb(var(--accent-bg-end)/ 0.4) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.15)' }}>
          <div className="absolute top-0 right-0 w-24 h-24 opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgb(var(--glow-color)/ 0.8), transparent 70%)' }} />
          <div className="flex items-center gap-3 relative">
            <button onClick={() => {
              if (!isEdit && (audioFile || coverFile || displayText.trim())) {
                if (!confirm('确定放弃制作这张牌吗？已填内容不会保存。')) return
              }
              navigate('/cards')
            }}
              className="text-pink-300/50 hover:text-gold transition-all duration-200 text-sm shrink-0 hover:scale-110">
              <ArrowLeft className="mr-0.5 inline h-3.5 w-3.5" /> 撤退
            </button>
            <div>
              <h1 className="font-serif text-xl text-gold font-bold tracking-wide">
                {isEdit
                  ? <><Pencil className="mr-1 inline h-4 w-4" /> 铭刻之牌{card ? ` · ${card.display_text}` : ''}</>
                  : <><Sparkles className="mr-1 inline h-4 w-4" /> 召唤新牌</>}
              </h1>
              <p className="text-pink-300/60 text-xs mt-0.5 font-serif italic">
                {isEdit ? '重新刻印这张命运之牌 ♪' : '将新的命运之牌注入此世 ✧'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5) 0%, rgb(var(--accent-bg-mid)/ 0.8) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
          <form onSubmit={isEdit ? (e) => { e.preventDefault(); handleSave() } : handleCreate} className="flex flex-col gap-5">

            {/* Cover image (create mode) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5"><ImageIcon className="mr-1 inline h-3.5 w-3.5" /> 封面图片 *</label>
                <div className="flex items-start gap-4">
                  <UploadZone
                    accept="image/*"
                    className="w-24 border border-dashed rounded-lg overflow-hidden cursor-pointer transition-all duration-200 shrink-0"
                    baseStyle={{ aspectRatio: '3/4', borderColor: 'rgb(var(--accent-bg)/ 0.8)', boxShadow: 'none', background: 'rgb(var(--color-ink-deep))' }}
                    dragOverStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.8)', boxShadow: '0 0 16px rgb(var(--accent-primary)/ 0.3)', background: 'rgb(var(--accent-primary)/ 0.05)' }}
                    onFiles={handleCoverFiles}>
                    {(dragOver) => coverPreview ? (
                      <img src={coverPreview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted">
                        {dragOver ? <Sparkles className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                        <span className="text-[10px]">点击上传</span>
                      </div>
                    )}
                  </UploadZone>
                  <div className="text-muted text-xs pt-2">
                    <p>jpg / png / webp</p>
                    <p className="text-muted/40 mt-0.5">≤ 5MB · 建议 3:4 比例</p>
                  </div>
                </div>
              </div>
            )}

            {/* Edit mode: show existing cover (small) */}
            {isEdit && coverPreview && (
              <EditCoverField cardId={cardId} coverPreview={coverPreview} onPreviewChange={setCoverPreview} />
            )}

            {/* Audio file (create mode only) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5"><Music className="mr-1 inline h-3.5 w-3.5" /> 音频文件 *</label>
                <UploadZone
                  accept="audio/*"
                  multiple
                  filter={isAudioFile}
                  className="border border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 text-center"
                  baseStyle={{ borderColor: 'rgb(var(--accent-bg)/ 0.8)', boxShadow: 'none', background: 'transparent' }}
                  dragOverStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.8)', boxShadow: '0 0 16px rgb(var(--accent-primary)/ 0.3)', background: 'rgb(var(--accent-primary)/ 0.05)' }}
                  onFiles={selectFiles}>
                  {(dragOver) => createAudioFiles.length > 0 ? (
                    <div className="text-xs">
                      <div className="text-gold font-medium">{createAudioFiles.length} 首音频已选</div>
                      <div className="text-muted mt-0.5 max-h-12 overflow-y-auto">{createAudioFiles.map(f => f.name).join(', ')}</div>
                    </div>
                  ) : audioFile ? (
                    <div className="text-xs">
                      <div className="text-gold font-medium truncate">{audioFile.name}</div>
                      <div className="text-muted mt-0.5">{formatBytes(audioFile.size)} · 准备就绪 ✓</div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted">
                      {dragOver ? <Sparkles className="h-5 w-5" /> : <Music className="h-5 w-5" />}
                      <span className="text-xs">{dragOver ? '松开即可上传！' : '点击或拖拽音频（支持多选）'}</span>
                      <span className="text-xs text-muted/40">mp3 / wav / flac 等 · ≤20MB</span>
                    </div>
                  )}
                </UploadZone>
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
              <Input label={<><Music2 className="mr-1 inline h-3.5 w-3.5" /> 牌名（歌曲名） *</>} type="text" value={displayText} onChange={e => setDisplayText(e.target.value)}
                className="text-sm" placeholder="例：春晓" required />
            </div>

            {/* Series + Bangumi search */}
            <div className="relative">
              <label className="text-muted text-xs block mb-1.5"><Tv className="mr-1 inline h-3.5 w-3.5" /> 作品名（选填）</label>
              <div className="flex gap-2">
                <Input type="text" value={series} onChange={e => setSeries(e.target.value)}
                  className="text-sm" placeholder="例：Fate/stay night" />
                <button type="button" onClick={() => toggleBangumi(series)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium shrink-0 transition-all hover:scale-105"
                  style={{ background: 'rgba(74,144,217,0.15)', border: '1px solid rgba(74,144,217,0.3)', color: 'rgba(74,144,217,0.9)' }}>
                  <Search className="h-3 w-3" /> Bangumi
                </button>
              </div>
              {/* Bangumi search panel */}
              {showBangumi && (
                <BangumiSearch
                  query={bangumiQuery}
                  results={bangumiResults}
                  loading={bangumiLoading}
                  onQueryChange={handleQueryChange}
                  onSearch={() => searchBangumi(bangumiQuery)}
                  onClose={closeBangumi}
                  onSelect={handleBangumiSelect} />
              )}
            </div>

            {/* Tags */}
            <TagPicker tags={tags} customTags={customTags} onToggle={toggleTag} onRequestCustom={() => setShowTagDialog(true)} />

            {/* Hint text (create mode only) */}
            {!isEdit && (
              <div>
                <Input label={<><ScrollText className="mr-1 inline h-3.5 w-3.5" /> 播放提示<span className="text-muted/50 ml-1">（选填，播放时显示的上句提示）</span></>}
                  type="text" value={hintText} onChange={e => setHintText(e.target.value)}
                  className="text-sm" placeholder="播放时显示在读牌区的提示文字" />
              </div>
            )}

            {/* Share level (only owner can toggle) */}
            {(!isEdit || (card && user && card.owner_id === user.id)) && (
              <ShareLevelPicker
                shareLevel={shareLevel}
                onChange={(value) => { setShareLevel(value); setIsShared(value !== 'private') }} />
            )}

            {/* Upload error */}
            {uploadError && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-crimson text-xs bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                {uploadError}
              </motion.p>
            )}

            {/* Submit button */}
            <Button type="submit"
              loading={uploading || processing || saving}
              disabled={!isEdit && (createAudioFiles.length === 0 && !audioFile || !coverFile)}
              className="w-full">
              {isEdit
                ? <><Check className="mr-1 inline h-3.5 w-3.5" /> 保存修改</>
                : <><Sparkles className="mr-1 inline h-3.5 w-3.5" /> 上传新牌！</>}
            </Button>
          </form>
        </div>

        {/* Edit mode: audio management panel */}
        {isEdit && (
          <EditAudioPanel cardId={cardId} audios={audios} onAudiosChange={setAudios}
            playingAudioId={playingAudioId} onTogglePlay={togglePlay} />
        )}
      </div>

      <CustomTagDialog open={showTagDialog} onConfirm={handleAddCustomTag} onCancel={() => setShowTagDialog(false)} />
    </Layout>
  )
}
