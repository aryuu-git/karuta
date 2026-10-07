import { motion } from 'framer-motion'
import { Scrim } from '../../components/ui'

/** 打乱提示遮罩：牌面重排时的全屏短暂动效（shuffleBlocking 为 true 时渲染） */
export function ShuffleOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay flex items-center justify-center pointer-events-none"
    >
      {/* 统一覆盖遮罩（tone=overlay）；提示层不吃点击，内容置于其上 */}
      <Scrim tone="overlay" className="pointer-events-none" />
      <motion.div
        initial={{ scale: 0.5, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 12 }}
        className="relative z-modal text-center"
      >
        <span className="text-5xl sm:text-7xl font-bold font-serif text-gold"
          style={{ textShadow: '0 0 40px rgb(var(--accent-primary)/ 0.6)' }}>
          🌀 打乱牌面
        </span>
      </motion.div>
    </motion.div>
  )
}
