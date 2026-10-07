import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 统一锚定菜单：收编 ControlMenu / 丢蛋菜单 / 克隆弹层等自绘 popup。
 * 只统一锚定、圆角、动效、item 行样式；复杂行内容经 render 自定义，行为差异保留在调用方。
 * 关闭即卸载（2026-09-30）：入场走 CSS 动画、无退出动画——可见性不拴动画，
 * 杜绝 framer 退出卡死导致「框不消失」（同 FadeIn 哲学）；Esc / 点击外部关闭。
 */
export interface MenuItem {
  key: string
  label?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'danger'
  disabled?: boolean
  /** 自定义整行渲染（倒计时条目等），优先于 label */
  render?: (close: () => void) => ReactNode
  onSelect?: () => void
}

export interface MenuProps {
  /** 受控开合（调用方管理状态） */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 触发器节点（自带点击切换由本组件接管） */
  trigger: ReactNode
  items: MenuItem[]
  /** 面板对齐方向，默认 end（右对齐触发器） */
  align?: 'start' | 'end'
  className?: string
}

export function Menu({ open, onOpenChange, trigger, items, align = 'end', className = '' }: MenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const close = () => onOpenChange(false)

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute top-full mt-2 z-dropdown min-w-[10rem] max-h-60 overflow-y-auto rounded-xl border border-gold/20 bg-ink-deep/95 backdrop-blur shadow-panel p-1 animate-menu-in ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          {items.map(item => item.render ? (
            <div key={item.key}>{item.render(close)}</div>
          ) : (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => { item.onSelect?.(); close() }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-caption transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                item.tone === 'danger'
                  ? 'text-crimson hover:bg-crimson/10'
                  : 'text-body-text hover:bg-gold/10 hover:text-gold'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
