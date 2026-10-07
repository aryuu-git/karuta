import { useState, useEffect } from 'react'
import { OptionCard, ProgressBar } from './ui'
import { getAudioDuration, isWasmSupported } from '../utils/audioProcessor'
import type { ProcessOptions } from '../utils/audioProcessor'

interface AudioUploadOptionsProps {
  audioFile: File | null
  onChange: (options: ProcessOptions) => void
  processing: boolean
  progress: number
}

export function AudioUploadOptions({ audioFile, onChange, processing, progress }: AudioUploadOptionsProps) {
  const [compress, setCompress] = useState(false)
  const [trim, setTrim] = useState<'none' | 'first30' | 'random30'>('none')
  const [duration, setDuration] = useState<number | null>(null)
  const [loadingDuration, setLoadingDuration] = useState(false)

  const wasmOk = isWasmSupported()
  const tooShort = duration !== null && duration <= 30

  useEffect(() => {
    if (!audioFile) {
      setDuration(null)
      return
    }
    setLoadingDuration(true)
    getAudioDuration(audioFile)
      .then(d => setDuration(d))
      .catch(() => setDuration(null))
      .finally(() => setLoadingDuration(false))
  }, [audioFile])

  useEffect(() => {
    onChange({ compress, trim })
  }, [compress, trim])

  if (!audioFile || !wasmOk) return null

  const formatDuration = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${min}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-3 bg-ink-deep/10">
      <div className="flex items-center justify-between">
        <span className="text-muted text-tiny">⚙️ 音频处理</span>
      </div>

      {/* 压缩（统一 OptionCard；children 区承载音频时长 / 处理状态） */}
      <OptionCard
        selected={compress}
        onSelect={() => setCompress(prev => !prev)}
        selection="checkbox"
        allowReselect
        title="压缩为 MP3 (128kbps)"
        desc="减小体积"
        disabled={processing}
      >
        {duration !== null && (
          <span className="text-gold/60 text-tiny">时长 {formatDuration(duration)}</span>
        )}
        {loadingDuration && (
          <span className="text-muted/40 text-tiny">读取中...</span>
        )}
      </OptionCard>

      {/* 裁剪 */}
      <div className="space-y-1.5">
        <span className="text-muted text-tiny">裁剪：</span>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'none', label: '不裁剪' },
            { value: 'first30', label: '前 30s' },
            { value: 'random30', label: '随机 30s' },
          ] as const).map(opt => (
            <OptionCard
              key={opt.value}
              selected={trim === opt.value}
              onSelect={() => setTrim(opt.value)}
              selection="radio"
              title={opt.label}
              disabled={processing || (opt.value !== 'none' && tooShort)}
              className="justify-center"
            />
          ))}
        </div>
        {tooShort && (
          <p className="text-muted/50 text-tiny">音频不足 30 秒，无法裁剪</p>
        )}
      </div>

      {/* 处理进度 */}
      {processing && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gold text-tiny">转码中…</span>
            <span className="text-gold/60 text-tiny">{Math.round(progress * 100)}%</span>
          </div>
          <ProgressBar value={progress * 100} tone="gold" />
        </div>
      )}
    </div>
  )
}
