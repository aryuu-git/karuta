import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * 统一下拉选择框（原生 select 样式化，保持移动端原生滚动体验）。
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
  /** 选项列表；也可以直接传 <option> 子元素 */
  options?: Array<{ value: string; label: string }>
  /** 密度：sm 为筛选条/工具栏紧凑档，md（默认）为表单档 */
  size?: 'sm' | 'md'
  /** 容器宽度：默认占满（w-full），fit 时收缩为内容宽（筛选条内联使用） */
  fit?: boolean
}

const densityClasses = { sm: 'px-3 py-2 text-xs pr-8', md: 'px-4 py-3 pr-10' } as const

const fieldClasses =
  'w-full rounded bg-ink-deep border border-border text-white ' +
  'outline-none transition-all duration-fast appearance-none cursor-pointer ' +
  'focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, size = 'md', fit = false, className = '', children, id, ...rest },
  ref,
) {
  return (
    <div className={fit ? '' : 'w-full'}>
      {label && (
        <label htmlFor={id} className="block text-muted text-xs mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={id}
          className={`${fieldClasses} ${densityClasses[size]} ${error ? 'border-crimson/60' : ''} ${className}`}
          aria-invalid={!!error}
          {...rest}
        >
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
      </div>
      {error && <p className="text-crimson text-xs mt-1.5">{error}</p>}
      {!error && hint && <p className="text-muted/70 text-xs mt-1.5">{hint}</p>}
    </div>
  )
})
