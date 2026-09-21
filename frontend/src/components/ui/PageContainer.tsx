import { type ReactNode } from 'react'

/**
 * 页面标准容器：统一页面宽度档位与左右安全边距。
 * 档位对应原页面各色 max-w 手写值（重构 R4 收敛）：
 * - sm: max-w-2xl（表单页/聚焦页）
 * - md: max-w-4xl（默认列表页）
 * - lg: max-w-5xl（宽列表/详情页）
 * - xl: max-w-7xl（全局级页面）
 */
export type PageContainerSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<PageContainerSize, string> = {
  sm: 'max-w-2xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-7xl',
}

export interface PageContainerProps {
  size?: PageContainerSize
  /** 垂直内边距（对局类全屏页面可传 'none'） */
  padding?: 'none' | 'sm' | 'md'
  className?: string
  children: ReactNode
}

export function PageContainer({ size = 'md', padding = 'md', className = '', children }: PageContainerProps) {
  const padClass = padding === 'none' ? '' : padding === 'sm' ? 'py-4' : 'py-8'
  return (
    <div className={`${sizeClasses[size]} mx-auto px-4 sm:px-6 ${padClass} ${className}`}>
      {children}
    </div>
  )
}
