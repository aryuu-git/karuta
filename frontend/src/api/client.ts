import type { User, Deck, Card, CardAudio, Room, RoomState, RoomListItem, UserStats, AuthResponse } from './types'

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

// Cards (Library)
function listMyCards(): Promise<Card[]> {
  return request('/cards/mine')
}

function listPublicCards(params?: { search?: string; series?: string; tag?: string; page?: number; size?: number }): Promise<Card[]> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.series) qs.set('series', params.series)
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.page) qs.set('page', String(params.page))
  if (params?.size) qs.set('size', String(params.size))
  const q = qs.toString()
  return request(`/cards/public${q ? '?' + q : ''}`)
}

function getCard(id: number): Promise<{ card: Card; audios: CardAudio[] }> {
  return request(`/cards/${id}`)
}

function createCard(formData: FormData): Promise<Card> {
  return uploadRequest('/cards', formData)
}

function updateCard(id: number, data: { display_text?: string; series?: string; tags?: string; is_shared?: boolean }): Promise<Card> {
  return request(`/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

function deleteCard(id: number): Promise<void> {
  return request(`/cards/${id}`, { method: 'DELETE' })
}

function addAudioToCard(cardId: number, formData: FormData): Promise<CardAudio> {
  return uploadRequest(`/cards/${cardId}/audios`, formData)
}

function updateAudioHint(cardId: number, audioId: number, hintText: string): Promise<CardAudio> {
  return request(`/cards/${cardId}/audios/${audioId}`, {
    method: 'PATCH',
    body: JSON.stringify({ hint_text: hintText }),
  })
}

function deleteAudioFromCard(cardId: number, audioId: number): Promise<void> {
  return request(`/cards/${cardId}/audios/${audioId}`, { method: 'DELETE' })
}

// Decks
function listMyDecks(): Promise<Deck[]> {
  return request('/decks/mine')
}

function listPublicDecks(): Promise<Deck[]> {
  return request('/decks/public')
}

function listEditableDecks(): Promise<Deck[]> {
  return request('/decks/editable')
}

function getDeck(id: number): Promise<{ deck: Deck; cards: Card[] }> {
  return request(`/decks/${id}`)
}

function createDeck(name: string, description: string, shareLevel?: string, editLevel?: string): Promise<Deck> {
  return request('/decks', {
    method: 'POST',
    body: JSON.stringify({ name, description, share_level: shareLevel || 'private', edit_level: editLevel || 'add_only' }),
  })
}

function updateDeck(id: number, data: { name?: string; description?: string; share_level?: string; edit_level?: string }): Promise<Deck> {
  return request(`/decks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

function deleteDeck(id: number): Promise<void> {
  return request(`/decks/${id}`, { method: 'DELETE' })
}

function shareDeck(id: number, isPublic: boolean): Promise<{ is_public: boolean }> {
  return request(`/decks/${id}/share`, {
    method: 'POST',
    body: JSON.stringify({ is_public: isPublic }),
  })
}

function addCardsToDeck(deckId: number, cardIds: number[]): Promise<void> {
  return request(`/decks/${deckId}/cards`, {
    method: 'POST',
    body: JSON.stringify({ card_ids: cardIds }),
  })
}

function removeCardFromDeck(deckId: number, cardId: number): Promise<void> {
  return request(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' })
}

function cloneDeck(id: number, mode: 'full' | 'covers_only' = 'full'): Promise<Deck> {
  return request(`/decks/${id}/clone`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}

// Legacy: createCard on deck (keep for backward compat during transition)
function createCardOnDeck(deckId: number, formData: FormData): Promise<Card> {
  return uploadRequest(`/decks/${deckId}/cards`, formData)
}

function deleteCardFromDeck(deckId: number, cardId: number): Promise<void> {
  return request(`/decks/${deckId}/cards/${cardId}`, { method: 'DELETE' })
}

// Rooms
function listRooms(): Promise<RoomListItem[]> {
  return request('/rooms')
}

function createRoom(deckId: number, intervalSec: number, mode = 'auto', maskEnabled = false, maskDifficulty = 'normal', penaltyWrong = true, penaltySlow = true, shuffleRemaining = 0, randomStart = false, randomStartMax = 50): Promise<Room> {
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify({ deck_id: deckId, interval_sec: intervalSec, mode, mask_enabled: maskEnabled, mask_difficulty: maskDifficulty, penalty_wrong: penaltyWrong, penalty_slow: penaltySlow, shuffle_remaining: shuffleRemaining, random_start: randomStart, random_start_max: randomStartMax }),
  })
}

function playCard(roomId: number, cardId: number, cardAudioId?: number): Promise<void> {
  return request(`/rooms/${roomId}/play-card`, {
    method: 'POST',
    body: JSON.stringify({ card_id: cardId, card_audio_id: cardAudioId || 0 }),
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

function kickPlayer(roomId: number, userId: number): Promise<void> {
  return request(`/rooms/${roomId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

function forceEndRoom(id: number): Promise<void> {
  return request(`/rooms/${id}/force-end`, { method: 'POST' })
}

function nextCard(id: number): Promise<void> {
  return request(`/rooms/${id}/next-card`, { method: 'POST' })
}

export const api = {
  auth: { register, login, me, myStats },
  cards: {
    listMine: listMyCards,
    listPublic: listPublicCards,
    get: getCard,
    create: createCard,
    update: updateCard,
    delete: deleteCard,
    addAudio: addAudioToCard,
    updateAudioHint: updateAudioHint,
    deleteAudio: deleteAudioFromCard,
  },
  decks: {
    listMine: listMyDecks,
    list: listMyDecks, // backward compat alias
    listPublic: listPublicDecks,
    listEditable: listEditableDecks,
    get: getDeck,
    create: createDeck,
    update: updateDeck,
    delete: deleteDeck,
    share: shareDeck,
    addCards: addCardsToDeck,
    removeCard: removeCardFromDeck,
    clone: cloneDeck,
    createCard: createCardOnDeck,
    deleteCard: deleteCardFromDeck,
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
    kick: kickPlayer,
    forceEnd: forceEndRoom,
    nextCard,
    playCard,
  },
}
