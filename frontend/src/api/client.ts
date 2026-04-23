import type { User, Deck, Card, Room, RoomState, RoomListItem, UserStats, AuthResponse } from './types'

const BASE = '/api'

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
  // 204 No Content 或空 body 直接返回
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
      // No Content-Type header - let browser set it with boundary
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || err.error || 'Upload failed')
  }
  return res.json()
}

// Auth
function register(username: string, password: string): Promise<AuthResponse> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

function login(username: string, password: string): Promise<AuthResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

function me(): Promise<User> {
  return request('/me')
}

function myStats(): Promise<UserStats> {
  return request('/me/stats')
}

// Decks
function listDecks(): Promise<Deck[]> {
  return request('/decks')
}

function listPublicDecks(): Promise<Deck[]> {
  return request('/decks/public')
}

function shareDeck(id: number, isPublic: boolean): Promise<{ is_public: boolean }> {
  return request(`/decks/${id}/share`, {
    method: 'POST',
    body: JSON.stringify({ is_public: isPublic }),
  })
}

function getDeck(id: number): Promise<{ deck: Deck; cards: Card[] }> {
  return request(`/decks/${id}`)
}

function createDeck(name: string, description: string): Promise<Deck> {
  return request('/decks', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  })
}

function updateDeck(id: number, name: string, description: string): Promise<Deck> {
  return request(`/decks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, description }),
  })
}

function deleteDeck(id: number): Promise<void> {
  return request(`/decks/${id}`, { method: 'DELETE' })
}

function createCard(
  deckId: number,
  formData: FormData
): Promise<Card> {
  return uploadRequest(`/decks/${deckId}/cards`, formData)
}

function deleteCard(deckId: number, cardId: number): Promise<void> {
  return request(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' })
}

// Rooms
function listRooms(): Promise<RoomListItem[]> {
  return request('/rooms')
}

function createRoom(deckId: number, intervalSec: number, mode = 'auto'): Promise<Room> {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify({ deck_id: deckId, interval_sec: intervalSec, mode }),
  })
}

function playCard(roomId: number, cardId: number): Promise<void> {
  return request(`/rooms/${roomId}/play-card`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId }),
  })
}

function joinRoom(code: string): Promise<{ room: Room; role: string }> {
  return request('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

function getRoom(id: number): Promise<RoomState> {
  return request(`/rooms/${id}`)
}

function startRoom(id: number): Promise<void> {
  return request(`/rooms/${id}/start`, { method: 'POST' })
}

function pauseRoom(id: number): Promise<void> {
  return request(`/rooms/${id}/pause`, { method: 'POST' })
}

function resumeRoom(id: number): Promise<void> {
  return request(`/rooms/${id}/resume`, { method: 'POST' })
}

function setSpectate(id: number, spectate: boolean): Promise<{ role: string }> {
  return request(`/rooms/${id}/spectate`, {
    method: 'POST',
    body: JSON.stringify({ spectate }),
  })
}

function closeRoom(id: number): Promise<void> {
  return request(`/rooms/${id}`, { method: 'DELETE' })
}

function forceEndRoom(id: number): Promise<void> {
  return request(`/rooms/${id}/force-end`, { method: 'POST' })
}

function nextCard(id: number): Promise<void> {
  return request(`/rooms/${id}/next-card`, { method: 'POST' })
}

export const api = {
  auth: { register, login, me, myStats },
  decks: {
    list: listDecks,
    get: getDeck,
    create: createDeck,
    update: updateDeck,
    delete: deleteDeck,
    listPublic: listPublicDecks,
    share: shareDeck,
    createCard,
    deleteCard,
  },
  rooms: {
    list: listRooms,
    create: createRoom,
    join: joinRoom,
    get: getRoom,
    start: startRoom,
    pause: pauseRoom,
    resume: resumeRoom,
    spectate: setSpectate,
    close: closeRoom,
    forceEnd: forceEndRoom,
    nextCard,
    playCard,
  },
}
