import type { CSSProperties, ReactElement } from 'react'

/** 骨架块基础样式：surface 底 + 白5 高光横向扫过（复用全局 shimmer keyframes，纯 CSS，禁 framer） */
const blockStyle: CSSProperties = {
  background:
    'linear-gradient(90deg, rgb(var(--color-surface)) 0%, rgb(255 255 255 / 0.05) 50%, rgb(var(--color-surface)) 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.6s linear infinite',
}

export interface SkeletonProps {
  /** 骨架条目数量（行/卡片数），列表页按 §7.1 取 3–6 */
  rows?: number
  /** card=卡面骨架（封面块+两行）；row=单行文本骨架（头像位+两行文字） */
  variant?: 'card' | 'row'
  /** 容器布局覆盖（页面各自 grid/间距），留空用该变体的默认布局 */
  className?: string
}

/** 单行文本骨架：头像位 + 两行文字 */
function RowItem(): ReactElement {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full shrink-0" style={blockStyle} />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded w-3/4" style={blockStyle} />
        <div className="h-3 rounded w-1/2" style={blockStyle} />
      </div>
    </div>
  )
}

/** 卡面骨架：封面块（3:4）+ 两行文字 */
function CardItem(): ReactElement {
  return (
    <div className="rounded-xl overflow-hidden">
      <div className="w-full" style={{ ...blockStyle, aspectRatio: '3/4' }} />
      <div className="p-2 space-y-2">
        <div className="h-3 rounded w-3/4" style={blockStyle} />
        <div className="h-3 rounded w-1/2" style={blockStyle} />
      </div>
    </div>
  )
}

/** 列表加载骨架屏（§7.1 列表三态之 loading）：纯 CSS shimmer，替代裸 Spinner。 */
export function Skeleton({ rows = 4, variant = 'row', className }: SkeletonProps) {
  const Item = variant === 'card' ? CardItem : RowItem
  const layout = className ?? (variant === 'card'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5'
    : 'space-y-3')
  return (
    <div className={layout} role="status" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => <Item key={i} />)}
    </div>
  )
}
