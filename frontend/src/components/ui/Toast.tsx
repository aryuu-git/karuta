import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

/**
 * 全局 Toast 系统：替换 RoomPage 内嵌版（原 171-181 行）。
 * 语义兼容：toast.show(text, type, ms)——多条堆叠、各自计时、自动过期。
 *
 * 注意：渲染层刻意不用 framer-motion——ToastProvider 挂在 main.tsx 同步依赖链上，
 * 一旦引入 framer 会把整个 motion 库拉进首屏主包（详见决策日志 D2-A2）。
 * 入场动画用 CSS keyframes（toast-in）实现。
 */

export type ToastType = 'success' | 'fail' | 'info'

export interface ToastItem {
  id: number
  text: string
  type: ToastType
}

export interface ToastContextValue {
  /** 弹出一条 toast（text 支持带 emoji 的文案；ms 默认 2000） */
  show: (text: string, type?: ToastType, ms?: number) => void
  /** 便捷别名 */
  success: (text: string, ms?: number) => void
  fail: (text: string, ms?: number) => void
  info: (text: string, ms?: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const typeStyle: Record<ToastType, string> = {
  success: 'border-success/50 text-success',
  fail: 'border-crimson/50 text-crimson',
  info: 'border-gold/50 text-gold',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const show = useCallback((text: string, type: ToastType = 'info', ms = 2000) => {
    const id = ++counter.current
    setItems((prev) => [...prev.slice(-3), { id, text, type }]) // 最多同时 4 条，防刷屏
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, ms)
  }, [])

  const value: ToastContextValue = {
    show,
    success: (t, ms) => show(t, 'success', ms),
    fail: (t, ms) => show(t, 'fail', ms),
    info: (t, ms) => show(t, 'info', ms),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* 渲染层：顶部居中，不阻塞交互 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-toast flex flex-col items-center gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-in px-4 py-2.5 rounded-lg bg-ink-deep/95 border shadow-gold backdrop-blur-sm
              font-serif text-sm whitespace-nowrap ${typeStyle[t.type]}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast 必须在 <ToastProvider> 内使用')
  }
  return ctx
}
