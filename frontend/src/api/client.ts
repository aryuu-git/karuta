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
function register(username: string, password: string, inviteCode?: string): Promise<AuthResponse> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password, invite_code: inviteCode || '' }),
  })
}

function guestLogin(username: string): Promise<AuthResponse> {
  return request('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ username }),
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

function listPublicCards(params?: { search?: string; series?: string; tag?: string; owner?: string; page?: number; size?: number }): Promise<Card[]> {
  const qs = new URLSearchParams()
  if (params?.search) qs.set('search', params.search)
  if (params?.series) qs.set('series', params.series)
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.owner) qs.set('owner', params.owner)
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

function updateCard(id: number, data: { display_text?: string; series?: string; tags?: string; is_shared?: boolean; share_level?: string }): Promise<Card> {
  return request(`/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

function deleteCard(id: number): Promise<void> {
  return request(`/cards/${id}`, { method: 'DELETE' })
}

function cloneCard(id: number): Promise<Card> {
  return request(`/cards/${id}/clone`, { method: 'POST' })
}

function updateCardCover(id: number, formData: FormData): Promise<Card> {
  return uploadRequest(`/cards/${id}/cover`, formData)
}

function batchShareCards(cardIds: number[], shareLevel: 'private' | 'playable' | 'editable'): Promise<void> {
  return request('/cards/batch-share', {
    method: 'POST',
    body: JSON.stringify({ card_ids: cardIds, share_level: shareLevel }),
  })
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

function listPublicDecks(owner?: string): Promise<Deck[]> {
  const qs = owner ? `?owner=${encodeURIComponent(owner)}` : ''
  return request(`/decks/public${qs}`)
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

interface DuelConfig {
  total_cards?: number
  flip?: boolean
  requeue?: boolean
  max_rounds?: number
  round_time?: number
  grab_chances?: number
  arrange_time?: number
}

function createRoom(deckId: number, intervalSec: number, mode = 'auto', maskEnabled = false, maskDifficulty = 'normal', penaltyWrong = true, penaltySlow = true, shuffleRemaining = 0, randomStart = false, randomStartMax = 50, duelConfig?: DuelConfig, penaltyLast = 0, training = false, minPlayTime = 0, multiAudioMode = 'all'): Promise<Room> {
  const body: Record<string, unknown> = { deck_id: deckId, interval_sec: intervalSec, mode, mask_enabled: maskEnabled, mask_difficulty: maskDifficulty, penalty_wrong: penaltyWrong, penalty_slow: penaltySlow, penalty_last: penaltyLast, shuffle_remaining: shuffleRemaining, random_start: randomStart, random_start_max: randomStartMax, training, min_play_time: minPlayTime, multi_audio_mode: multiAudioMode }
  if (mode === 'duel' && duelConfig) {
    body.duel_total_cards = duelConfig.total_cards ?? 50
    body.duel_flip = duelConfig.flip ?? true
    body.duel_requeue = duelConfig.requeue ?? true
    body.duel_max_rounds = duelConfig.max_rounds ?? 0
    body.duel_round_time = duelConfig.round_time ?? 30
    body.duel_grab_chances = duelConfig.grab_chances ?? 1
    body.duel_arrange_time = duelConfig.arrange_time ?? 60
  }
  return request('/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
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

function claimSeat(roomId: number, seat: 1 | 2): Promise<{ role: string }> {
  return request(`/rooms/${roomId}/claim-seat`, {
    method: 'POST',
    body: JSON.stringify({ seat }),
  })
}

function leaveSeat(roomId: number): Promise<{ role: string }> {
  return request(`/rooms/${roomId}/leave-seat`, { method: 'POST' })
}

function kickFromSeat(roomId: number, userId: number): Promise<void> {
  return request(`/rooms/${roomId}/kick-seat`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

function nextCard(id: number): Promise<void> {
  return request(`/rooms/${id}/next-card`, { method: 'POST' })
}

export const api = {
  auth: {
    register, login, guestLogin, me, myStats,
    updateMe: (username: string) => request<User>('/me', { method: 'PATCH', body: JSON.stringify({ username }) }),
    uploadAvatar: (formData: FormData) => uploadRequest<User>('/me/avatar', formData),
    generateInvite: () => request<{ id: number; code: string }>('/me/invites', { method: 'POST' }),
    listInvites: () => request<Array<{ id: number; code: string; used_by?: number; created_at: string }>>('/me/invites'),
    adminListUsers: () => request<Array<{ id: number; username: string; invited_by: number; disabled: boolean; is_admin: boolean; is_guest: boolean; created_at: string }>>('/admin/users'),
    adminToggleUser: (id: number, disabled: boolean) => request('/admin/users/' + id + '/disable', { method: 'POST', body: JSON.stringify({ disabled }) }),
    adminSetAdmin: (id: number, isAdmin: boolean) => request('/admin/users/' + id + '/admin', { method: 'POST', body: JSON.stringify({ is_admin: isAdmin }) }),
    adminToggleInvite: (enabled: boolean) => request<{ invite_required: boolean }>('/admin/invite-toggle', { method: 'POST', body: JSON.stringify({ enabled }) }),
    adminInviteStatus: () => request<{ invite_required: boolean }>('/admin/invite-status'),
  },
  cards: {
    listMine: listMyCards,
    listTags: () => request<string[]>('/cards/tags'),
    listPublic: listPublicCards,
    get: getCard,
    create: createCard,
    update: updateCard,
    delete: deleteCard,
    clone: cloneCard,
    updateCover: updateCardCover,
    batchShare: batchShareCards,
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
    claimSeat,
    leaveSeat,
    kickFromSeat,
  },
  bangumi: {
    search: (keyword: string, type?: string): Promise<{ data: Array<{ id: number; name: string; name_cn: string; type: number; images?: { large?: string; common?: string } }> }> =>
      request(`/bangumi/search?keyword=${encodeURIComponent(keyword)}${type ? '&type=' + type : ''}`),
  },
}
