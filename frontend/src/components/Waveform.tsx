/**
 * 迷你波形条（详情抽屉音频行内联展示）：div 条形实现（免 canvas 生命周期），
 * 已播部分金色高亮，未播部分弱化。peaks 为 null 时不渲染（静默降级）。
 */
export function Waveform({ peaks, progress }: {
  peaks: number[] | null
  progress?: number
}) {
  if (!peaks || peaks.length === 0) return null
  const played = Math.round((progress ?? 0) * peaks.length)
  return (
    <div className="flex items-end gap-px h-4 w-full" aria-hidden>
      {peaks.map((p, i) => (
        <div key={i}
          className="flex-1 rounded-sm transition-colors"
          style={{
            height: `${Math.max(12, p * 100)}%`,
            background: i < played ? 'rgb(var(--color-gold))' : 'rgb(var(--color-gold)/ 0.25)',
          }} />
      ))}
    </div>
  )
}
