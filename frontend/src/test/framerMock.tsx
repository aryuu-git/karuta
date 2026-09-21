// 共享 framer-motion 直通 mock（组件测试用）。
// 背景：framer-motion 卸载动画在 happy-dom 抛 AbortError 未处理 rejection，
// 测试关注点是组件逻辑而非动画，统一替换为直通实现。
// 消费方式：测试文件内 `vi.mock('framer-motion', () => import('../../test/framerMock'))`
// ——vi.mock 工厂内动态 import 是 vitest 官方共享 mock 模式（工厂 hoist 后
// 无法引用外部绑定，模块边界加载是唯一合规路径）。
import type { ReactNode } from 'react'

/** 动画专属 props：剥离后不传给 DOM 元素 */
const MOTION_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap',
  'layout', 'variants', 'drag', 'dragConstraints', 'dragElastic', 'onDragEnd', 'layoutId',
])

const cache = new Map<string, unknown>()

export const AnimatePresence = ({ children }: { children: ReactNode }) => <>{children}</>

export const motion = new Proxy({}, {
  get: (_t, tag: string) => {
    if (!cache.has(tag)) {
      cache.set(tag, ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => {
        const rest: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(props)) {
          if (!MOTION_PROPS.has(k)) rest[k] = v
        }
        const Tag = tag as 'div'
        return <Tag {...(rest as JSX.IntrinsicElements['div'])}>{children}</Tag>
      })
    }
    return cache.get(tag)
  },
})
