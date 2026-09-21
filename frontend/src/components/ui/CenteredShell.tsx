import { type ReactNode } from 'react'

/**
 * 全屏居中壳：认证页/游客页/404/错误兜底等无导航页面的统一骨架。
 * 收编原 6 处手写的 `min-h-screen washi-bg flex items-center justify-center px-4`
 * （Login/Register/Guest/NotFound/ErrorBoundary/guards），背景与安全边距只在这一处维护。
 * relative：为装饰光斑等 absolute 子层提供定位上下文（原散装壳依赖视口初始包含块，语义等价）。
 * 需要纵向排布时由调用方追加 `flex-col gap-N`（flex-col 覆盖默认横向居中）。
 */
export function CenteredShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen washi-bg relative flex items-center justify-center px-4 ${className}`}>
      {children}
    </div>
  )
}
