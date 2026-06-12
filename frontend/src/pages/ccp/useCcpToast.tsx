import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type ToastType = 'success' | 'fail' | 'info'

interface ToastState {
  text: string
  type: ToastType
  id: number
}

/**
 * CCP 通用 toast 反馈，复用 karuta 主屏（RoomPage）的视觉规范。
 * 返回 showToast 函数和需要渲染的 <ToastView />。
 */
export function useCcpToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const counter = useRef(0)

  const showToast = useCallback((text: string, type: ToastType = 'info', ms = 2200) => {
    const id = ++counter.current
    setToast({ text, type, id })
    setTimeout(() => setToast(prev => (prev?.id === id ? null : prev)), ms)
  }, [])

  const ToastView = (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id}
          initial={{ opacity: 0, y: 20, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ duration: 0.25, ease: 'backOut' }}
          className="fixed bottom-20 md:top-24 md:bottom-auto left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
          style={{ minWidth: '180px', maxWidth: '280px' }}>
          <div className={[
            'px-5 py-3 rounded-2xl text-sm font-medium text-center shadow-2xl backdrop-blur-md',
            toast.type === 'success'
              ? 'border border-gold/50 text-white'
              : toast.type === 'fail'
                ? 'border border-crimson/50 text-white'
                : 'border border-white/10 text-white/80',
          ].join(' ')}
            style={{
              background: toast.type === 'success'
                ? 'linear-gradient(135deg, rgba(var(--glow-color),0.3), rgba(var(--accent-primary),0.2))'
                : toast.type === 'fail'
                  ? 'linear-gradient(135deg, rgba(192,57,43,0.35), rgba(231,76,60,0.2))'
                  : 'rgba(var(--accent-bg-mid),0.85)',
              boxShadow: toast.type === 'success'
                ? '0 0 30px rgba(var(--accent-primary),0.3), 0 8px 24px rgba(0,0,0,0.5)'
                : toast.type === 'fail'
                  ? '0 0 30px rgba(192,57,43,0.3), 0 8px 24px rgba(0,0,0,0.5)'
                  : '0 8px 24px rgba(0,0,0,0.5)',
            }}>
            {toast.text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return { showToast, ToastView }
}
