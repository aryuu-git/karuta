package ws

import (
	"encoding/json"
	"sync"
	"time"

	"karuta/internal/model"
	"karuta/internal/store"
)

// HubManager manages all active room hubs.
type HubManager struct {
	mu   sync.RWMutex
	hubs map[int64]*RoomHub
}

func NewHubManager() *HubManager {
	return &HubManager{
		hubs: make(map[int64]*RoomHub),
	}
}

// GetOrCreate returns an existing hub or creates and starts a new one.
func (m *HubManager) GetOrCreate(roomID int64) *RoomHub {
	m.mu.Lock()
	defer m.mu.Unlock()

	if h, ok := m.hubs[roomID]; ok {
		return h
	}
	h := newRoomHub(roomID, m)
	m.hubs[roomID] = h
	go h.Run()
	return h
}

// Get returns an existing hub or nil.
func (m *HubManager) Get(roomID int64) *RoomHub {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.hubs[roomID]
}

// Remove deletes a hub from the manager (called after game ends).
func (m *HubManager) Remove(roomID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.hubs, roomID)
}

// RoomHub is the WebSocket hub for a single room.
type RoomHub struct {
	RoomID     int64
	manager    *HubManager
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	session    *GameSession
	stopCh     chan struct{}
	mu         sync.RWMutex

	// game control channels exposed to HTTP handlers
	pauseCh  chan struct{}
	resumeCh chan struct{}
}

func newRoomHub(roomID int64, manager *HubManager) *RoomHub {
	return &RoomHub{
		RoomID:     roomID,
		manager:    manager,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		stopCh:     make(chan struct{}),
		pauseCh:    make(chan struct{}, 1),
		resumeCh:   make(chan struct{}, 1),
	}
}

// Stop terminates the hub goroutine and removes it from the manager.
func (h *RoomHub) Stop() {
	select {
	case <-h.stopCh:
	default:
		close(h.stopCh)
	}
}

// Run is the main event loop for the hub.
func (h *RoomHub) Run() {
	for {
		select {
		case <-h.stopCh:
			h.mu.Lock()
			for client := range h.clients {
				close(client.send)
			}
			h.clients = make(map[*Client]bool)
			h.mu.Unlock()
			if h.manager != nil {
				h.manager.Remove(h.RoomID)
			}
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			sess := h.session
			h.mu.Unlock()
			// 广播玩家加入
			if data, err := json.Marshal(map[string]interface{}{
				"type":     "player_joined",
				"user_id":  client.userID,
								"username": client.username,
				"role":     client.role,
			}); err == nil {
				h.broadcast <- data
			}
			// 游戏进行中，向新连接单独推送当前状态
			if sess != nil {
				go sess.SendRoomStateToClient(client)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			remaining := len(h.clients)
			h.mu.Unlock()
			// 广播玩家离线
			if data, err := json.Marshal(map[string]interface{}{
				"type":    "player_offline",
				"user_id": client.userID,
			}); err == nil {
				select {
				case h.broadcast <- data:
				default:
				}
			}

			// 裁判模式：裁判断线，通知 session 进入等待重连状态
			h.mu.RLock()
			sess := h.session
			h.mu.RUnlock()
			if sess != nil && sess.IsJudge(client.userID) {
				go sess.OnJudgeDisconnected()
			}

			// 如果没有在线玩家了，延时自动关闭（游戏中30s，等待大厅10min）
			if remaining == 0 {
				go func() {
					h.mu.RLock()
					sess := h.session
					h.mu.RUnlock()
					timeout := 30 * time.Second
					if sess == nil {
						timeout = 10 * time.Minute
					}
					time.Sleep(timeout)
					// 再次检查是否还是 0 人（可能有人重连了）
					h.mu.RLock()
					stillEmpty := len(h.clients) == 0
					h.mu.RUnlock()
					if stillEmpty {
						// 没有在线客户端，直接关闭即可，不需要广播
						h.Stop()
					}
				}()
			}

		case msg := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- msg:
				default:
					// Drop slow clients
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Broadcast sends a message to all connected clients (non-blocking).
func (h *RoomHub) Broadcast(msg []byte) {
	select {
	case h.broadcast <- msg:
	default:
	}
}

// BroadcastJSON marshals v and broadcasts it.
func (h *RoomHub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	h.Broadcast(data)
}

// SendToUser sends a message to a specific user.
func (h *RoomHub) SendToUser(userID int64, msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		if client.userID == userID {
			select {
			case client.send <- msg:
			default:
			}
		}
	}
}

// SendJSONToUser marshals v and sends it to the specified user.
func (h *RoomHub) SendJSONToUser(userID int64, v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	h.SendToUser(userID, data)
}

// OnlineUserIDs returns the list of currently connected user IDs.
func (h *RoomHub) OnlineUserIDs() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]int64, 0, len(h.clients))
	for c := range h.clients {
		ids = append(ids, c.userID)
	}
	return ids
}

// StartGame initialises and starts a new game session in a goroutine.
func (h *RoomHub) StartGame(room *model.Room, cards []*model.Card, s *store.Store) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.session != nil {
		return // already running
	}
	sess := newGameSession(h, room, cards, s)
	h.session = sess
	go sess.Run()
}

// HandleAudioEnded notifies the session that audio has finished playing.
func (h *RoomHub) HandleAudioEnded() {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.NotifyAudioEnded()
	}
}

// HandleGrab routes a grab message to the active game session.
func (h *RoomHub) HandleGrab(userID, cardID int64) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.HandleGrab(userID, cardID)
	}
}

// PauseGame signals the game session to pause.
func (h *RoomHub) PauseGame() {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.Pause()
	}
}

// SkipCard signals the game session to skip the current card.
func (h *RoomHub) SkipCard() {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.SkipCard()
	}
}

// ResumeGame signals the game session to resume.
func (h *RoomHub) ResumeGame() {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.Resume()
	}
}

// JudgePlayCard signals the game session that the judge has chosen a card to play.
func (h *RoomHub) JudgePlayCard(cardID int64) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.JudgePlayCard(cardID)
	}
}

// GetUsername returns the username for a given userID (from connected clients).
func (h *RoomHub) GetUsername(userID int64) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.userID == userID {
			return c.username
		}
	}
	return ""
}

// OnlinePlayerIDs returns IDs of connected clients that are NOT spectators.
func (h *RoomHub) OnlinePlayerIDs() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]int64, 0, len(h.clients))
	for c := range h.clients {
		if c.role != "spectator" {
			ids = append(ids, c.userID)
		}
	}
	return ids
}

// UpdateClientRole updates the role of a connected client.
func (h *RoomHub) UpdateClientRole(userID int64, role string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		if c.userID == userID {
			c.role = role
			return
		}
	}
}
