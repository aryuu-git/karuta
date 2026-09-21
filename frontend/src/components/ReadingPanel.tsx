import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ReadingPanelProps {
  hintText: string | null
  audioUrl: string | null
  startRatio?: number
  intervalSec: number
  isActive: boolean
  isPaused: boolean
  countdown: number | null
  intervalCountdown: number | null
  onAudioEnded?: () => void
  /** B1：音频重试耗尽（缓冲失败）时上报服务端，服务端可提前切首防卡死 */
  onBufferError?: () => void
  isLastCard?: boolean
}

// intervalSec 保留 prop 供外部传入，ReadingPanel 内部仅用 audio timeupdate 驱动进度条
export function ReadingPanel({ hintText, audioUrl, startRatio, intervalSec: _intervalSec, isActive, isPaused, countdown, intervalCountdown, onAudioEnded, onBufferError, isLastCard }: ReadingPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [audioError, setAudioError] = useState(false)
  const [progress, setProgress] = useState(0)

  // 音频加载和播放（含重试机制）
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    let cancelled = false

    setAudioError(false)
    setProgress(0)
    audio.pause()
    audio.currentTime = 0

    // 加载并播放
    audio.src = audioUrl
    audio.load()

      // 随机片段：加载完 metadata 后 seek 到指定位置
      const currentStartRatio = startRatio
      const seekHandler = () => {
        if (currentStartRatio && currentStartRatio > 0 && audio.duration && isFinite(audio.duration)) {
          audio.currentTime = audio.duration * currentStartRatio
        }
      }
      audio.addEventListener('loadedmetadata', seekHandler, { once: true })

      let retryCount = 0
      let retryTimer: ReturnType<typeof setTimeout>

      const tryPlay = () => {
        if (cancelled) return
        audio.play().catch(() => {
          retryCount++
          if (retryCount < 3 && !cancelled) {
            retryTimer = setTimeout(tryPlay, 1000)
          } else if (!cancelled) {
            setAudioError(true)
            onBufferError?.()
          }
        })
      }

      const ended = () => onAudioEnded?.()
      audio.addEventListener('canplaythrough', tryPlay, { once: true })
      audio.addEventListener('ended', ended)

      // cleanup 存到外层
      cleanupRef.current = () => {
        clearTimeout(retryTimer)
        audio.removeEventListener('canplaythrough', tryPlay)
        audio.removeEventListener('ended', ended)
        audio.removeEventListener('loadedmetadata', seekHandler)
        audio.pause()
      }

    return () => {
      cancelled = true
      cleanupRef.current?.()
    }
  }, [audioUrl, onAudioEnded])

  // 暂停/继续音频
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPaused) audio.pause()
    else if (isActive && audioUrl) audio.play().catch(() => null)
  }, [isPaused, isActive, audioUrl])

  // 进度条：跟随音频实际播放进度（currentTime / duration）
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isActive || !audioUrl) { setProgress(0); return }
    const updateProgress = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setProgress((audio.currentTime / audio.duration) * 100)
      }
    }
    audio.addEventListener('timeupdate', updateProgress)
    return () => audio.removeEventListener('timeupdate', updateProgress)
  }, [isActive, audioUrl])

  useEffect(() => { setProgress(0) }, [audioUrl])

  const urgency = progress > 85 ? 'urgent' : progress > 65 ? 'warning' : 'normal'
  const barColor = urgency === 'urgent'
    ? 'linear-gradient(90deg, rgb(var(--color-danger)), rgb(var(--color-danger)/ 0.8))'
    : urgency === 'warning'
    ? 'linear-gradient(90deg, rgb(var(--color-warning)), rgb(var(--color-gold-light)))'
    : 'linear-gradient(90deg, rgb(var(--color-gold)), rgb(var(--color-gold-light)), rgb(var(--color-gold)))'

  return (
    <div className="relative border-b border-border/60" style={{ background: 'linear-gradient(180deg, rgb(var(--accent-bg-mid)/ 0.98) 0%, rgb(var(--accent-bg-end)/ 0.95) 100%)' }}>
      <audio ref={audioRef} onError={() => setAudioError(true)} preload="auto" style={{ display: 'none' }} />

      {/* 最后一张牌提示横幅 */}
      <AnimatePresence>
        {isLastCard && isActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-1.5"
            style={{ background: 'linear-gradient(90deg, rgb(var(--color-danger)/ 0.6), rgb(var(--color-danger)/ 0.4), rgb(var(--color-danger)/ 0.6))', borderBottom: '1px solid rgb(var(--color-danger)/ 0.4)' }}
          >
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>🔥</motion.span>
            <span className="text-body-text text-tiny font-medium tracking-widest">
              最后一张牌
            </span>
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}>🔥</motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 倒计时全屏遮罩 */}
      <AnimatePresence>
        {countdown !== null && countdown > 0 && (
          <motion.div key={`cd-${countdown}`}
            initial={{ opacity: 0, scale: 2.5 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }} transition={{ duration: 0.3, ease: 'backOut' }}
            className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-ink-deep/90 backdrop-blur">
            <motion.span
              animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.4 }}
              className="font-serif font-bold tabular-nums text-gold"
              style={{ fontSize: '5rem', lineHeight: 1, textShadow: '0 0 60px rgb(var(--accent-primary)/ 0.8), 0 0 120px rgb(var(--accent-primary)/ 0.4)' }}>
              {countdown}
            </motion.span>
            <span className="text-muted text-caption mt-2 tracking-widest">准备开始</span>
          </motion.div>
        )}
        {countdown === 0 && (
          <motion.div key="go"
            initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35, ease: 'backOut' }}
            className="absolute inset-0 flex items-center justify-center z-20 bg-ink-deep/85 backdrop-blur">
            <span className="font-serif font-bold text-gold"
              style={{ fontSize: '3.5rem', textShadow: '0 0 40px rgb(var(--accent-primary)/ 1)' }}>
              開始！
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-5xl mx-auto px-6 py-4">
        <AnimatePresence mode="wait">
          {isActive ? (
            <motion.div key={audioUrl ?? 'card'}
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3 }}>

              <div className="flex items-center gap-3 min-h-[3rem]">
                {/* 音符图标 */}
                <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="text-gold text-xl shrink-0">♪</motion.div>

                {/* 上句文字 */}
                <div className="flex-1 text-center">
                  {audioError ? (
                    <span className="text-crimson text-caption">音频加载失败，可凭提示找牌</span>
                  ) : hintText ? (
                    <motion.p initial={{ opacity: 0, letterSpacing: '0.1em' }} animate={{ opacity: 1, letterSpacing: '0.3em' }}
                      transition={{ duration: 0.4 }}
                      className="font-serif text-2xl sm:text-3xl font-medium text-body-text tracking-widest drop-shadow-lg"
                      style={{ textShadow: '0 2px 20px rgb(var(--accent-primary)/ 0.3)' }}>
                      {hintText}
                    </motion.p>
                  ) : (
                    <p className="text-muted text-base font-serif tracking-widest animate-pulse">
                      ♪ 仔细听，找到那张牌
                    </p>
                  )}
                </div>

                <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.75 }}
                  className="text-gold text-xl shrink-0">♪</motion.div>
              </div>

              {/* 进度条 */}
              <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full relative overflow-hidden"
                  style={{ width: `${progress}%`, background: barColor }}
                  transition={{ duration: 0.05, ease: 'linear' }}>
                  {/* 光晕扫描效果 */}
                  <motion.div className="absolute inset-0 bg-white/30"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    style={{ width: '40%' }} />
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center justify-center min-h-[3rem]">
              {isPaused ? (
                <div className="flex items-center gap-3 text-muted">
                  <span className="text-xl">⏸</span>
                  <span className="font-serif tracking-widest text-caption">已暂停</span>
                </div>
              ) : intervalCountdown !== null ? (
                <div className="flex items-center gap-4">
                  <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}
                    className="text-muted font-serif tracking-widest text-caption">
                    下一首即将开始
                  </motion.div>
                  <motion.div
                    key={intervalCountdown}
                    initial={{ scale: 1.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.25, ease: 'backOut' }}
                    className={`font-serif font-bold tabular-nums ${intervalCountdown <= 3 ? 'text-gold' : 'text-body-text/50'}`}
                    style={{ fontSize: '1.8rem', textShadow: intervalCountdown <= 3 ? '0 0 20px rgb(var(--accent-primary)/ 0.6)' : 'none' }}>
                    {intervalCountdown}
                  </motion.div>
                </div>
              ) : (
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <span className="font-serif tracking-widest text-muted text-caption">等待下一首…</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部装饰线 */}
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--accent-primary)/ 0.4), transparent)' }} />
    </div>
  )
}
