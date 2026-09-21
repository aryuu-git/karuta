import { forwardRef, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'

/**
 * 统一搜索输入框：内置 lucide 搜索图标与可清除按钮，工具栏紧凑密度。
 * 视觉与 ui/Input 同族（ink-deep 底 + border 描边 + gold 聚焦）。
 * className 作用于外层容器（如 flex-1 / max-w-sm），输入框始终充满容器。
 * 受控使用：传入 onClear 时值非空显示清除按钮。
 */
export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** 点击清除按钮时回调；未传时不显示清除按钮 */
  onClear?: () => void
  /** 外层容器类名（控制布局宽度），默认仅 relative */
  className?: string
}

const fieldClasses =
  'w-full pl-10 pr-9 py-2.5 rounded bg-ink-deep border border-border text-sm text-white ' +
  'placeholder-muted/60 outline-none transition-all duration-fast ' +
  'hover:border-border focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { onClear, className = '', value, ...rest },
  ref,
) {
  const hasValue = typeof value === 'string' && value.length > 0
  return (
    <div className={`relative ${className}`}>
      <Search
        size={15}
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/50 pointer-events-none"
      />
      <input
        ref={ref}
        type="text"
        value={value}
        aria-label={typeof rest.placeholder === 'string' ? rest.placeholder : '搜索'}
        className={fieldClasses}
        {...rest}
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          aria-label="清除搜索"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted/60 hover:text-white hover:bg-white/5 active:scale-90 transition-all duration-fast"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
})
