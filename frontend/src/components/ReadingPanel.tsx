import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, ProgressBar, type ProgressBarTone } from './ui'

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
  /** 音频重试耗尽时上报诊断，个人播放故障不改变房间进度 */
  onBufferError?: () => void
  isLastCard?: boolean
}

// intervalSec 保留 prop 供外部传入，ReadingPanel 内部仅用 audio timeupdate 驱动进度条
export function ReadingPanel({ hintText, audioUrl, startRatio, intervalSec: _intervalSec, isActive, isPaused, countdown, intervalCountdown, onAudioEnded, onBufferError, isLastCard }: ReadingPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const tryPlayRef = useRef<(() => void) | null>(null)
  const playbackStateRef = useRef({ isActive, isPaused })
  playbackStateRef.current = { isActive, isPaused }
  const [audioError, setAudioError] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [progress, setProgress] = useState(0)

  // 音频加载和播放（含重试机制）
  useEffect(() => {
    const audio = audioRef.current
    setAudioError(false)
    setProgress(0)
    if (!audio || !audioUrl) return
    let cancelled = false

    audio.pause()
    audio.currentTime = 0

    // 加载并播放
    audio.src = audioUrl
    audio.load()

    // 随机片段：加载完 metadata 后 seek 到指定位置
    const seekHandler = () => {
      if (startRatio && startRatio > 0 && audio.duration && isFinite(audio.duration)) {
        audio.currentTime = audio.duration * startRatio
      }
    }
    audio.addEventListener('loadedmetadata', seekHandler, { once: true })

    let retryCount = 0
    let playPending = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const tryPlay = () => {
      if (cancelled || playPending || !playbackStateRef.current.isActive || playbackStateRef.current.isPaused) return
      clearTimeout(retryTimer)
      playPending = true
      audio.play().then(() => {
        playPending = false
        if (cancelled) return
        retryCount = 0
        setAudioError(false)
        setAutoplayBlocked(false)
      }).catch((error: unknown) => {
        playPending = false
        if (cancelled) return
        const name = error instanceof Error || error instanceof DOMException ? error.name : ''
        if (name === 'NotAllowedError') {
          // 刷新后的移动浏览器需要用户手势解锁声音，无需重试或上报媒体故障。
          setAutoplayBlocked(true)
          return
        }
        if (name === 'AbortError' || playbackStateRef.current.isPaused || !playbackStateRef.current.isActive) return
        retryCount++
        if (retryCount < 3) {
          retryTimer = setTimeout(tryPlay, 1000)
        } else {
          setAudioError(true)
          onBufferError?.()
        }
      })
    }
    tryPlayRef.current = tryPlay

    const ended = () => onAudioEnded?.()
    audio.addEventListener('ended', ended)
    // play() 会等待媒体就绪；立即尝试才能在浏览器限制预加载时也显示解锁入口。
    tryPlay()

    return () => {
      cancelled = true
      tryPlayRef.current = null
      clearTimeout(retryTimer)
      audio.removeEventListener('ended', ended)
      audio.removeEventListener('loadedmetadata', seekHandler)
      audio.pause()
    }
  }, [audioUrl, startRatio, onAudioEnded, onBufferError])

  // 暂停/继续音频
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPaused || !isActive) audio.pause()
    else if (audioUrl) tryPlayRef.current?.()
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

  // 读牌进度三态原样回归：常态 0-65 金 / 吃紧 65-85 橙 / 紧急 85-100 红（ProgressBar danger 档）
  const barTone: ProgressBarTone = progress > 85 ? 'danger' : progress > 65 ? 'warning' : 'gold'

  return (
    <div className="relative border-b border-border/60 bg-gradient-to-b from-accent-bg-mid/98 to-accent-bg-end/95">
      <audio ref={audioRef} onError={() => setAudioError(true)} preload="auto" style={{ display: 'none' }} />

      {/* 最后一张牌提示横幅 */}
      <AnimatePresence>
        {isLastCard && isActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-1.5 bg-gradient-to-r from-danger/60 via-danger/40 to-danger/60 border-b border-danger/40"
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
                  {hintText ? (
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

              {autoplayBlocked && (
                <div className="mt-2 flex justify-center">
                  <Button type="button" size="sm" variant="outline" disabled={isPaused}
                    onClick={() => tryPlayRef.current?.()}>开启声音</Button>
                </div>
              )}
              {audioError && (
                <p className="mt-2 text-center text-crimson text-caption">音频加载失败，可凭提示找牌</p>
              )}

              {/* 进度条：统一 ProgressBar（tone 承接三态配色，shimmer 承接光扫） */}
              <ProgressBar className="mt-3" value={progress} tone={barTone} shimmer />
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
      <div className="h-px bg-accent-line" />
    </div>
  )
}
