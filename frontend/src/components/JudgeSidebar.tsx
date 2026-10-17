import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListMusic, X } from 'lucide-react'
import { JudgePanel, type JudgePanelProps } from './JudgePanel'
import { IconButton } from './ui'

/** 桌面端与棋盘并排；移动端覆盖展开，关闭后继续保留面板内的编辑状态。 */
export function JudgeSidebar(props: JudgePanelProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const sidebarRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const pending = props.queue?.items.length ?? 0

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) toggleRef.current?.focus()
      wasOpenRef.current = false
      return
    }
    wasOpenRef.current = true
    closeRef.current?.querySelector('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    const onOutsidePointer = (event: PointerEvent) => {
      if (window.matchMedia('(min-width: 768px)').matches) return
      if (event.target instanceof Node && !sidebarRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onOutsidePointer)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onOutsidePointer)
    }
  }, [open])

  return (
    <>
      <div className="flex w-11 shrink-0 flex-col items-center border-l border-gold/15 bg-surface/60 pt-3">
        <button
          ref={toggleRef}
          type="button"
          aria-label={open ? '收起裁判播放仪表板' : '展开裁判播放仪表板'}
          aria-controls={panelId}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="flex w-9 flex-col items-center gap-3 rounded-lg border border-gold/25 bg-gold/5 py-3 text-gold transition-colors hover:bg-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <ListMusic size={18} aria-hidden="true" />
          <span className="text-tiny tracking-widest [writing-mode:vertical-rl]">播放控制</span>
          <span aria-label={`待播 ${pending} 首`} className="rounded-full bg-gold/15 px-1.5 py-0.5 text-tiny tabular-nums">{pending}</span>
          {open ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
        </button>
      </div>
      <div
        data-open={open}
        className="judge-sidebar z-overlay shadow-modal md:z-auto"
        aria-hidden={!open}
        {...(!open ? { inert: '' } : {})}
      >
        <aside
          ref={sidebarRef}
          id={panelId}
          aria-label="裁判播放仪表板"
          className="judge-sidebar-content flex h-full min-h-0 flex-col border-l border-gold/20 bg-ink-deep"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gold/15 px-4 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-caption font-medium text-gold"><ListMusic size={18} aria-hidden="true" />裁判播放仪表板</h2>
              <p className="mt-1 text-tiny text-muted">选歌 · 播放起点 · 待播顺序</p>
            </div>
            <div ref={closeRef}>
              <IconButton aria-label="关闭裁判播放仪表板" icon={<X size={18} aria-hidden="true" />} size="md" onClick={() => setOpen(false)} />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <JudgePanel {...props} layout="sidebar" />
          </div>
        </aside>
      </div>
    </>
  )
}
