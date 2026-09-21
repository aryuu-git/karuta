export interface User {
  id: number
  username: string
  email: string
  is_admin?: boolean
  is_guest?: boolean
  avatar_url?: string
  created_at: string
}

export interface Deck {
  id: number
  owner_id: number
  name: string
  description: string
  card_count: number
  is_public: boolean
  share_level: string // 'private' | 'playable' | 'editable'
  edit_level: string  // 'add_only' | 'full'
  created_at: string
  owner_name?: string
  // v8：列表封面拼贴（前 4 张成员卡）与点赞
  cover_urls?: string[]
  likes?: number
  liked_by_me?: boolean
}

export interface CardAudio {
  id: number
  card_id: number
  audio_url: string
  hint_text: string
  duration_sec?: number
  sort_order: number
}

export interface CardMask {
  type: 'clip-edge' | 'clip-diagonal' | 'blur' | 'pixelate' | 'stripe' | 'spotlight'
  direction?: string
  ratio?: number
  intensity?: number
  cx?: number
  cy?: number
  radius?: number
  angle?: number
  width?: number
}

export interface Card {
  id: number
  deck_id?: number
  owner_id: number
  audio_url?: string
  cover_url: string
  hint_text?: string
  display_text: string
  series: string
  tags: string
  is_shared: boolean
  share_level?: string
  sort_order: number
  audio_count?: number
  audio_duration?: number
  likes?: number
  liked_by_me?: boolean
  remaining?: number
  audios?: CardAudio[]
  owner_name?: string
  mask?: CardMask | null
}

export interface Room {
  id: number
  code: string
  deck_id: number
  host_id: number
  status: string
  interval_sec: number
  mode: string
  mask_enabled?: boolean
  mask_difficulty?: string
  shuffle_remaining?: number
  random_start?: boolean
  random_start_max?: number
  duel_total_cards?: number
  duel_flip?: boolean
  duel_requeue?: boolean
  duel_max_rounds?: number
  duel_round_time?: number
  duel_grab_chances?: number
  duel_arrange_time?: number
  training?: boolean
  is_private?: boolean
  max_players?: number
}

// Duel/WS 事件强关联类型（RoomState/RoomPlayer/GrabbedCardInfo/Duel* 等）与 WSEvent
// 已集中迁至 ./ws-events；此处 re-export 保持既有 `from '../api/types'` 导入路径不变。
export type {
  DuelCard,
  DuelPlayerState,
  DuelState,
  RoomPlayer,
  GrabbedCardInfo,
  RoomState,
  WSEvent,
} from './ws-events'

export interface RoomListItem {
  id: number
  code: string
  status: string
  interval_sec: number
  deck_name: string
  host_name: string
  player_count: number
  training?: boolean
  is_private?: boolean
}

export interface UserStats {
  total_games: number
  top3_games: number
  top3_rate: number
  total_score: number
  best_score: number
  first_games: number
  world_first_count: number
}

/** 最近对局条目（GET /api/me/games） */
export interface UserGame {
  room_id: number
  mode: string
  deck_name: string
  score: number
  rank: number
  player_count: number
  ended_at: string | null
}

/** 排行榜条目（GET /api/rankings） */
export interface RankingEntry {
  user_id: number
  username: string
  value: number
}

/** 成就（注册表定义 × 用户侧状态；后端 32 项权威定义，前端零维护） */
export interface Achievement {
  key: string
  title: string
  description: string
  icon: string
  category: string
  target: number
  hidden: boolean
  progress: number
  unlocked_at: string | null
}

/** WS 推送/弹层消费的新解锁摘要 */
export interface AchievementUnlock {
  key: string
  title: string
  icon: string
}

export interface AuthResponse {
  token: string
  user: User
	guest_recovery_token?: string
}

export interface ApiError {
  message: string
  error?: string
}
