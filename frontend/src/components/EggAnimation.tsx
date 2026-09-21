import { motion, AnimatePresence } from 'framer-motion'

interface EggEvent {
  id: number
  fromName: string
  targetName: string
  isMe: boolean // 我是目标
}

interface EggAnimationProps {
  event: EggEvent | null
}

export function EggAnimation({ event }: EggAnimationProps) {
  return (
    <AnimatePresence>
      {event && (
        <motion.div
          key={event.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-overlay flex items-center justify-center pointer-events-none bg-black/30">
          <motion.div
            initial={{ scale: 0, rotate: -180, y: -200 }}
            animate={{ scale: [0, 1.4, 1], rotate: [0, 20, -10, 0], y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 100 }}
            transition={{ duration: 0.6, ease: 'backOut' }}
            className="flex flex-col items-center gap-4"
          >
            {/* 鸡蛋 emoji 大图 */}
            <motion.div
              animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
              transition={{ duration: 0.5, delay: 0.4 }}
              style={{ fontSize: '5rem', lineHeight: 1 }}
            >
              🥚
            </motion.div>

            {/* 碎裂效果 */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              style={{ fontSize: '3rem' }}
            >
              💥
            </motion.div>

            {/* 说明文字 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center px-6 py-3 rounded-2xl bg-ink-deep/90 border border-warning/40"
            >
              {event.isMe ? (
                <p className="text-base font-serif text-warning/95">
                  😱 <strong>{event.fromName}</strong> 向你丢了一个鸡蛋！
                </p>
              ) : (
                <p className="text-base font-serif text-warning/90">
                  🥚 <strong>{event.fromName}</strong> 向 <strong>{event.targetName}</strong> 丢了一个鸡蛋！
                </p>
              )}
              <p className="text-tiny mt-1 text-body-text/40">
                {event.isMe ? '被砸中了' : '命中！'}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
