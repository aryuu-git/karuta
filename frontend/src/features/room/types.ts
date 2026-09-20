/**
 * Room 域内共享类型。
 * 组件（GameOver 等）内部各自持有结构相同的 interface，此处为页面与
 * features/room 展示组件之间的契约定义。
 */

/** 抢到的牌（结算展示用） */
export interface GrabbedCard {
  id: number
  display_text: string
  cover_url: string
  hint_text: string
}

/** 对局结算结果（RoomPage 状态 + RoomControlBar 调试跳结算共用） */
export interface GameResult {
  user_id: number
  username: string
  score: number
  rank: number
  penalty_count?: number
  grabbed_cards?: GrabbedCard[]
}
