// 数据层统一出口（重构 R2）：TanStack Query 的 queryKey 工厂与共享查询 hooks。
// 约定：
// - queryKey 一律经本文件工厂生成，禁止手拼数组（保证失效策略可统一治理）。
// - 变更后失效：写操作用 invalidateQueries(qk.xxx) 精确失效。
// - 轮询仅在页面可见时进行（react-query 默认 refetchIntervalInBackground=false）。

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api } from './client'
import type { Card, Deck, RoomListItem, UserStats } from './types'

export const queryKeys = {
  cards: {
    mineRoot: ['cards', 'mine'] as const,
    mine: (params?: object) => ['cards', 'mine', params ?? {}] as const,
    public: (params?: object) => ['cards', 'public', params ?? {}] as const,
    tags: ['cards', 'tags'] as const,
    detail: (id: number) => ['cards', 'detail', id] as const,
  },
  decks: {
    mine: ['decks', 'mine'] as const,
    editable: ['decks', 'editable'] as const,
    public: (owner?: string) => ['decks', 'public', owner ?? ''] as const,
    detail: (id: number) => ['decks', 'detail', id] as const,
  },
  rooms: {
    list: ['rooms', 'list'] as const,
  },
  profile: {
    stats: ['profile', 'stats'] as const,
    invites: ['profile', 'invites'] as const,
    achievements: ['profile', 'achievements'] as const,
    games: (params?: object) => ['profile', 'games', params ?? {}] as const,
  },
  rankings: (kind: string) => ['rankings', kind] as const,
  admin: {
    users: ['admin', 'users'] as const,
    inviteStatus: ['admin', 'invite-status'] as const,
  },
} as const

/** 我的牌库（服务端分页 + 排序 + 关键词/标签筛选；翻页保留旧数据防闪烁） */
export function useMyCards(params?: { page?: number; size?: number; sort?: string; search?: string; tag?: string }) {
  return useQuery({
    queryKey: queryKeys.cards.mine(params),
    queryFn: () => api.cards.listMine(params),
    placeholderData: keepPreviousData,
  })
}

/** 公共牌库（分页 + 筛选 + 排序，翻页时保留旧数据防闪烁） */
export function usePublicCards(params: { search?: string; tag?: string; owner?: string; page?: number; size?: number; sort?: string }) {
  return useQuery({
    queryKey: queryKeys.cards.public(params),
    queryFn: () => api.cards.listPublic({ ...params, size: 50 }),
    placeholderData: keepPreviousData,
  })
}

/** 公共标签集 */
export function useCardTags() {
  return useQuery({ queryKey: queryKeys.cards.tags, queryFn: () => api.cards.listTags() })
}

/** 我的牌组 */
export function useMyDecks() {
  return useQuery({ queryKey: queryKeys.decks.mine, queryFn: () => api.decks.listMine() })
}

/** 可编辑牌组 */
export function useEditableDecks() {
  return useQuery({ queryKey: queryKeys.decks.editable, queryFn: () => api.decks.listEditable() })
}

/** 公共牌组（可按 owner 过滤） */
export function usePublicDecks(owner?: string) {
  return useQuery({ queryKey: queryKeys.decks.public(owner), queryFn: () => api.decks.listPublic(owner) })
}

/** 牌组详情（enabled=false 时跳过拉取——建房页仅在选中牌组后拉取画像） */
export function useDeckDetail(id: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.decks.detail(id),
    queryFn: () => api.decks.get(id),
    enabled: enabled && id > 0,
  })
}

/**
 * 战场大厅列表：8 秒轮询，仅页面可见时刷新（后台标签页自动停）。
 * 刷新中保留旧数据，列表不闪烁。
 */
export function useRoomList() {
  return useQuery({
    queryKey: queryKeys.rooms.list,
    queryFn: () => api.rooms.list(),
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  })
}

/** 个人战绩统计 */
export function useMyStats() {
  return useQuery({ queryKey: queryKeys.profile.stats, queryFn: () => api.auth.myStats() })
}

/** 我的成就（32 项全量：定义 + 解锁状态/进度） */
export function useMyAchievements() {
  return useQuery({ queryKey: queryKeys.profile.achievements, queryFn: () => api.auth.myAchievements() })
}

/** 最近对局（个人页历史区块） */
export function useMyGames(params?: { page?: number; size?: number }) {
  return useQuery({
    queryKey: queryKeys.profile.games(params),
    queryFn: () => api.auth.myGames(params),
    placeholderData: keepPreviousData,
  })
}

/** 全站排行榜（score | wins | world_first） */
export function useRankings(kind: 'score' | 'wins' | 'world_first' = 'score') {
  return useQuery({ queryKey: queryKeys.rankings(kind), queryFn: () => api.rankings(kind, 10) })
}

// —— 以下类型再导出，页面 hook 消费方免多路径导入 ——
export type { Card, Deck, RoomListItem, UserStats }
