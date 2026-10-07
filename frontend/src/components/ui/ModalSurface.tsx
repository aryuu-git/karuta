import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Scrim, type ScrimTone } from './Scrim'
import { PanelSurface } from './PanelSurface'

/**
 * 统一模态壳：Scrim + ink-deep 面板 + 进出场动画 + 可选标题头。
 * 收编各模态自绘的「遮罩 + 面板」组合（Changelog / DuelGive / CustomTagDialog 等）。
 * 仪式瞬间（结算页）可经 className 扩展面板，但结构与 surface 统一。
 */
export interface ModalSurfaceProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  actions?: ReactNode
  /** sm=max-w-xs；md=max-w-md；lg=max-w-2xl；xl=max-w-4xl */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** 内容区内边距，默认 md */
  padding?: 'none' | 'sm' | 'md'
  /** 点遮罩关闭（默认 true） */
  closable?: boolean
  scrim?: ScrimTone
  /** 面板扩展类名 */
  className?: string
  children: ReactNode
}

const sizeClasses = { sm: 'max-w-xs', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }
const paddingClasses = { none: '', sm: 'p-4', md: 'p-5' }

export function ModalSurface({
  open,
  onClose,
  title,
  actions,
  size = 'md',
  padding = 'md',
  closable = true,
  scrim = 'modal',
  className = '',
  children,
}: ModalSurfaceProps) {
  // ESC 关闭（与遮罩点击同语义）
  useEffect(() => {
    if (!open || !closable) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closable, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-modal flex items-center justify-center px-4">
          <Scrim tone={scrim} onClick={closable ? onClose : undefined} />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative z-modal flex w-full justify-center"
            onClick={e => e.stopPropagation()}
          >
            <PanelSurface
              variant="ink-deep"
              radius="2xl"
              title={title}
              actions={actions}
              className={`w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col shadow-modal ${className}`}
            >
              <div className={`overflow-y-auto ${paddingClasses[padding]}`}>{children}</div>
            </PanelSurface>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
