import { forwardRef, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * 统一下拉选择框（自定义弹出列表，替代原生 select 的系统样式弹层）。
 * 视觉与 ui/Input 同族：ink-deep 触发器 + gold 聚焦 + surface-elevated 弹出面板。
 * 键盘：↑↓ 移动高亮，Enter/Space 选择，Esc 关闭；点击外部关闭。
 * onChange 直接回传选项 value（不再是原生事件对象）。
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

const triggerClasses =
  'w-full rounded bg-ink-deep border text-left text-white ' +
  'outline-none transition-all duration-fast flex items-center justify-between gap-2 ' +
  'focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select(
  { label, error, hint, options = [], value, onChange, disabled = false, placeholder, size = 'md', fit = false, className = '', 'aria-label': ariaLabel },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selected = options.find(o => o.value === value)
  const display = selected?.label ?? placeholder ?? (value || '请选择')
  const hasSelection = !!selected

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // 打开时高亮当前选中项并滚动到可见位置
  useEffect(() => {
    if (!open) return
    const idx = options.findIndex(o => o.value === value)
    setActiveIndex(idx >= 0 ? idx : 0)
    const list = listRef.current
    if (list) {
      const el = list.querySelector('[data-active="true"]')
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, options, value])

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
        <label className="block text-muted text-xs mb-1.5" htmlFor={undefined}>
          {label}
        </label>
      )}
      <div className="relative" ref={rootRef}>
        <button
          ref={ref}
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
        {open && (
          <div
            id={listId}
            role="listbox"
            ref={listRef}
            className="absolute left-0 right-0 top-full mt-1 z-dropdown max-h-60 overflow-y-auto py-1 rounded-lg border border-border bg-surface-elevated shadow-panel"
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
                  {isSelected && <Check size={14} className="shrink-0 text-gold" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
      {error && <p className="text-crimson text-xs mt-1.5">{error}</p>}
      {!error && hint && <p className="text-muted/70 text-xs mt-1.5">{hint}</p>}
    </div>
  )
})
