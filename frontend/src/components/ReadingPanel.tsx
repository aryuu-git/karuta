import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ReadingPanelProps {
  hintText: string | null
  audioUrl: string | null
  intervalSec: number
  isActive: boolean
  isPaused: boolean
  countdown: number | null
  intervalCountdown: number | null
  onAudioEnded?: () => void
  isLastCard?: boolean
}

// intervalSec 保留 prop 供外部传入，ReadingPanel 内部仅用 audio timeupdate 驱动进度条
export function ReadingPanel({ hintText, audioUrl, intervalSec: _intervalSec, isActive, isPaused, countdown, intervalCountdown, onAudioEnded, isLastCard }: ReadingPanelProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [audioError, setAudioError] = useState(false)
  const [progress, setProgress] = useState(0)

  // 音频加载和播放（含重试机制）
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    setAudioError(false)
    setProgress(0)
    audio.pause()
    audio.currentTime = 0
    audio.src = audioUrl
    audio.load()

    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout>

    const tryPlay = () => {
      audio.play().catch(() => {
        retryCount++
        if (retryCount < 3) {
          retryTimer = setTimeout(tryPlay, 1000)
        } else {
          setAudioError(true)
        }
      })
    }

    const ended = () => onAudioEnded?.()
    audio.addEventListener('canplaythrough', tryPlay, { once: true })
    audio.addEventListener('ended', ended)
    return () => {
      clearTimeout(retryTimer)
      audio.removeEventListener('canplaythrough', tryPlay)
      audio.removeEventListener('ended', ended)
      audio.pause()
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
    ? 'linear-gradient(90deg, #ff6b6b, #ff8e53)'
    : urgency === 'warning'
    ? 'linear-gradient(90deg, #f5a623, #f5c6d0)'
    : 'linear-gradient(90deg, #e8a4b8, #f5c6d0, #e8a4b8)'

  return (
    <div className="relative border-b border-border/60" style={{ background: 'linear-gradient(180deg, rgba(32,8,20,0.98) 0%, rgba(45,10,26,0.95) 100%)' }}>
      <audio ref={audioRef} onError={() => setAudioError(true)} preload="auto" style={{ display: 'none' }} />

      {/* 最后一张牌提示横幅 */}
      <AnimatePresence>
        {isLastCard && isActive && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
            className="absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-2 py-1.5"
            style={{ background: 'linear-gradient(90deg, rgba(192,57,43,0.6), rgba(231,76,60,0.4), rgba(192,57,43,0.6))', borderBottom: '1px solid rgba(231,76,60,0.4)' }}
          >
            <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>🔥</motion.span>
            <span className="text-white text-xs font-medium tracking-widest">
              最后一张！网速对决开始！(ง •̀_•́)ง
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
            className="absolute inset-0 flex flex-col items-center justify-center z-20"
            style={{ background: 'rgba(20,5,15,0.92)', backdropFilter: 'blur(4px)' }}>
            <motion.span
              animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.4 }}
              className="font-serif font-bold tabular-nums"
              style={{ fontSize: '5rem', lineHeight: 1, color: '#e8a4b8', textShadow: '0 0 60px rgba(232,164,184,0.8), 0 0 120px rgba(232,164,184,0.4)' }}>
              {countdown}
            </motion.span>
            <span className="text-muted text-sm mt-2 tracking-widest">深呼吸… 全神贯注！(ง •̀_•́)ง</span>
          </motion.div>
        )}
        {countdown === 0 && (
          <motion.div key="go"
            initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.35, ease: 'backOut' }}
            className="absolute inset-0 flex items-center justify-center z-20"
            style={{ background: 'rgba(20,5,15,0.85)', backdropFilter: 'blur(4px)' }}>
            <span className="font-serif font-bold text-gold"
              style={{ fontSize: '3.5rem', textShadow: '0 0 40px rgba(232,164,184,1)' }}>
              開始！(ง •̀_•́)ง
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
                    <span className="text-crimson text-sm">😣 音频加载失败 (；′⌒`) 靠直觉找牌！</span>
                  ) : hintText ? (
                    <motion.p initial={{ opacity: 0, letterSpacing: '0.1em' }} animate={{ opacity: 1, letterSpacing: '0.3em' }}
                      transition={{ duration: 0.4 }}
                      className="font-serif text-2xl sm:text-3xl font-medium text-white tracking-widest drop-shadow-lg"
                      style={{ textShadow: '0 2px 20px rgba(232,164,184,0.3)' }}>
                      {hintText}
                    </motion.p>
                  ) : (
                    <p className="text-muted text-base font-serif tracking-widest animate-pulse">
                      ♪ 竖起耳朵！快找到那张牌！(ง •̀_•́)ง
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
                  <span className="font-serif tracking-widest text-sm">喘口气，深呼吸～ (´-ω-`) 暂停中…</span>
                </div>
              ) : intervalCountdown !== null ? (
                <div className="flex items-center gap-4">
                  <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}
                    className="text-muted font-serif tracking-widest text-sm">
                    下一张牌即将来袭，做好准备！
                  </motion.div>
                  <motion.div
                    key={intervalCountdown}
                    initial={{ scale: 1.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.25, ease: 'backOut' }}
                    className="font-serif font-bold tabular-nums"
                    style={{ fontSize: '1.8rem', color: intervalCountdown <= 3 ? '#e8a4b8' : 'rgba(255,255,255,0.5)', textShadow: intervalCountdown <= 3 ? '0 0 20px rgba(232,164,184,0.6)' : 'none' }}>
                    {intervalCountdown}
                  </motion.div>
                </div>
              ) : (
                <motion.div animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  <span className="font-serif tracking-widest text-muted text-sm">蓄势待发… (´。• ω •。`)</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 底部装饰线 */}
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(232,164,184,0.4), transparent)' }} />
    </div>
  )
}
