import { forwardRef, type TextareaHTMLAttributes, type ReactNode } from 'react'

/**
 * 统一多行文本输入框。与 Input 同一套视觉 token。
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode
  error?: ReactNode
  hint?: ReactNode
}

const fieldClasses =
  'w-full px-4 py-3 rounded bg-ink-deep border border-border text-white placeholder-muted/60 ' +
  'outline-none transition-all duration-fast resize-y min-h-24 ' +
  'focus:border-gold focus:shadow-[0_0_0_1px_rgb(var(--gold-foil)/0.3)] ' +
  'disabled:opacity-50 disabled:pointer-events-none'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className = '', id, ...rest },
  ref,
) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-muted text-xs mb-1.5">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={`${fieldClasses} ${error ? 'border-crimson/60' : ''} ${className}`}
        aria-invalid={!!error}
        {...rest}
      />
      {error && <p className="text-crimson text-xs mt-1.5">{error}</p>}
      {!error && hint && <p className="text-muted/70 text-xs mt-1.5">{hint}</p>}
    </div>
  )
})
