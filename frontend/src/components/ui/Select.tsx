import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * 统一下拉选择框（自定义弹出列表，替代原生 select 的系统样式弹层）。
 * 视觉与 ui/Input 同族：ink-deep 触发器 + gold 聚焦 + surface-elevated 弹出面板。
 * 键盘：↑↓ 移动高亮，Enter/Space 选择，Esc 关闭；点击外部关闭。
 * onChange 直接回传选项 value（不再是原生事件对象）。
 *
 * 浮层定位（2026-10-05 修复）：改为 portal 到 body + fixed 坐标。原 absolute 定位
 * 会被 Dialog 的 overflow-hidden 裁剪——模态内下拉只剩首项可见可点，且浮层压住
 * 弹层底部按钮。下方空间不足时向上翻转，高度按可用空间钳制。
 */
export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
  /** 选项列表 */
  options?: SelectOption[]
  /** 当前选中值（受控） */
  value?: string
  /** 选择回调，回传选项 value */
  onChange?: (value: string) => void
  disabled?: boolean
  /** 无匹配选项时的占位文案 */
  placeholder?: string
  /** 密度：sm 为筛选条/工具栏紧凑档，md（默认）为表单档 */
  size?: 'sm' | 'md'
  /** 容器宽度：默认占满（w-full），fit 时收缩为内容宽（筛选条内联使用） */
  fit?: boolean
  className?: string
  'aria-label'?: string
}

const densityClasses = { sm: 'px-3 h-9 text-xs pr-8', md: 'px-4 py-3 text-sm pr-10' } as const

/** 浮层高度上限（同原 max-h-60）、下限与贴边留白 */
const POPUP_MAX_HEIGHT = 240
const POPUP_MIN_HEIGHT = 96
const POPUP_GAP = 4
const VIEWPORT_MARGIN = 8

const triggerClasses =
  'w-full rounded-lg bg-ink-deep border text-left text-white ' +
  'outline-none transition-all duration-fast flex items-center justify-between gap-2 ' +
  'focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { label, error, hint, options = [], value, onChange, disabled = false, placeholder, size = 'md', fit = false, className = '', 'aria-label': ariaLabel },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()

  // 内部测量 ref 与外部 ref 合流（forwardRef 契约不变）
  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = node
  }, [ref])

  const selected = options.find(o => o.value === value)
  const display = selected?.label ?? placeholder ?? (value || '请选择')
  const hasSelection = !!selected

  const updatePosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - POPUP_GAP - VIEWPORT_MARGIN
    const spaceAbove = rect.top - POPUP_GAP - VIEWPORT_MARGIN
    const openUp = spaceBelow < POPUP_MAX_HEIGHT && spaceAbove > spaceBelow
    const available = Math.max(0, openUp ? spaceAbove : spaceBelow)
    setPopupStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(POPUP_MAX_HEIGHT, Math.max(POPUP_MIN_HEIGHT, available)),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + POPUP_GAP }
        : { top: rect.bottom + POPUP_GAP }),
    })
  }, [])

  // 打开时定位，并跟随滚动/缩放（捕获阶段覆盖弹层内的滚动容器）
  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const onReflow = () => updatePosition()
    window.addEventListener('scroll', onReflow, true)
    window.addEventListener('resize', onReflow)
    return () => {
      window.removeEventListener('scroll', onReflow, true)
      window.removeEventListener('resize', onReflow)
    }
  }, [open, updatePosition])

  // 点击外部关闭（浮层已 portal 出去，需与触发器分别判定）
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const node = e.target as Node
      if (rootRef.current?.contains(node) || popupRef.current?.contains(node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 打开时高亮当前选中项
  useEffect(() => {
    if (!open) return
    const idx = options.findIndex(o => o.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
  }, [open, options, value])

  // 高亮项滚动到可见位置
  useEffect(() => {
    if (!open) return
    popupRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const commit = (opt: SelectOption) => {
    onChange?.(opt.value)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[activeIndex]
      if (opt) commit(opt)
    }
  }

  return (
    <div className={fit ? '' : 'w-full'}>
      {label && (
        <label className="block text-muted text-xs mb-1.5">
          {label}
        </label>
      )}
      <div className="relative" ref={rootRef}>
        <button
          ref={setTriggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          onKeyDown={onKeyDown}
          className={`${triggerClasses} ${densityClasses[size]} ${error ? 'border-crimson/60' : 'border-border'} ${className}`}
        >
          <span className={`truncate ${hasSelection ? '' : 'text-muted/60'}`}>{display}</span>
          <ChevronDown
            size={size === 'sm' ? 14 : 16}
            className={`shrink-0 text-muted transition-transform duration-fast ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {error && <p className="text-crimson text-xs mt-1.5">{error}</p>}
      {!error && hint && <p className="text-muted/70 text-xs mt-1.5">{hint}</p>}
      {open && createPortal(
        <div
          id={listId}
          role="listbox"
          ref={popupRef}
          style={popupStyle}
          className="z-popover overflow-y-auto py-1 rounded-lg border border-border bg-surface-elevated shadow-panel"
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-muted/60 text-sm">暂无可选项</p>
          )}
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-active={isActive}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(opt)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors duration-fast ${
                  isSelected ? 'text-gold' : isActive ? 'bg-gold/10 text-white' : 'text-body-text/80'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check size={16} className="shrink-0 text-gold" />}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
})
