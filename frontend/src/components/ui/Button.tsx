import { forwardRef, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Loader2 } from 'lucide-react'
/**
 * 统一按钮组件（设计系统 docs/design-system.md §2）
 *
 * 五状态完备：hover（亮度+微缩放）/ active（回缩）/ focus-visible（焦点环）/
 * disabled（半透明+禁点击）/ loading（图标旋转+锁定宽度）。
 * 视觉延续原 .btn-gold / .btn-outline 类。
 */
export type ButtonVariant = 'gold' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'
export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  /** 视觉变体：gold=主 CTA 樱粉渐变；outline=描边；ghost=幽灵；danger=危险动作 */
  variant?: ButtonVariant
  /** 尺寸：xs=面板头部小操作；sm=紧凑工具条；md=默认；lg=表单主按钮 */
  size?: ButtonSize
  children?: ReactNode
  /** 加载态：图标旋转并锁定宽度防抖动 */
  loading?: boolean
  /** 左侧图标（lucide-react 节点） */
  icon?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  gold:
    'text-ink bg-gold-gradient shadow-lg shadow-gold/20 hover:shadow-gold-lg hover:brightness-110 active:brightness-100',
  outline:
    'border border-gold/50 text-gold bg-transparent hover:border-gold hover:bg-gold/10 hover:shadow-gold',
  ghost:
    'text-muted bg-transparent hover:text-gold hover:bg-gold/5',
  danger:
    'border border-crimson/40 text-crimson bg-crimson/10 hover:bg-crimson/20 hover:border-crimson/60',
}

const sizeClasses: Record<ButtonSize, string> = {
  xs: 'px-2.5 py-1 text-xs',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-6 py-2.5 text-base',
  lg: 'px-6 py-3 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'gold',
    size = 'md',
    loading = false,
    icon,
    className = '',
    children,
    disabled,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading
  return (
    <motion.button
      ref={ref}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      className={`relative overflow-hidden rounded font-sans font-medium transition-all duration-fast ease-standard
        focus-visible:outline-none focus-visible:shadow-gold
        disabled:opacity-50 disabled:pointer-events-none
        ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {/* 高光扫过层（gold 变体） */}
      {variant === 'gold' && (
        <span className="absolute inset-0 bg-white/0 hover:bg-white/10 transition-colors duration-fast pointer-events-none" />
      )}
      <span className="relative inline-flex items-center justify-center gap-2">
        {loading ? <Loader2 size={size === 'xs' ? 13 : 18} className="animate-spin" /> : icon}
        {children}
      </span>
    </motion.button>
  )
})
