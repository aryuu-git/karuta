package ws

import (
	"encoding/json"
	"sync"
	"time"

	"karuta/backend/model"
	"karuta/backend/store"
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

// DisconnectUserEverywhere 将用户从全部房间 hub 断开（禁用账号时调用，
// 消除"禁用后存量 WS 连接仍可抢牌聊天"的语义缺口，D12-补3）。
func (m *HubManager) DisconnectUserEverywhere(userID int64) {
	m.mu.RLock()
	hubs := make([]*RoomHub, 0, len(m.hubs))
	for _, h := range m.hubs {
		hubs = append(hubs, h)
	}
	m.mu.RUnlock()
	// 锁外调用：DisconnectUser 内部走 unregister channel，避免持 manager 锁等待 hub
	for _, h := range hubs {
		h.DisconnectUser(userID)
	}
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

// Stats 返回当前活跃 hub 数与全部 hub 的连接总数（供 /metrics 端点）。
// 各 hub 的连接数在读取其内部互斥锁时获取，瞬态误差可接受。
func (m *HubManager) Stats() (hubs int, connections int) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	hubs = len(m.hubs)
	for _, h := range m.hubs {
		connections += h.ConnectionCount()
	}
	return hubs, connections
}

// StopAll closes every active room hub. It is used during graceful process
// shutdown so clients receive a clean connection close instead of waiting for
// the operating system to terminate sockets.
func (m *HubManager) StopAll() {
	m.mu.RLock()
	hubs := make([]*RoomHub, 0, len(m.hubs))
	for _, hub := range m.hubs {
		hubs = append(hubs, hub)
	}
	m.mu.RUnlock()
	for _, hub := range hubs {
		hub.Stop()
	}
}

// RoomHub is the WebSocket hub for a single room.
type RoomHub struct {
	RoomID      int64
	manager     *HubManager
	clients     map[*Client]bool
	broadcast   chan []byte
	register    chan *Client
	unregister  chan *Client
	session     *GameSession
	duelSession *DuelSession
	stopCh      chan struct{}
	mu          sync.RWMutex

	// game control channels exposed to HTTP handlers
	pauseCh  chan struct{}
	resumeCh chan struct{}
}

// LiveBoard 返回进行中对局的权威棋盘投影（剩余次数 + 已出结果牌）；
// 无进行中对局（未开局/已结束/服务重启）时返回 nil，调用方回退 DB 推导。
func (h *RoomHub) LiveBoard() (map[int64]int, []map[string]interface{}) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess == nil {
		return nil, nil
	}
	return sess.SnapshotBoard()
}

// ConnectionCount 返回当前注册的客户端连接数（供 /metrics 端点）。
func (h *RoomHub) ConnectionCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
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
			// 先终止对局会话（2026-09-21 修复：管理员强停/房主解散只停 hub 的话，
			// GameSession/DuelSession 独立 goroutine 会跑完整副牌——持续计时、
			// 写 game_records 流水、结算发成就，全是无人房间的脏数据）。
			// Stop 幂等：结算路径（broadcastGameOver/endGame）自调 hub.Stop 时
			// 会话已近尾声，重复 close 走 select-default 无害。
			h.mu.RLock()
			sess, ds := h.session, h.duelSession
			h.mu.RUnlock()
			if sess != nil {
				sess.Stop()
			}
			if ds != nil {
				ds.Stop()
			}
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
			ds := h.duelSession
			h.mu.Unlock()
			// 广播玩家加入
			if data, err := json.Marshal(map[string]interface{}{
				"type":       "player_joined",
				"user_id":    client.userID,
				"username":   client.username,
				"avatar_url": client.avatarURL,
				"role":       client.role,
			}); err == nil {
				h.broadcast <- data
			}
			// 游戏进行中，向新连接单独推送当前状态
			if sess != nil {
				go sess.SendRoomStateToClient(client)
			}
			if ds != nil {
				go ds.SendDuelStateToClient(client)
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

// DisconnectUser forcibly disconnects a user from the hub.
func (h *RoomHub) DisconnectUser(userID int64) {
	h.mu.RLock()
	var target *Client
	for c := range h.clients {
		if c.userID == userID {
			target = c
			break
		}
	}
	h.mu.RUnlock()
	if target != nil {
		select {
		case h.unregister <- target:
		default:
		}
	}
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

// StartDuelGame initializes a duel session.
func (h *RoomHub) StartDuelGame(room *model.Room, cards []*model.Card, s *store.Store, player1, player2 int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.duelSession != nil {
		return
	}
	ds := newDuelSession(h, room, cards, s, player1, player2)
	h.duelSession = ds
	go ds.Run()
}

// HandleDuelGrab routes a grab to the duel session.
func (h *RoomHub) HandleDuelGrab(userID, cardID int64) {
	h.mu.RLock()
	ds := h.duelSession
	h.mu.RUnlock()
	if ds != nil {
		ds.HandleGrab(userID, cardID)
	}
}

// HandleDuelArrangeSwap routes an arrange swap to the duel session.
func (h *RoomHub) HandleDuelArrangeSwap(userID int64, posA, posB int, cross bool) {
	h.mu.RLock()
	ds := h.duelSession
	h.mu.RUnlock()
	if ds != nil {
		ds.HandleArrangeSwap(userID, posA, posB, cross)
	}
}

// HandleDuelArrangeReady routes an arrange ready to the duel session.
func (h *RoomHub) HandleDuelArrangeReady(userID int64) {
	h.mu.RLock()
	ds := h.duelSession
	h.mu.RUnlock()
	if ds != nil {
		ds.HandleArrangeReady(userID)
	}
}

// HandleDuelGiveCard routes a give_card to the duel session.
func (h *RoomHub) HandleDuelGiveCard(userID, cardID int64) {
	h.mu.RLock()
	ds := h.duelSession
	h.mu.RUnlock()
	if ds != nil {
		ds.HandleGiveCard(userID, cardID)
	}
}

// SendDuelStateToClient sends duel state to a reconnecting client.
func (h *RoomHub) SendDuelStateToClient(client *Client) {
	h.mu.RLock()
	ds := h.duelSession
	h.mu.RUnlock()
	if ds != nil {
		ds.SendDuelStateToClient(client)
	}
}

// HandleAudioEnded notifies the session that audio has finished playing.
func (h *RoomHub) HandleAudioEnded(userID int64, roundID int) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.NotifyAudioEnded(userID, roundID)
	}
}

// HandleGrab routes a grab message to the active game session.
// cmdID 为客户端命令 ID，透传给会话做幂等去重。
func (h *RoomHub) HandleGrab(userID, cardID int64, cmdID int64) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.HandleGrab(userID, cardID, cmdID)
	}
}

// PauseGame signals the game session to pause.
func (h *RoomHub) PauseGame() {
	h.mu.RLock()
	sess := h.session
	ds := h.duelSession
	h.mu.RUnlock()
	if sess != nil {
		sess.Pause()
	}
	if ds != nil {
		ds.Pause()
	}
}

// SkipCard signals the game session to skip the current card.
func (h *RoomHub) SkipCard() {
	h.mu.RLock()
	sess := h.session
	ds := h.duelSession
	h.mu.RUnlock()
	if sess != nil {
		sess.SkipCard()
	}
	if ds != nil {
		ds.SkipCard()
	}
}

// ResumeGame signals the game session to resume.
func (h *RoomHub) ResumeGame() {
	h.mu.RLock()
	sess := h.session
	ds := h.duelSession
	h.mu.RUnlock()
	if sess != nil {
		sess.Resume()
	}
	if ds != nil {
		ds.Resume()
	}
}

// JudgePlayCard signals the game session that the judge has chosen a card to play.
func (h *RoomHub) JudgePlayCard(cardID, cardAudioID int64) {
	h.mu.RLock()
	sess := h.session
	h.mu.RUnlock()
	if sess != nil {
		sess.JudgePlayCard(cardID, cardAudioID)
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
