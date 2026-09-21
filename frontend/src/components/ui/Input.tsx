import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

/**
 * 统一文本输入框（延续原 .input-dark 视觉）。
 * label / error / hint 可选插槽；其余属性透传原生 input。
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** 顶部标签 */
  label?: ReactNode
  /** 错误提示（显示在框下方，红色） */
  error?: ReactNode
  /** 辅助说明（显示在框下方，次级色） */
  hint?: ReactNode
  /** 密度：sm 为筛选条/工具栏紧凑档，md（默认）为表单档 */
  size?: 'sm' | 'md'
  /** 容器宽度：默认占满（w-full），fit 时收缩为内容宽（筛选条内联使用） */
  fit?: boolean
}

const densityClasses = { sm: 'px-3 py-2 text-xs', md: 'px-4 py-3' } as const

const fieldClasses =
  'w-full rounded bg-ink-deep border border-border text-white placeholder-muted/60 ' +
  'outline-none transition-all duration-fast ' +
  'focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, size = 'md', fit = false, className = '', id, ...rest },
  ref,
) {
  // 无显式 id 时用 label 文本关联（可访问性兜底由调用方决定）
  return (
    <div className={fit ? '' : 'w-full'}>
      {label && (
        <label htmlFor={id} className="block text-muted text-xs mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`${fieldClasses} ${densityClasses[size]} ${error ? 'border-crimson/60' : ''} ${className}`}
        aria-invalid={!!error}
        {...rest}
      />
      {error && <p className="text-crimson text-xs mt-1.5">{error}</p>}
      {!error && hint && <p className="text-muted/70 text-xs mt-1.5">{hint}</p>}
    </div>
  )
})
