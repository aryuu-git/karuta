import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Button, Input, PageContainer, HeroHeader, ConfirmDialog } from '../components/ui'
import { api } from '../api/client'
import { queryKeys } from '../api/queries'
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

/** 单页分区标题：金线小节名（沿用原向导步骤名，作扫读锚点） */
function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-serif text-body font-semibold text-gold/90">{children}</h2>
      <span className="flex-1 h-px bg-border/60" />
    </div>
  )
}

/** 卡牌创建/编辑双模式页面：表单字段与上传链路已拆至 features/card-create */
export function CardCreatePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isEdit = !!id
  const cardId = parseInt(id ?? '0', 10)
  const sourceDeckId = location.state?.fromDeckId
  const returnDeckId = isEdit && typeof sourceDeckId === 'number'
    && Number.isSafeInteger(sourceDeckId) && sourceDeckId > 0 ? sourceDeckId : null

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

  /** 返回来源牌组前刷新详情，包含已经单独保存的封面和音频变更。 */
  const returnToSource = async () => {
    if (returnDeckId !== null) {
      await qc.invalidateQueries({
        queryKey: queryKeys.decks.detail(returnDeckId),
        refetchType: 'all',
      })
    }
    navigate(returnDeckId !== null ? paths.deck(returnDeckId) : paths.cards(), { replace: isEdit })
  }

  /** 撤退守卫：创建模式已填内容时先弹确认，避免误丢弃 */
  const handleBack = () => {
    if (!isEdit && (audioFile || coverFile || displayText.trim())) {
      setShowLeaveConfirm(true)
      return
    }
    void returnToSource()
  }

  /** 封面选定（文件框或拖入）：首个文件作为封面并生成预览 */
  const handleCoverFiles = (files: File[]) => {
    const file = files[0] ?? null
    setCoverFile(file)
    setCoverPreview(file ? URL.createObjectURL(file) : coverPreview)
  }

  // —— 提交放行（单页表单：校验绑定提交按钮，不再绑步骤）：两模式都要牌名，新建还须封面+音频 ——
  const canSubmit = isEdit
    ? displayText.trim().length > 0
    : displayText.trim().length > 0 && !!audioFile && !!coverFile

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

  /** 编辑模式保存：回写表单字段后返回来源页面 */
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
      await returnToSource()
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
        <div className="text-gold/50 animate-pulse font-serif text-xl text-center py-24">
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
        playingAudioId={playingAudioId} onTogglePlay={togglePlay} onBack={handleBack} />
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

      <div className="rounded-2xl p-6 bg-gradient-to-b from-accent-bg-end/50 to-accent-bg-mid/80 border border-accent/[0.12]">
        {/* 单页表单（2026-10-05 去向导化，创建/编辑同构）：全部字段一页可见，提交条常驻底部 */}
        <form onSubmit={(e) => { e.preventDefault(); if (isEdit) void handleSave(); else void handleCreate(e) }}
          className="flex flex-col gap-5">

          {/* ── 素材：封面 + 音频 ── */}
          <div className="flex flex-col gap-5">
            <SectionHeading>素材</SectionHeading>
            {/* Cover image (create mode) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5"><ImageIcon className="mr-1 inline h-3.5 w-3.5" /> 封面图片 *</label>
                <div className="flex items-start gap-4">
                  {/* 拖拽高亮走 shadow-gold token 叠加层（替代手写 boxShadow 字面量） */}
                  <UploadZone
                    accept="image/*"
                    className="relative w-24 border border-dashed rounded-lg cursor-pointer transition-all duration-200 shrink-0"
                    baseStyle={{ aspectRatio: '3/4', borderColor: 'rgb(var(--accent-bg)/ 0.8)', background: 'rgb(var(--color-ink-deep))' }}
                    dragOverStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.8)', background: 'rgb(var(--accent-primary)/ 0.05)' }}
                    onFiles={handleCoverFiles}>
                    {(dragOver) => (<>
                      {dragOver && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg shadow-gold" />}
                      {coverPreview ? (
                        <img src={coverPreview} alt="preview" className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-muted">
                          {dragOver ? <Sparkles className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                          <span className="text-[10px]">点击上传</span>
                        </div>
                      )}
                    </>)}
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

            {/* Edit mode: 音频管理（素材分区正位；按钮均 type=button，防误触提交） */}
            {isEdit && (
              <EditAudioPanel cardId={cardId} audios={audios} onAudiosChange={setAudios}
                playingAudioId={playingAudioId} onTogglePlay={togglePlay} />
            )}

            {/* Audio file (create mode only) */}
            {!isEdit && (
              <div>
                <label className="text-muted text-xs block mb-1.5"><Music className="mr-1 inline h-3.5 w-3.5" /> 音频文件 *</label>
                <UploadZone
                  accept="audio/*"
                  multiple
                  filter={isAudioFile}
                  className="relative border border-dashed rounded-lg p-3 cursor-pointer transition-all duration-200 text-center"
                  baseStyle={{ borderColor: 'rgb(var(--accent-bg)/ 0.8)', background: 'transparent' }}
                  dragOverStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.8)', background: 'rgb(var(--accent-primary)/ 0.05)' }}
                  onFiles={selectFiles}>
                  {(dragOver) => (<>
                    {dragOver && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-lg shadow-gold" />}
                    {createAudioFiles.length > 0 ? (
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
                  </>)}
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
                          <Button type="button" variant="link" size="sm" disabled={uploading}
                            onClick={() => void retryAudioFile(i)}
                            className="shrink-0">
                            重试
                          </Button>
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

          </div>

          {/* ── 信息：牌名/作品/标签/提示 ── */}
          <div className="flex flex-col gap-5">
            <SectionHeading>信息</SectionHeading>
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

          </div>

          {/* ── 权限：分享级别 ── */}
          <div className="flex flex-col gap-5">
            <SectionHeading>权限</SectionHeading>
            {/* Share level (only owner can toggle) */}
            {(!isEdit || (card && user && card.owner_id === user.id)) && (
              <ShareLevelPicker
                shareLevel={shareLevel}
                onChange={(value) => { setShareLevel(value); setIsShared(value !== 'private') }} />
            )}

          </div>

          {/* 上传/处理错误（创建模式失败可见，贴提交条展示） */}
          {uploadError && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="text-crimson text-xs bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5">
              {uploadError}
            </motion.p>
          )}

          {/* ── 常驻提交条（sticky）：任意滚动位置可提交；校验不通过按钮禁用 ── */}
          <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 flex items-center justify-end gap-3 border-t border-border bg-ink-deep/90 backdrop-blur-sm rounded-b-2xl">
            <Button type="submit"
              loading={uploading || processing || saving}
              disabled={!canSubmit}
              icon={isEdit ? <Check size={16} /> : <Sparkles size={16} />}>
              {isEdit ? '保存修改' : '创建歌牌'}
            </Button>
          </div>
        </form>
      </div>

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
