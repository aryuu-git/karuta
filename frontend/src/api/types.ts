export interface User {
  id: number
  username: string
  email: string
  created_at: string
}

export interface Deck {
  id: number
  owner_id: number
  name: string
  description: string
  card_count: number
  is_public: boolean
  created_at: string
  owner_name?: string
}

export interface Card {
  id: number
  deck_id: number
  audio_url: string
  cover_url: string
  hint_text: string
  display_text: string
  sort_order: number
}

export interface Room {
  id: number
  code: string
  deck_id: number
  host_id: number
  status: string
  interval_sec: number
  mode: string // "auto" | "judge"
}

export interface RoomPlayer {
  room_id: number
  user_id: number
  username: string
  role: string
  score: number
  online: boolean
}

export interface GrabbedCardInfo {
  card_id: number
  winner_id: number | null
  winner_name: string
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

// WebSocket events
export type WSEvent =
  | { type: 'room_state'; data: RoomState }
  | { type: 'card_start'; card_id: number; audio_url: string; hint_text: string; index?: number; total?: number; is_last?: boolean }
  | { type: 'card_claimed'; card_id: number; winner_id: number; winner_name: string }
  | { type: 'card_missed'; card_id: number }
  | { type: 'grab_failed'; card_id: number; penalty?: boolean; reason?: string }
  | { type: 'grab_wrong'; user_id: number; username: string; card_id: number; reason?: string }
  | { type: 'grab_banned'; card_id?: number }
  | { type: 'all_banned' }
  | { type: 'score_update'; scores: Array<{ user_id: number; username: string; score: number }> }
  | { type: 'game_over'; results: Array<{ user_id: number; username: string; score: number; rank: number; penalty_count?: number; grabbed_cards?: Array<{ id: number; display_text: string; cover_url: string; hint_text: string }> }>; last_card_winner_id?: number }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'player_joined'; user_id: number; username: string; role?: string }
  | { type: 'player_offline'; user_id: number }
  | { type: 'chat_message'; user_id: number; username: string; role: string; text: string }
  | { type: 'egg_throw'; from_id: number; from_name: string; target_id: number; target_name: string }
  | { type: 'countdown'; count: number }
  | { type: 'room_closed' }
  | { type: 'judge_waiting'; played_count: number; total_count: number }
  | { type: 'judge_offline'; timeout: number }
  | { type: 'judge_timeout' }

export interface RoomListItem {
  id: number
  code: string
  status: string
  interval_sec: number
  deck_name: string
  host_name: string
  player_count: number
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

export interface AuthResponse {
  token: string
  user: User
}

export interface ApiError {
  message: string
  error?: string
}
