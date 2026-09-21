import { useMemo } from 'react'

interface PetalSpec {
  left: number
  delay: number
  duration: number
  size: number
  drift: number
  tone: string
}

/**
 * 纯 CSS 樱花花瓣飘落装饰层（氛围细节）：
 * - pointer-events-none + aria-hidden，不拦截交互、不进可访问树；
 * - 花瓣参数确定性生成（无随机数，渲染可复现）；
 * - 尊重 prefers-reduced-motion（index.css 中 .petal 动画直接关闭）；
 * - 数量克制（默认 8 片），纯 CSS keyframes 驱动，不引 framer-motion。
 */
export function PetalsLayer({ count = 8 }: { count?: number }) {
  const petals = useMemo<PetalSpec[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: -((i * 1.7) % 14),
        duration: 11 + (i % 4) * 2.5,
        size: 7 + (i % 3) * 3,
        drift: ((i % 2) * 2 - 1) * (14 + (i % 3) * 8),
        tone: i % 2 === 0 ? 'rgb(var(--accent-primary) / 0.32)' : 'rgb(var(--gold-foil) / 0.20)',
      })),
    [count]
  )

  return (
    <div className="petals-layer" aria-hidden="true">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.25,
            background: `radial-gradient(circle at 30% 30%, ${p.tone}, transparent 72%)`,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            ['--drift' as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
