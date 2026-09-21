/**
 * 音频峰值提取（详情抽屉试听波形）。
 * 从音频 URL 拉取二进制并 Web Audio 解码 → 归一化峰值条。
 * 失败（CORS/格式/超大）返回 null——波形是增强展示，静默降级为无波形。
 */
export async function extractPeaks(url: string, bars = 28): Promise<number[] | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const buf = await resp.arrayBuffer()
    // 旧版 Safari 仅暴露 webkitAudioContext（命名化访问，见 ts-no-inline-cast-access 规则）
    const legacyWindow = window as unknown as { webkitAudioContext?: typeof AudioContext }
    const Ctx = window.AudioContext ?? legacyWindow.webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    try {
      const audio = await ctx.decodeAudioData(buf)
      const ch = audio.getChannelData(0)
      const step = Math.max(1, Math.floor(ch.length / bars))
      const peaks: number[] = []
      for (let i = 0; i < bars; i++) {
        let max = 0
        // 步进采样（每 16 取 1）平衡精度与耗时
        for (let j = i * step; j < Math.min((i + 1) * step, ch.length); j += 16) {
          const v = Math.abs(ch[j])
          if (v > max) max = v
        }
        peaks.push(Math.min(1, max * 1.8))
      }
      return peaks
    } finally {
      void ctx.close()
    }
  } catch {
    return null
  }
}
