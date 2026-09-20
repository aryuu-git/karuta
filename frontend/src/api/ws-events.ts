// WebSocket 事件与事件强关联类型的集中定义。
// 拆分自 ./types：事件专属结构（房间状态 / Duel / 废牌 / 席位）只被 WS 事件或事件负载消费，
// 收拢到本文件便于按事件族维护；通用 REST 类型（User/Card/Room/CardMask 等）仍留在 ./types。
// ./types 通过 `export type { ... } from './ws-events'` 反向 re-export，既有导入路径不受影响。

import type { Card, CardMask, Room } from './types'

// Duel 模式类型
export interface DuelCard {
  id: number
  display_text: string
  cover_url: string
  claimed?: boolean
  claimed_by?: number
  mask?: CardMask | null
}

export interface DuelPlayerState {
  id: number
  username: string
  cards: DuelCard[]
}

export interface DuelState {
  room: Room
  player1: DuelPlayerState
  player2: DuelPlayerState
  p1_count: number
  p2_count: number
  queue_left: number
  flip: boolean
  p1_grabbed?: Array<{ id: number; display_text: string; cover_url: string }>
  p2_grabbed?: Array<{ id: number; display_text: string; cover_url: string }>
}

export interface RoomPlayer {
  room_id: number
  user_id: number
  username: string
  avatar_url?: string
  role: string
  score: number
  online: boolean
}

export interface GrabbedCardInfo {
  card_id: number
  winner_id: number | null
  winner_name: string
  hint_text?: string
}

export interface RoomState {
  room: Room
  players: RoomPlayer[]
  cards?: Card[]
  grabbed_cards?: GrabbedCardInfo[]
  current_card?: Card | null
  remaining_count: number
  judge_waiting?: boolean
}

// WebSocket 事件
export type WSEvent =
  | { type: 'room_state'; data: RoomState }
  // start_at/ends_at/server_now：B1 服务端权威回合时钟（UnixMilli）
  | { type: 'card_start'; card_id: number; card_audio_id?: number; round_id?: number; audio_url: string; hint_text: string; index?: number; total?: number; is_last?: boolean; start_ratio?: number; next_audio_urls?: string[]; start_at?: number; ends_at?: number; server_now?: number }
  // remaining/hint_text 与后端 game_session.go 的 card_claimed 广播字段对齐
  | { type: 'card_claimed'; card_id: number; winner_id: number; winner_name: string; remaining?: number; hint_text?: string }
  // remaining 与后端 card_missed 广播字段对齐
  | { type: 'card_missed'; card_id: number; remaining?: number }
  // 后端 card_exhausted 广播仅含 card_id
  | { type: 'card_exhausted'; card_id: number }
  | { type: 'grab_failed'; card_id: number; penalty?: boolean; reason?: string }
  | { type: 'grab_wrong'; user_id: number; username: string; card_id: number; reason?: string; penalty?: boolean }
  | { type: 'grab_banned'; card_id?: number }
  | { type: 'all_banned' }
  | { type: 'score_update'; scores: Array<{ user_id: number; username: string; score: number }> }
  | { type: 'game_over'; results: Array<{ user_id: number; username: string; score: number; rank: number; penalty_count?: number; grabbed_cards?: Array<{ id: number; display_text: string; cover_url: string; hint_text: string }> }>; last_card_winner_id?: number }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'player_joined'; user_id: number; username: string; avatar_url?: string; role?: string }
  | { type: 'player_offline'; user_id: number }
  | { type: 'chat_message'; user_id: number; username: string; role: string; text: string }
  | { type: 'egg_throw'; from_id: number; from_name: string; target_id: number; target_name: string }
  | { type: 'countdown'; count: number }
  | { type: 'room_closed' }
  | { type: 'kicked'; message: string }
  | { type: 'judge_waiting'; played_count: number; total_count: number }
  | { type: 'judge_offline'; timeout: number }
  | { type: 'judge_timeout' }
  // Duel 模式事件
  | { type: 'duel_state'; data: DuelState }
  | { type: 'duel_card_start'; card_id: number; audio_url: string; hint_text: string; round: number; queue_left: number; start_ratio?: number }
  | { type: 'duel_grab_wrong'; user_id: number; username: string; card_id: number; penalty?: boolean }
  | { type: 'duel_grab_invalid' }
  | { type: 'duel_grab_blocked' }
  | { type: 'duel_card_claimed'; user_id: number; username: string; card_id: number; area: 'own' | 'opponent'; p1_count: number; p2_count: number; needs_give?: boolean }
  | { type: 'duel_timeout'; card_id: number; requeued: boolean }
  | { type: 'duel_give_request'; cards: Array<{ id: number; display_text: string; cover_url: string }> }
  | { type: 'duel_give_done'; from_id: number; card_id: number; p1_count: number; p2_count: number }
  | { type: 'duel_game_over'; reason: string; winner_id: number; winner: string; p1_count: number; p2_count: number; rounds: number; p1_grabbed_cards?: Array<{ id: number; display_text: string; cover_url: string }>; p2_grabbed_cards?: Array<{ id: number; display_text: string; cover_url: string }>; p1_remaining?: Array<{ id: number; display_text: string; cover_url: string }>; p2_remaining?: Array<{ id: number; display_text: string; cover_url: string }> }
  // 席位事件
  | { type: 'seat_update'; seat1: { user_id: number; username: string } | null; seat2: { user_id: number; username: string } | null }
  | { type: 'seat_kicked' }
  // 编排事件
  | { type: 'duel_arrange_start'; timeout: number }
  | { type: 'duel_arrange_state'; player1_cards: Array<{ id: number; display_text: string; cover_url: string }>; player2_cards: Array<{ id: number; display_text: string; cover_url: string }>; p1_ready: boolean; p2_ready: boolean }
  | { type: 'duel_arrange_done'; player1_cards: Array<{ id: number; display_text: string; cover_url: string }>; player2_cards: Array<{ id: number; display_text: string; cover_url: string }> }
