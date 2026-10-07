import type { Deck } from '../../api/types'

/**
 * 同名牌组的区分后缀（2026-10-05 体验修复）：仅当牌组重名时追加创建日期，
 * 避免选择器/列表里出现两行完全一样的牌组、只能靠猜。
 */
export function deckDisambiguator(deck: Deck, duplicatedNames: Set<string>): string {
  if (!duplicatedNames.has(deck.name)) return ''
  const created = deck.created_at ? new Date(deck.created_at).toLocaleDateString('zh-CN') : ''
  return created ? ` · ${created}` : ''
}

/** 收集出现次数 > 1 的牌组名 */
export function duplicatedDeckNames(decks: Deck[]): Set<string> {
  const counts = new Map<string, number>()
  for (const deck of decks) counts.set(deck.name, (counts.get(deck.name) ?? 0) + 1)
  return new Set(
    [...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name),
  )
}
