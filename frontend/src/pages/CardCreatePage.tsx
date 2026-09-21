import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Input, PageContainer, HeroHeader, ConfirmDialog, StepProgress } from '../components/ui'
import { api } from '../api/client'
import { paths } from '../routes/paths'
import type { Card, CardAudio } from '../api/types'
import { AudioUploadOptions } from '../components/AudioUploadOptions'
import { getAudioDuration } from '../utils/audioProcessor'
import { useAuth } from '../hooks/useAuth'
import { useCardForm, DEFAULT_TAGS, isShareLevel } from '../features/card-create/useCardForm'
import { useAudioProcessing, type AudioFileState } from '../features/card-create/useAudioProcessing'
import { UploadZone, isAudioFile } from '../features/card-create/UploadZone'
import { EditAudioPanel } from '../features/card-create/EditAudioPanel'
import { CustomTagDialog } from '../features/card-create/CustomTagDialog'
import { ReadOnlyCardView } from '../features/card-create/ReadOnlyCardView'
import { TagPicker } from '../features/card-create/TagPicker'
import { ShareLevelPicker } from '../features/card-create/ShareLevelPicker'
import { EditCoverField } from '../features/card-create/EditCoverField'
import { Pencil, Sparkles, Image as ImageIcon, Music, Music2, Tv, ScrollText, Check } from 'lucide-react'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 造牌向导四步（docs §6.4）：素材 → 信息 → 权限 → 预览提交 */
const WIZARD_STEPS = ['素材', '信息', '权限', '预览提交']

/** 单文件状态机 → 展示文案（操作层，无颜文字） */
const AUDIO_STATE_TEXT: Record<AudioFileState, string> = {
  queued: '等待中',
  transcoding: '转码中',
  uploading: '上传中',
  done: '已完成',
  failed: '上传失败',
}

/** 单文件状态 → 展示色（token 体系） */
const AUDIO_STATE_CLASS: Record<AudioFileState, string> = {
  queued: 'text-muted/60',
  transcoding: 'text-gold',
  uploading: 'text-gold',
  done: 'text-success',
  failed: 'text-crimson',
}

/** 分享级别 → 预览文案 */
const SHARE_LEVEL_TEXT = { private: '私有', playable: '可使用', editable: '可编辑' } as const

/** 向导底部导航：上一步 / 下一步（下一步可禁用）；children 可替换右侧下一步为主提交按钮 */
function StepNav({ onPrev, onNext, nextDisabled, children }: {
  onPrev?: () => void
  onNext?: () => void
  nextDisabled?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {onPrev
        ? <Button type="button" variant="ghost" size="sm" onClick={onPrev}>上一步</Button>
        : <span />}
      {children ?? (onNext
        ? <Button type="button" size="sm" onClick={onNext} disabled={nextDisabled}>下一步</Button>
        : null)}
    </div>
  )
}

/** 卡牌创建/编辑双模式页面：表单字段与上传链路已拆至 features/card-create */
export function CardCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isEdit = !!id
  const cardId = parseInt(id ?? '0', 10)

  // 向导当前步（编辑模式素材已存在，直接落步骤 2）
  const [step, setStep] = useState(isEdit ? 1 : 0)

  // 表单字段（创建/编辑双模式共用）
  const {
    displayText, setDisplayText, series, setSeries, tags, setTags,
    hintText, setHintText, isShared, setIsShared, shareLevel, setShareLevel,
    addTag, toggleTag,
  } = useCardForm()

  // 音频选择与处理（创建模式）
  const {
    audioFile, createAudioFiles, setAudioOptions,
    processing, setProcessing, processProgress, selectFiles, processIfNeeded,
    fileStatuses, updateFileStatus,
  } = useAudioProcessing()

  // Cover state
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  // 创建模式：建牌成功后的卡牌 id（用于失败音频的单文件重试，避免整批重传）
  const [createdCardId, setCreatedCardId] = useState<number | null>(null)

  // Custom tag dialog
  const [showTagDialog, setShowTagDialog] = useState(false)
  const [customTags, setCustomTags] = useState<string[]>([])

  // Edit mode state
  const [card, setCard] = useState<Card | null>(null)
  const [audios, setAudios] = useState<CardAudio[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 放弃制作确认弹窗（创建模式撤退守卫）
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

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

  /** 撤退守卫：创建模式已填内容时先弹确认，避免误丢弃 */
  const handleBack = () => {
    if (!isEdit && (audioFile || coverFile || displayText.trim())) {
      setShowLeaveConfirm(true)
      return
    }
    navigate(paths.cards())
  }

  /** 封面选定（文件框或拖入）：首个文件作为封面并生成预览 */
  const handleCoverFiles = (files: File[]) => {
    const file = files[0] ?? null
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : coverPreview)
  }

  // —— 向导放行规则：步骤1需≥1音频（新建），步骤2需牌名 ——
  const canLeaveStep1 = isEdit || createAudioFiles.length > 0 || !!audioFile
  const canLeaveStep2 = displayText.trim().length > 0

  /** 下一步（带放行校验，未满足时原地不动） */
  const goNext = () => {
    if (step === 0 && canLeaveStep1) setStep(1)
    else if (step === 1 && canLeaveStep2) setStep(2)
    else if (step === 2) setStep(3)
  }

  /** 单个追加音频上传：成功标记 done，失败仅标记该项（已成功项不回滚） */
  const uploadExtraAudio = async (targetCardId: number, index: number): Promise<boolean> => {
    updateFileStatus(index, { status: 'uploading', progress: undefined })
    try {
      const fd = new FormData()
      fd.append('audio', createAudioFiles[index])
      // 追加音频同样测量时长（B1 服务端权威回合时钟数据源）
      let extraDuration = 0
      try {
        extraDuration = await getAudioDuration(createAudioFiles[index])
      } catch { extraDuration = 0 }
      fd.append('audio_duration', extraDuration ? String(extraDuration) : '0')
      await api.cards.addAudio(targetCardId, fd)
      updateFileStatus(index, { status: 'done', progress: undefined })
      return true
    } catch {
      updateFileStatus(index, { status: 'failed', progress: undefined })
      return false
    }
  }

  /** 创建模式提交：按需处理音频 → 建牌 → 追加多选音频 → 全部落库后跳转列表 */
  const handleCreate = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!audioFile || !coverFile) return
    // 已建牌（仅剩失败项重试场景）：不重复建牌，只补传失败项
    if (createdCardId !== null) {
      setUploading(true)
      try {
        const failed = fileStatuses.map((f, i) => ({ f, i })).filter(x => x.f.status === 'failed')
        const results = await Promise.all(failed.map(x => uploadExtraAudio(createdCardId, x.i)))
        if (results.every(Boolean)) navigate(paths.cards())
      } finally { setUploading(false) }
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      // Process first audio（未启用压缩/裁剪时原样返回；同时取得实测时长供服务端回合时钟）
      updateFileStatus(0, { status: 'transcoding', progress: 0 })
      const { file: finalAudio, durationSec } = await processIfNeeded(audioFile, p => updateFileStatus(0, { progress: p }))
      updateFileStatus(0, { status: 'uploading' })

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
      setCreatedCardId(newCard.id)
      updateFileStatus(0, { status: 'done', progress: undefined })

      // Upload remaining audio files (if multiple selected)，单项失败不中断整批
      const results: boolean[] = [true]
      for (let i = 1; i < createAudioFiles.length; i++) {
        results.push(await uploadExtraAudio(newCard.id, i))
      }
      if (results.every(Boolean)) {
        navigate(paths.cards())
      }
    } catch (err) {
      updateFileStatus(0, { status: 'failed', progress: undefined })
      setUploadError(err instanceof Error ? err.message : '保存失败，请重试')
    } finally {
      setUploading(false)
      setProcessing(false)
    }
  }

  /** 单文件重试：整单尚未建牌时重走提交（此时无已成功项，不存在整批重传）；已建牌后仅重传该项 */
  const retryAudioFile = async (index: number) => {
    if (createdCardId === null) {
      await handleCreate()
      return
    }
    if (index === 0) {
      // 主音频已随建牌落库，理论不可达；防御性走补传路径
      await handleCreate()
      return
    }
    const ok = await uploadExtraAudio(createdCardId, index)
    if (ok) {
      const remaining = fileStatuses.filter((f, i) => i !== index && f.status !== 'done').length
      if (remaining === 0) navigate(paths.cards())
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
      navigate(paths.cards())
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
      <PageContainer size="sm">
        <div className="text-pink-300/50 animate-pulse font-serif text-xl text-center py-24">
          加载中…
        </div>
      </PageContainer>
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
    <PageContainer size="sm">
      <HeroHeader
        icon={isEdit ? <Pencil size={16} /> : <Sparkles size={16} />}
        title={isEdit
          ? <>编辑歌牌{card ? ` · ${card.display_text}` : ''}</>
          : '新建歌牌'}
        subtitle={isEdit ? '修改这张歌牌的信息' : '上传音频与封面，创建歌牌'}
        onBack={handleBack}
      />

      {/* 造牌向导进度条：已完成步可点击回退 */}
      <div className="mb-4">
        <StepProgress steps={WIZARD_STEPS} current={step} onStepClick={setStep} />
      </div>

      <div className="rounded-2xl p-6" style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-end)/ 0.5) 0%, rgb(var(--accent-bg-mid)/ 0.8) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
        {/* 全部步骤保持挂载，仅切换可见区：跨步数据零丢失，表单逻辑不动 */}
        <form onSubmit={isEdit
          ? (e) => { e.preventDefault(); if (step === 3) handleSave() }
          : (e) => { if (step !== 3) { e.preventDefault(); return } void handleCreate(e) }}
          className="flex flex-col gap-5">

          {/* ── 步骤 1 素材：封面 + 音频 ── */}
          <div className={step === 0 ? 'flex flex-col gap-5' : 'hidden'}>
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
                      <div className="text-muted mt-0.5 max-h-scroll-xs overflow-y-auto">{createAudioFiles.map(f => f.name).join(', ')}</div>
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

                {/* 单文件状态机：状态 + 进度 + 失败独立重试 */}
                {fileStatuses.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {fileStatuses.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-tiny">
                        <span className="flex-1 min-w-0 truncate text-body-text/80">{f.name}</span>
                        {(f.status === 'transcoding' || f.status === 'uploading') && f.progress !== undefined && (
                          <span className="text-muted/60 shrink-0">{Math.round(f.progress * 100)}%</span>
                        )}
                        <span className={`${AUDIO_STATE_CLASS[f.status]} shrink-0`}>{AUDIO_STATE_TEXT[f.status]}</span>
                        {f.status === 'failed' && (
                          <button type="button" disabled={uploading}
                            onClick={() => void retryAudioFile(i)}
                            className="text-gold hover:text-gold/80 shrink-0 disabled:opacity-40">
                            重试
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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

            <StepNav onNext={goNext} nextDisabled={!canLeaveStep1} />
          </div>

          {/* ── 步骤 2 信息：牌名/作品/标签/提示 ── */}
          <div className={step === 1 ? 'flex flex-col gap-5' : 'hidden'}>
            {/* Display text */}
            <div>
              <Input label={<><Music2 className="mr-1 inline h-3.5 w-3.5" /> 牌名（歌曲名） *</>} type="text" value={displayText} onChange={e => setDisplayText(e.target.value)}
                className="text-sm" placeholder="例：春晓" required />
            </div>

            {/* Series */}
            <div>
              <label className="text-muted text-xs block mb-1.5"><Tv className="mr-1 inline h-3.5 w-3.5" /> 作品名（选填）</label>
              <Input type="text" value={series} onChange={e => setSeries(e.target.value)}
                className="text-sm" placeholder="例：Fate/stay night" />
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

            <StepNav onPrev={() => setStep(0)} onNext={goNext} nextDisabled={!canLeaveStep2} />
          </div>

          {/* ── 步骤 3 权限：分享级别 ── */}
          <div className={step === 2 ? 'flex flex-col gap-5' : 'hidden'}>
            {/* Share level (only owner can toggle) */}
            {(!isEdit || (card && user && card.owner_id === user.id)) && (
              <ShareLevelPicker
                shareLevel={shareLevel}
                onChange={(value) => { setShareLevel(value); setIsShared(value !== 'private') }} />
            )}

            <StepNav onPrev={() => setStep(1)} onNext={goNext} />
          </div>

          {/* ── 步骤 4 预览提交 ── */}
          <div className={step === 3 ? 'flex flex-col gap-5' : 'hidden'}>
            {/* 预览摘要：牌面信息汇总（创建模式无落库卡牌，不能复用 ReadOnlyCardView） */}
            <div className="rounded-xl border border-border bg-ink-deep/20 p-4 flex gap-4">
              {coverPreview ? (
                <img src={coverPreview} alt="cover" className="w-20 rounded-lg object-cover shrink-0" style={{ aspectRatio: '3/4' }} />
              ) : (
                <div className="w-20 rounded-lg bg-white/5 flex items-center justify-center shrink-0" style={{ aspectRatio: '3/4' }}>
                  <ImageIcon className="h-5 w-5 text-muted/40" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-gold text-body truncate">{displayText || '—'}</p>
                {series && <p className="text-muted text-caption truncate">作品 · {series}</p>}
                {tags.trim() && (
                  <div className="flex flex-wrap gap-1">
                    {tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className="text-tiny px-1.5 py-0.5 rounded bg-gold/10 text-gold/80 border border-gold/20">{t}</span>
                    ))}
                  </div>
                )}
                {!isEdit && hintText.trim() && <p className="text-muted text-tiny truncate">提示 · {hintText.trim()}</p>}
                <p className="text-muted text-tiny">
                  音频 · {isEdit ? `${audios.length} 首` : `${createAudioFiles.length} 首`}
                  {' · '}权限 · {SHARE_LEVEL_TEXT[shareLevel]}
                </p>
              </div>
            </div>

            {/* Upload error */}
            {uploadError && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="text-crimson text-xs bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
                {uploadError}
              </motion.p>
            )}

            <StepNav onPrev={() => setStep(2)}>
              {/* Submit button（仅步骤 4 出现） */}
              <Button type="submit"
                loading={uploading || processing || saving}
                disabled={!isEdit && (createAudioFiles.length === 0 && !audioFile || !coverFile)}
                icon={isEdit ? <Check size={14} /> : <Sparkles size={14} />}>
                {isEdit ? '保存修改' : '保存'}
              </Button>
            </StepNav>
          </div>
        </form>
      </div>

      {/* Edit mode: audio management panel（素材步可见区，保持挂载） */}
      {isEdit && (
        <div className={step === 0 ? '' : 'hidden'}>
          <EditAudioPanel cardId={cardId} audios={audios} onAudiosChange={setAudios}
            playingAudioId={playingAudioId} onTogglePlay={togglePlay} />
        </div>
      )}

      <CustomTagDialog open={showTagDialog} onConfirm={handleAddCustomTag} onCancel={() => setShowTagDialog(false)} />

      {/* 创建模式撤退守卫：已填内容时确认放弃 */}
      <ConfirmDialog
        open={showLeaveConfirm}
        title="放弃这张牌？"
        description="已填写的内容不会保存，无法恢复"
        confirmText="放弃"
        cancelText="继续编辑"
        danger
        onConfirm={() => navigate(paths.cards())}
        onCancel={() => setShowLeaveConfirm(false)}
      />
    </PageContainer>
  )
}
