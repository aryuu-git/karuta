import { type ReactNode } from 'react'
import { PageContainer } from './PageContainer'
import { SiteFooter } from './SiteFooter'

/**
 * 列表页模板壳：Hero 头部 + 工具行（页签/搜索）+ 内容区 + 可选吸底区 + 开源仓库页脚。
 * 牌库/牌组等列表页统一骨架，页面只负责填槽。
 * （2026-09-30）开源仓库入口归底注：模板壳统一挂 SiteFooter，取代顶栏图标钮。
 */
export interface ListPageShellProps {
  /** 页首区（通常是 HeroHeader） */
  hero?: ReactNode
  /** 工具行：页签 + 搜索/动作 */
  toolbar?: ReactNode
  /** 工具行吸顶（长列表页的筛选条） */
  stickyToolbar?: boolean
  children: ReactNode
  /** 吸底区（ActionBar 等） */
  bottom?: ReactNode
  className?: string
}

export function ListPageShell({ hero, toolbar, stickyToolbar = false, children, bottom, className = '' }: ListPageShellProps) {
  return (
    // size="lg" = 内容列宽度契约 max-w-content（布局契约 §1.3），与 PageContainer 统一消费
    <PageContainer size="lg" padding="sm" className={className}>
      {hero}
      {toolbar && (
        <div className={`flex items-center justify-between gap-3 flex-wrap mb-4 ${stickyToolbar ? 'sticky top-14 z-sticky bg-body-bg/95 backdrop-blur py-2' : ''}`}>{toolbar}</div>
      )}
      <div className="flex-1 min-h-0">{children}</div>
      {bottom}
      <SiteFooter />
    </PageContainer>
  )
}
