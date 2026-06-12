import { CCP_API_BASE } from '../config'

const BASE = CCP_API_BASE

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

async function uploadRequest<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const res = await fetch(BASE + path, {
    method: 'POST',
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Upload failed')
  }
  return res.json()
}

// Types
export interface CcpBank {
  id: number
  name: string
  description: string
  uploader_id: number
  uploader_name?: string
  created_at: number
}

export interface CcpBankImage {
  id: number
  bank_id: number
  image_url: string
  answer_keywords: string
  created_at: number
}

export interface CcpRoom {
  code: string
  host_user_id: number
  status: string
  judge_mode: string
  grid_size: number
  max_guesses: number
  difficulty: string
  blur_level: number
  created_at: number
}

export interface CcpPlayer {
  room_id: string
  user_id: number
  username: string
  avatar_url: string
  is_host: boolean
  is_ready: boolean
  score: number
  guess_count: number
  joined_at: number
}

export interface CcpGameLog {
  id: number
  type: 'reveal' | 'guess' | 'system'
  user_id: number
  username: string
  message: string
  timestamp: number
}

export interface CcpPendingGuess {
  id: number
  user_id: number
  username: string
  word: string
  timestamp: number
}

export interface CcpGameState {
  room_id: string
  status: 'active' | 'completed'
  current_round: number
  max_rounds: number
  player_order: number[]
  current_player_index: number
  revealed_tiles: number[]
  current_image_index: number
  current_blur_level: number
  logs: CcpGameLog[]
  pending_guess: CcpPendingGuess | null
}

export interface RoomImageInfo {
  image_url: string
  answer_keywords: string
}

export interface CcpRoomFullState {
  room: CcpRoom
  players: CcpPlayer[]
  game_state?: CcpGameState
  images: RoomImageInfo[]
}

export interface CcpRoomInfo {
  code: string
  host_user_id: number
  host_username: string
  player_count: number
  difficulty: string
  judge_mode: string
  status: string
}

// API
export const ccpApi = {
  themes: {
    list: () => request<CcpBank[]>('/themes'),
    get: (id: number) => request<CcpBank>(`/themes/${id}`),
    create: (data: { name: string; description?: string }) =>
      request<CcpBank>('/themes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<CcpBank>) =>
      request<void>(`/themes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/themes/${id}`, { method: 'DELETE' }),
    listImages: (bankId: number) => request<CcpBankImage[]>(`/themes/${bankId}/images`),
    uploadImage: (bankId: number, formData: FormData) =>
      uploadRequest<CcpBankImage>(`/themes/${bankId}/images`, formData),
    deleteImage: (imageId: number) => request<void>(`/themes/images/${imageId}`, { method: 'DELETE' }),
  },
  rooms: {
    list: () => request<CcpRoomInfo[]>('/rooms'),
    get: (code: string) => request<CcpRoomFullState>(`/rooms/${code}`),
    create: (data?: { judge_mode?: string; grid_size?: number; max_guesses?: number; difficulty?: string; blur_level?: number }) =>
      request<CcpRoom>('/rooms', { method: 'POST', body: JSON.stringify(data || {}) }),
    update: (code: string, data: Record<string, unknown>) =>
      request<CcpRoom>(`/rooms/${code}`, { method: 'PUT', body: JSON.stringify(data) }),
    join: (code: string) =>
      request<{ status: string }>(`/rooms/${code}/join`, { method: 'POST' }),
    ready: (code: string) =>
      request<{ status: string }>(`/rooms/${code}/ready`, { method: 'POST' }),
    removeImage: (code: string, imageUrl: string) =>
      request<{ status: string }>(`/rooms/${code}/remove-image`, { method: 'POST', body: JSON.stringify({ image_url: imageUrl }) }),
    randomImages: (code: string, count: number, bankId?: number) =>
      request<{ status: string }>(`/rooms/${code}/random-images`, { method: 'POST', body: JSON.stringify({ count, bank_id: bankId }) }),
    addImage: (code: string, imageUrl: string, answerKeywords?: string) =>
      request<{ status: string }>(`/rooms/${code}/add-image`, { method: 'POST', body: JSON.stringify({ image_url: imageUrl, answer_keywords: answerKeywords || '' }) }),
  },
  games: {
    start: (code: string) =>
      request<{ status: string }>(`/games/${code}/start`, { method: 'POST' }),
    getState: (code: string) =>
      request<CcpRoomFullState>(`/games/${code}/state`),
    endGame: (code: string) =>
      request<{ status: string }>(`/games/${code}/end-game`, { method: 'POST' }),
    resetGame: (code: string) =>
      request<{ status: string }>(`/games/${code}/reset`, { method: 'POST' }),
  },
}
