import { useState, useCallback } from 'react'

/** 分享级别局部联合类型（api/types 中 share_level 为 string，此处收窄为合法值） */
export type ShareLevel = 'private' | 'playable' | 'editable'

/** 运行时判定字符串是否为合法分享级别 */
export function isShareLevel(value: unknown): value is ShareLevel {
  return value === 'private' || value === 'playable' || value === 'editable'
}

/** 默认预置标签（标签芯片与自定义标签共用） */
export const DEFAULT_TAGS = ['游戏', '动画']

/**
 * 卡牌表单字段收敛 hook（创建/编辑双模式共用）
 * 收敛 displayText/series/tags/hintText/isShared/shareLevel 六个字段，
 * setter 原样暴露以便 loadCard 回填
 */
export function useCardForm() {
  const [displayText, setDisplayText] = useState('')
  const [series, setSeries] = useState('')
  const [tags, setTags] = useState('')
  const [hintText, setHintText] = useState('')
  const [isShared, setIsShared] = useState(true)
  const [shareLevel, setShareLevel] = useState<ShareLevel>('playable')

  /** 将标签并入 tags 逗号串（去重）——自定义标签与预置标签共用 */
  const addTag = useCallback((tag: string) => {
    setTags(prev => {
      const existing = prev.split(',').map(t => t.trim()).filter(Boolean)
      if (!existing.includes(tag)) existing.push(tag)
      return existing.join(',')
    })
  }, [])

  /** 切换标签芯片选中态（已选则移除，未选则追加） */
  const toggleTag = useCallback((tag: string) => {
    setTags(prev => {
      const selected = prev.split(',').map(t => t.trim()).filter(Boolean)
      return selected.includes(tag)
        ? selected.filter(t => t !== tag).join(',')
        : [...selected, tag].join(',')
    })
  }, [])

  return {
    displayText, setDisplayText,
    series, setSeries,
    tags, setTags,
    hintText, setHintText,
    isShared, setIsShared,
    shareLevel, setShareLevel,
    addTag, toggleTag,
  }
}
