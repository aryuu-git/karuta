import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

/**
 * 统一对话框：portal 渲染 + 遮罩 + Esc 关闭 + 进出场动画。
 * 尺寸档位对应设计系统圆角 token（xl=12px）。
 */
export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** 关闭按钮（默认展示） */
  closable?: boolean
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  /** 底部操作区 */
  actions?: ReactNode
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Dialog({
  open,
  onClose,
  title,
  closable = true,
  size = 'md',
  children,
  actions,
}: DialogProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open || !closable) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closable, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          onClick={closable ? onClose : undefined}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            className={`w-full ${sizeClasses[size]} rounded-xl border border-border bg-ink-deep shadow-card overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || closable) && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                <h3 className="font-serif text-title text-gold">{title}</h3>
                {closable && (
                  <button
                    onClick={onClose}
                    className="text-muted hover:text-crimson transition-colors duration-fast p-1 rounded focus-visible:shadow-gold"
                    aria-label="关闭"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            )}
            <div className="px-6 py-5">{children}</div>
            {actions && (
              <div className="flex justify-end gap-3 px-6 py-4 border-t border-border/50">
                {actions}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
