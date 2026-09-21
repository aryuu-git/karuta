import { useState, useRef, type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Input, ConfirmDialog } from '../../components/ui'
import { api } from '../../api/client'
import type { CardAudio } from '../../api/types'
import { UploadZone, isAudioFile } from './UploadZone'
import { Music, Play, Pause, Plus, Check } from 'lucide-react'

interface EditAudioPanelProps {
  cardId: number
  audios: CardAudio[]
  onAudiosChange: Dispatch<SetStateAction<CardAudio[]>>
  playingAudioId: number | null
  onTogglePlay: (audio: CardAudio) => void
}

/** 待追加音频单项状态机：queued → uploading → done | failed（docs §6.4） */
type PendingState = 'queued' | 'uploading' | 'done' | 'failed'

/** 待追加音频条目：文件 + 当前状态 */
interface PendingAudio {
  file: File
  status: PendingState
}

/** 单项状态 → 展示文案（操作层） */
const PENDING_STATE_TEXT: Record<PendingState, string> = {
  queued: '等待中',
  uploading: '上传中',
  done: '已完成',
  failed: '上传失败',
}

/** 单项状态 → 展示色（token 体系） */
const PENDING_STATE_CLASS: Record<PendingState, string> = {
  queued: 'text-muted/60',
  uploading: 'text-gold',
  done: 'text-success',
  failed: 'text-crimson',
}

/**
 * 编辑模式音频管理面板：音频列表/提示就地编辑/追加音频/删除确认流
 * 拉取与变更均直连卡片 API，音频列表经由 onAudiosChange 回写页面状态
 */
export function EditAudioPanel({ cardId, audios, onAudiosChange, playingAudioId, onTogglePlay }: EditAudioPanelProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingAudio[]>([])
  const [newHintText, setNewHintText] = useState('')
  const [addingAudio, setAddingAudio] = useState(false)
  const newAudioInputRef = useRef<HTMLInputElement>(null)

  // Delete audio confirm
  const [deleteAudioId, setDeleteAudioId] = useState<number | null>(null)
  const [deletingAudio, setDeletingAudio] = useState(false)

  /** 按下标更新单项状态 */
  const setPendingStatus = (index: number, status: PendingState) => {
    setPendingFiles(prev => prev.map((p, i) => i === index ? { ...p, status } : p))
  }

  /** 清空待追加列表与提示输入（全部成功后调用） */
  const clearPending = () => {
    setPendingFiles([])
    setNewHintText('')
    if (newAudioInputRef.current) newAudioInputRef.current.value = ''
  }

  /** 上传单项：成功写回音频列表并标记 done，失败仅标记该项 */
  const uploadOne = async (index: number, file: File): Promise<boolean> => {
    setPendingStatus(index, 'uploading')
    try {
      const formData = new FormData()
      formData.append('audio', file)
      if (newHintText.trim()) formData.append('hint_text', newHintText.trim())
      const newAudio = await api.cards.addAudio(cardId, formData)
      onAudiosChange(prev => [...prev, newAudio])
      setPendingStatus(index, 'done')
      return true
    } catch {
      setPendingStatus(index, 'failed')
      return false
    }
  }

  /** 逐个上传待追加音频：单项失败不中断整批；全成功才清空列表，失败项保留供独立重试 */
  const handleAddAudios = async () => {
    const targets = pendingFiles
      .map((p, i) => ({ ...p, index: i }))
      .filter(p => p.status === 'queued')
    if (targets.length === 0) return
    setAddingAudio(true)
    try {
      let allOk = true
      for (const t of targets) {
        const ok = await uploadOne(t.index, t.file)
        if (!ok) allOk = false
      }
      if (allOk) {
        clearPending()
      } else {
        setPendingFiles(prev => prev.filter(p => p.status !== 'done'))
      }
    } finally { setAddingAudio(false) }
  }

  /** 失败项独立重试：只重传该项，已成功项不回滚 */
  const retryOne = async (index: number) => {
    const entry = pendingFiles[index]
    if (!entry || entry.status !== 'failed' || addingAudio) return
    setAddingAudio(true)
    try {
      const ok = await uploadOne(index, entry.file)
      if (ok) setPendingFiles(prev => prev.filter((_, i) => i !== index))
    } finally { setAddingAudio(false) }
  }

  /** 删除单条音频：至少保留 1 条；经确认弹窗后调用删除 API */
  const handleDeleteAudio = async (audioId: number) => {
    if (audios.length <= 1) {
      setDeleteAudioId(null)
      return
    }
    setDeletingAudio(true)
    try {
      await api.cards.deleteAudio(cardId, audioId)
      onAudiosChange(prev => prev.filter(a => a.id !== audioId))
      setDeleteAudioId(null)
    } catch { /* ignore */ }
    finally { setDeletingAudio(false) }
  }

  return (
    <>
      <div className="mt-8">
        <h2 className="text-gold text-caption font-medium mb-3"><Music className="mr-1 inline h-3.5 w-3.5" /> 音频列表 ({audios.length} 条)</h2>
        <div className="space-y-2">
          <AnimatePresence>
            {audios.map((audio, i) => (
              <motion.div key={audio.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3 group hover:border-gold/20 transition-colors">
                <button onClick={() => onTogglePlay(audio)}
                  className="text-gold/60 hover:text-gold text-caption px-2 py-1 rounded hover:bg-gold/10 transition-all shrink-0"
                  title={playingAudioId === audio.id ? '暂停' : '播放'}>
                  {playingAudioId === audio.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-body-text/80 text-caption truncate">
                    音频 #{audio.sort_order + 1}
                  </p>
                  <input
                    type="text"
                    defaultValue={audio.hint_text || ''}
                    placeholder="输入提示文字（如歌名/上句）…"
                    className="text-muted text-tiny mt-0.5 bg-transparent border-b border-transparent hover:border-border focus:border-gold focus:text-body-text/80 outline-none w-full transition-all"
                    onBlur={async (e) => {
                      const newHint = e.target.value.trim()
                      if (newHint !== (audio.hint_text || '')) {
                        try {
                          await api.cards.updateAudioHint(cardId, audio.id, newHint)
                          onAudiosChange(prev => prev.map(a => a.id === audio.id ? { ...a, hint_text: newHint } : a))
                        } catch { /* ignore */ }
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  />
                </div>
                <button onClick={() => setDeleteAudioId(audio.id)}
                  disabled={audios.length <= 1}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-crimson text-tiny px-2 py-1 rounded hover:bg-crimson/10 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={audios.length <= 1 ? '至少保留 1 条音频' : '删除'}>
                  删除
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add new audio (edit mode) */}
        <div className="mt-4 bg-surface border border-border rounded-xl p-4">
          <h3 className="text-gold/80 text-tiny font-medium mb-3"><Plus className="mr-0.5 inline h-3 w-3" /> 添加新音频</h3>
          <div className="flex flex-col gap-3">
            {/* Drop zone + file selector */}
            <UploadZone
              accept="audio/*"
              multiple
              filter={isAudioFile}
              className="border border-dashed rounded-lg p-4 text-center cursor-pointer transition-all duration-200 hover:border-gold/40"
              baseStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.3)' }}
              dragOverStyle={{ borderColor: 'rgb(var(--accent-primary)/ 0.8)', background: 'rgb(var(--accent-primary)/ 0.05)' }}
              inputRef={newAudioInputRef}
              onFiles={files => { if (files.length > 0) setPendingFiles(files.map(file => ({ file, status: 'queued' as const }))) }}>
              {pendingFiles.length > 0 ? (
                <p className="text-gold/80 text-tiny"><Check className="mr-0.5 inline h-3 w-3" /> 已选 {pendingFiles.length} 个文件</p>
              ) : (
                <>
                  <p className="text-muted text-tiny"><Music className="mr-0.5 inline h-3 w-3" /> 拖拽音频到这里，或点击选择</p>
                  <p className="text-muted/40 text-[10px] mt-1">支持同时选择多个文件</p>
                </>
              )}
            </UploadZone>
            {pendingFiles.length > 0 && (
              <>
                <div className="text-tiny space-y-1 max-h-scroll-sm overflow-y-auto">
                  {pendingFiles.map((p, i) => (
                    <div key={`${p.file.name}-${i}`} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate text-muted">♪ {p.file.name}</span>
                      <span className={`${PENDING_STATE_CLASS[p.status]} shrink-0`}>{PENDING_STATE_TEXT[p.status]}</span>
                      {p.status === 'failed' && (
                        <button type="button" disabled={addingAudio}
                          onClick={() => void retryOne(i)}
                          className="text-gold hover:text-gold/80 shrink-0 disabled:opacity-40">
                          重试
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <Input type="text" value={newHintText} onChange={e => setNewHintText(e.target.value)}
                  className="text-caption" placeholder="播放提示（选填，多首共用）" />
                <Button type="button" onClick={handleAddAudios} loading={addingAudio}>
                  {addingAudio
                    ? `上传中 ${pendingFiles.filter(p => p.status !== 'queued').length}/${pendingFiles.length}`
                    : <><Plus className="mr-0.5 inline h-3 w-3" /> 添加 {pendingFiles.length} 首音频</>}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 删除音频确认（统一 ConfirmDialog，替换原手写遮罩弹窗） */}
      <ConfirmDialog
        open={deleteAudioId !== null}
        title="要删除这条音频吗？"
        description="删除后无法恢复"
        confirmText="确认删除"
        danger
        loading={deletingAudio}
        onConfirm={() => { if (deleteAudioId !== null) void handleDeleteAudio(deleteAudioId) }}
        onCancel={() => setDeleteAudioId(null)}
      />
    </>
  )
}
