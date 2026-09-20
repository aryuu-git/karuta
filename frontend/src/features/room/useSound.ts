import { useCallback, useRef } from 'react'

/** 音效类型：grab_ok/grab_fail/card_start/game_over 四音效 */
export type SoundType = 'grab_ok' | 'grab_fail' | 'card_start' | 'game_over'

/**
 * 音效工具（用 Web Audio API 生成简单音效，不依赖外部文件）。
 * AudioContext 懒初始化；不支持时静默失败。
 */
export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)
  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new AudioContext()
    return ctxRef.current
  }
  const play = useCallback((type: SoundType) => {
    try {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      const now = ctx.currentTime
      switch (type) {
        case 'grab_ok':
          // 上升双音——成功感
          osc.type = 'sine'
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.linearRampToValueAtTime(660, now + 0.12)
          gain.gain.setValueAtTime(0.3, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.25)
          osc.start(now); osc.stop(now + 0.25)
          break
        case 'grab_fail':
          // 下降短音——惩罚感
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(300, now)
          osc.frequency.linearRampToValueAtTime(150, now + 0.18)
          gain.gain.setValueAtTime(0.25, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.2)
          osc.start(now); osc.stop(now + 0.2)
          break
        case 'card_start':
          // 轻柔提示音
          osc.type = 'sine'
          osc.frequency.setValueAtTime(523, now)
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.linearRampToValueAtTime(0, now + 0.15)
          osc.start(now); osc.stop(now + 0.15)
          break
        case 'game_over':
          // 三连升调
          const freqs = [523, 659, 784]
          freqs.forEach((f, i) => {
            const o2 = ctx.createOscillator()
            const g2 = ctx.createGain()
            o2.connect(g2); g2.connect(ctx.destination)
            o2.type = 'sine'
            o2.frequency.value = f
            g2.gain.setValueAtTime(0.2, now + i * 0.15)
            g2.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.25)
            o2.start(now + i * 0.15); o2.stop(now + i * 0.15 + 0.25)
          })
          break
      }
    } catch { /* AudioContext 不支持时静默失败 */ }
  }, [])
  return play
}
