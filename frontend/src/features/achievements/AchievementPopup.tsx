import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Award } from 'lucide-react'
import type { AchievementUnlock } from '../../api/types'
import { paths } from '../../routes/paths'

/**
 * 右下角成就解锁弹层（仪式层）。
 * - 与顶部 Toast（操作反馈）完全隔离：位置、样式、语义均独立；
 * - 队列串行：每张 5s 自动消失，同屏最多 2 张（第 2 张为压栈的静态叠卡）；
 * - 点击跳个人页成就区。挂载于 AppLayout（路由 chunk，允许 framer）。
 */
export function AchievementPopup({ queue, dismiss }: {
  queue: AchievementUnlock[]
  dismiss: () => void
}) {
  const navigate = useNavigate()
  const current = queue[0] ?? null

  // 当前卡片展示满 5s 自动出队
  useEffect(() => {
    if (!current) return
    const timer = setTimeout(dismiss, 5000)
    return () => clearTimeout(timer)
  }, [current, dismiss])

  return (
    <div className="fixed bottom-4 right-4 z-float pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {queue.length > 1 && (
          <motion.div
            key="stack"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 0.45, x: 12, y: -10 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-0 right-0 w-64 h-16 rounded-xl border border-gold-foil/30 bg-ink-deep"
          />
        )}
        {current && (
          <motion.button
            key={current.key}
            initial={{ opacity: 0, x: 48, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 48, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={() => {
              dismiss()
              navigate(paths.profile())
            }}
            className="pointer-events-auto relative w-64 rounded-xl px-4 py-3 text-right border border-gold-foil/60 shadow-lg"
            style={{
              background: 'linear-gradient(160deg, rgb(var(--color-ink-deep)), rgb(var(--accent-bg-mid)))',
              boxShadow: '0 0 24px rgb(var(--gold-foil)/ 0.25), 0 8px 24px rgba(0,0,0,0.45)',
            }}
          >
            <div className="absolute top-0 left-0 w-full h-0.5 rounded-t-xl"
              style={{ background: 'linear-gradient(90deg, transparent, rgb(var(--gold-foil)), transparent)' }} />
            <p className="text-[10px] tracking-widest text-gold-foil/80 flex items-center justify-end gap-1">
              <Award size={11} /> 成就解锁
            </p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <div>
                <p className="text-sm font-serif font-bold text-gold">{current.title}</p>
              </div>
              <span className="text-2xl leading-none">{current.icon}</span>
            </div>
            {queue.length > 1 && (
              <p className="text-[10px] text-muted mt-1">还有 {queue.length - 1} 个成就待展示</p>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
