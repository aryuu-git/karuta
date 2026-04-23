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
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.3)' }}
        >
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
              className="text-center px-6 py-3 rounded-2xl"
              style={{ background: 'rgba(20,5,15,0.9)', border: '1px solid rgba(255,165,0,0.4)' }}
            >
              {event.isMe ? (
                <p className="text-base font-serif" style={{ color: 'rgba(255,200,100,0.95)' }}>
                  😱 <strong>{event.fromName}</strong> 向你丢了一个鸡蛋！
                </p>
              ) : (
                <p className="text-base font-serif" style={{ color: 'rgba(255,200,100,0.9)' }}>
                  🥚 <strong>{event.fromName}</strong> 向 <strong>{event.targetName}</strong> 丢了一个鸡蛋！
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {event.isMe ? '(╥_╥) 怎么是我啊！！！' : '哈哈哈 (≧▽≦)'}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
