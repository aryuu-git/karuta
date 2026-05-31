import { QUADRANT_API_BASE } from '../config'

const BASE = QUADRANT_API_BASE

function getToken(): string | null {
  return localStorage.getItem('karuta_token')
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Request failed')
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return res.json()
}

// Types
export interface QBank {
  id: number
  name: string
  description: string
  owner_id: number
  visibility: string
  category: string
  question_count: number
  play_count: number
  like_count: number
  created_at: number
  updated_at: number
}

export interface QItem {
  id: number
  bank_id: number
  title: string
  image_url: string
  source: string
  source_id?: string
}

export interface QLabel {
  id: number
  bank_id: number
  name: string
}

export interface QPlacement {
  id: number
  question_id: number
  item_id: number
  x: number
  y: number
  reveal_order: number
  item?: QItem
}

export interface QQuestion {
  id: number
  bank_id: number
  axis_x_label_id: number
  axis_y_label_id: number
  score_source: string
  quality: number
  created_at: number
}

export interface QQuestionDetail extends QQuestion {
  axis_x_name: string
  axis_y_name: string
  candidates: QLabel[]
  placements: QPlacement[]
}

export interface QRoom {
  id: number
  code: string
  name: string
  host_id: number
  judge_id: number
  bank_id: number
  status: string
  visibility: string
  max_players: number
  rounds_total: number
  rounds_current: number
  candidate_count: number
  reveal_interval: number
  guess_window: number
  base_score: number
  decay_per_reveal: number
  wrong_penalty: number
  cooldown_rounds: number
  created_at: number
}

export interface QPlayer {
  room_id: number
  user_id: number
  username: string
  role: string
  score: number
  is_ready: boolean
  joined_at: number
  online?: boolean
}

export interface QRoomState {
  room: QRoom
  players: QPlayer[]
}

export type QWSEvent =
  | { type: 'game_start'; candidates: string[]; item_count: number; round: number; total_rounds: number }
  | { type: 'item_revealed'; index: number; title: string; image_url: string; x: number; y: number; revealed_count: number; total_count: number }
  | { type: 'guess_result'; correct?: boolean; score?: number; error?: string; cooldown_remaining?: number; cooldown_rounds?: number }
  | { type: 'player_correct'; user_id: number; username: string; score: number; revealed_count: number }
  | { type: 'round_end'; axis_x: string; axis_y: string; all_placements: Array<{ title: string; image_url: string; x: number; y: number }>; rankings: Array<{ user_id: number; username: string; score: number }> }
  | { type: 'game_over'; final_rankings: Array<{ user_id: number; username: string; score: number }> }
  | { type: 'hint'; hint_type: string; label?: string; text?: string }
  | { type: 'game_paused' }
  | { type: 'game_resumed' }
  | { type: 'preparing'; message: string }
  | { type: 'player_joined'; user_id: number; username: string; role: string }
  | { type: 'player_offline'; user_id: number }
  | { type: 'player_ready'; user_id: number; ready: boolean }
  | { type: 'room_closed' }
  | { type: 'game_state'; candidates: string[]; item_count: number; revealed_items: Array<{ index: number; title: string; image_url: string; x: number; y: number }>; revealed_count: number; paused: boolean; finished: boolean }

// API
export const quadrantApi = {
  banks: {
    list: (scope?: string) => request<QBank[]>(`/banks${scope ? `?scope=${scope}` : ''}`),
    get: (id: number) => request<QBank>(`/banks/${id}`),
    create: (data: { name: string; description?: string; visibility?: string; category?: string }) =>
      request<QBank>('/banks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<QBank>) =>
      request<void>(`/banks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/banks/${id}`, { method: 'DELETE' }),
  },
  items: {
    list: (bankId: number) => request<QItem[]>(`/banks/${bankId}/items`),
    create: (bankId: number, data: { title: string; image_url?: string; source?: string; source_id?: string }) =>
      request<QItem>(`/banks/${bankId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  },
  labels: {
    list: (bankId: number) => request<QLabel[]>(`/banks/${bankId}/labels`),
    create: (bankId: number, name: string) =>
      request<QLabel>(`/banks/${bankId}/labels`, { method: 'POST', body: JSON.stringify({ name }) }),
    delete: (id: number) => request<void>(`/labels/${id}`, { method: 'DELETE' }),
  },
  questions: {
    list: (bankId: number) => request<QQuestion[]>(`/banks/${bankId}/questions`),
    get: (id: number) => request<QQuestionDetail>(`/questions/${id}`),
    create: (bankId: number, data: {
      axis_x_label_id: number
      axis_y_label_id: number
      score_source?: string
      candidate_ids: number[]
      placements: Array<{ item_id: number; x: number; y: number; reveal_order?: number }>
    }) => request<QQuestion>(`/banks/${bankId}/questions`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/questions/${id}`, { method: 'DELETE' }),
  },
  rooms: {
    list: () => request<QRoom[]>('/rooms'),
    get: (id: number) => request<QRoomState>(`/rooms/${id}`),
    create: (data: Partial<QRoom>) =>
      request<QRoom>('/rooms', { method: 'POST', body: JSON.stringify(data) }),
    join: (code: string, role?: string) =>
      request<QRoomState>('/rooms/join', { method: 'POST', body: JSON.stringify({ code, role }) }),
    ready: (id: number, ready: boolean) =>
      request<void>(`/rooms/${id}/ready`, { method: 'POST', body: JSON.stringify({ ready }) }),
    start: (id: number) =>
      request<void>(`/rooms/${id}/start`, { method: 'POST' }),
    close: (id: number) =>
      request<void>(`/rooms/${id}`, { method: 'DELETE' }),
  },
}
