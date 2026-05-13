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
}

export interface CardAudio {
  id: number
  card_id: number
  audio_url: string
  hint_text: string
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
}

// Duel mode types
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

// WebSocket events
export type WSEvent =
  | { type: 'room_state'; data: RoomState }
  | { type: 'card_start'; card_id: number; card_audio_id?: number; audio_url: string; hint_text: string; index?: number; total?: number; is_last?: boolean; start_ratio?: number }
  | { type: 'card_claimed'; card_id: number; winner_id: number; winner_name: string; remaining?: number; hint_text?: string }
  | { type: 'card_missed'; card_id: number; remaining?: number }
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
  // Duel mode events
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
  // Seat events
  | { type: 'seat_update'; seat1: { user_id: number; username: string } | null; seat2: { user_id: number; username: string } | null }
  | { type: 'seat_kicked' }
  // Arrange events
  | { type: 'duel_arrange_start'; timeout: number }
  | { type: 'duel_arrange_state'; player1_cards: Array<{ id: number; display_text: string; cover_url: string }>; player2_cards: Array<{ id: number; display_text: string; cover_url: string }>; p1_ready: boolean; p2_ready: boolean }
  | { type: 'duel_arrange_done'; player1_cards: Array<{ id: number; display_text: string; cover_url: string }>; player2_cards: Array<{ id: number; display_text: string; cover_url: string }> }

export interface RoomListItem {
  id: number
  code: string
  status: string
  interval_sec: number
  deck_name: string
  host_name: string
  player_count: number
  training?: boolean
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
