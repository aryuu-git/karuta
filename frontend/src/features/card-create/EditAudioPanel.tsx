import { useState, useRef, type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Input } from '../../components/ui'
import { api } from '../../api/client'
import type { CardAudio } from '../../api/types'
import { UploadZone, isAudioFile } from './UploadZone'
import { Music, Play, Pause, Plus, Check, Trash2 } from 'lucide-react'

interface EditAudioPanelProps {
  cardId: number
  audios: CardAudio[]
  onAudiosChange: Dispatch<SetStateAction<CardAudio[]>>
  playingAudioId: number | null
  onTogglePlay: (audio: CardAudio) => void
}

/**
 * 编辑模式音频管理面板：音频列表/提示就地编辑/追加音频/删除确认流
 * 拉取与变更均直连卡片 API，音频列表经由 onAudiosChange 回写页面状态
 */
export function EditAudioPanel({ cardId, audios, onAudiosChange, playingAudioId, onTogglePlay }: EditAudioPanelProps) {
  const [newAudioFiles, setNewAudioFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [newHintText, setNewHintText] = useState('')
  const [newProcessing] = useState(false)
  const [addingAudio, setAddingAudio] = useState(false)
  const newAudioInputRef = useRef<HTMLInputElement>(null)

  // Delete audio confirm
  const [deleteAudioId, setDeleteAudioId] = useState<number | null>(null)
  const [deletingAudio, setDeletingAudio] = useState(false)

  /** 逐个上传追加的音频文件并合并进列表，结束后清空选择与输入 */
  const handleAddAudios = async () => {
    if (newAudioFiles.length === 0) return
    setAddingAudio(true)
    setUploadProgress(0)
    try {
      for (let i = 0; i < newAudioFiles.length; i++) {
        setUploadProgress(i + 1)
        const formData = new FormData()
        formData.append('audio', newAudioFiles[i])
        if (newHintText.trim()) formData.append('hint_text', newHintText.trim())
        const newAudio = await api.cards.addAudio(cardId, formData)
        onAudiosChange(prev => [...prev, newAudio])
      }
      setNewAudioFiles([])
      setNewHintText('')
      if (newAudioInputRef.current) newAudioInputRef.current.value = ''
    } catch { /* ignore */ }
    finally { setAddingAudio(false) }
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
        <h2 className="text-gold text-sm font-medium mb-3"><Music className="mr-1 inline h-3.5 w-3.5" /> 音频列表 ({audios.length} 条)</h2>
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
                  className="text-gold/60 hover:text-gold text-sm px-2 py-1 rounded hover:bg-gold/10 transition-all shrink-0"
                  title={playingAudioId === audio.id ? '暂停' : '播放'}>
                  {playingAudioId === audio.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
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
                          onAudiosChange(prev => prev.map(a => a.id === audio.id ? { ...a, hint_text: newHint } : a))
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
          <h3 className="text-gold/80 text-xs font-medium mb-3"><Plus className="mr-0.5 inline h-3 w-3" /> 添加新音频</h3>
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
              onFiles={files => { if (files.length > 0) setNewAudioFiles(files) }}>
              {newAudioFiles.length > 0 ? (
                <p className="text-gold/80 text-xs"><Check className="mr-0.5 inline h-3 w-3" /> 已选 {newAudioFiles.length} 个文件</p>
              ) : (
                <>
                  <p className="text-muted text-xs"><Music className="mr-0.5 inline h-3 w-3" /> 拖拽音频到这里，或点击选择</p>
                  <p className="text-muted/40 text-[10px] mt-1">支持同时选择多个文件</p>
                </>
              )}
            </UploadZone>
            {newAudioFiles.length > 0 && (
              <>
                <div className="text-xs text-muted space-y-1 max-h-20 overflow-y-auto">
                  {newAudioFiles.map((f, i) => <p key={i} className="truncate">♪ {f.name}</p>)}
                </div>
                <Input type="text" value={newHintText} onChange={e => setNewHintText(e.target.value)}
                  className="text-sm" placeholder="播放提示（选填，多首共用）" />
                <Button type="button" onClick={handleAddAudios}
                  loading={addingAudio} disabled={newProcessing}>
                  {addingAudio ? `添加中… (${uploadProgress}/${newAudioFiles.length})` : <><Plus className="mr-0.5 inline h-3 w-3" /> 添加 {newAudioFiles.length} 首音频</>}
                </Button>
              </>
            )}
          </div>
        </div>
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
              <div className="flex justify-center mb-3"><Trash2 className="h-8 w-8" /></div>
              <p className="text-white font-medium mb-1">要删除这条音频吗？</p>
              <p className="text-muted text-sm mb-5">删除后无法恢复。</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteAudioId(null)}>取消</Button>
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
    </>
  )
}
