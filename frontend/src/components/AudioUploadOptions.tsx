import { useState, useEffect } from 'react'
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
    <div className="border border-border rounded-lg p-3 space-y-3" style={{ background: 'rgba(var(--accent-bg),0.1)' }}>
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs">⚙️ 音频处理</span>
        {duration !== null && (
          <span className="text-gold/60 text-xs">
            时长 {formatDuration(duration)}
          </span>
        )}
        {loadingDuration && (
          <span className="text-muted/40 text-xs">读取中...</span>
        )}
      </div>

      {/* 压缩 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={compress}
          onChange={e => setCompress(e.target.checked)}
          disabled={processing}
          className="accent-pink-500 w-3.5 h-3.5"
        />
        <span className="text-white/80 text-xs">压缩为 MP3 (128kbps)</span>
        <span className="text-muted/50 text-xs ml-auto">减小体积</span>
      </label>

      {/* 裁剪 */}
      <div className="space-y-1.5">
        <span className="text-muted text-xs">裁剪：</span>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'none', label: '不裁剪' },
            { value: 'first30', label: '前 30s' },
            { value: 'random30', label: '随机 30s' },
          ] as const).map(opt => (
            <label key={opt.value}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-all ${
                trim === opt.value
                  ? 'bg-gold/20 text-gold border border-gold/40'
                  : 'bg-white/5 text-white/50 border border-transparent hover:border-white/10'
              } ${(opt.value !== 'none' && tooShort) || processing ? 'opacity-40 cursor-not-allowed' : ''}`}>
              <input
                type="radio"
                name="trim"
                value={opt.value}
                checked={trim === opt.value}
                onChange={() => setTrim(opt.value)}
                disabled={processing || (opt.value !== 'none' && tooShort)}
                className="hidden"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {tooShort && (
          <p className="text-muted/50 text-xs">音频不足 30 秒，无法裁剪</p>
        )}
      </div>

      {/* 处理进度 */}
      {processing && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gold text-xs">处理中...</span>
            <span className="text-gold/60 text-xs">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-500 to-gold rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progress * 100, 2)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
