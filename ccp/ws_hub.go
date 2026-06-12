package ccp

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var ccUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// CcpClient WebSocket 客户端连接
type CcpClient struct {
	hub      *CcpHub
	conn     *websocket.Conn
	send     chan []byte
	userID   int64
	username string
	isHost   bool
}

// CcpHub 每房间的 WebSocket Hub
type CcpHub struct {
	code       string
	manager    *CcpHubManager
	clients    map[int64]*CcpClient
	mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *CcpClient
	unregister chan *CcpClient
	stopCh     chan struct{}
	session    *CcpGameSession
}

// CcpHubManager 管理所有活跃的 CCP 房间 Hub
type CcpHubManager struct {
	mu   sync.RWMutex
	hubs map[string]*CcpHub
}

// NewCcpHubManager 创建 HubManager
func NewCcpHubManager() *CcpHubManager {
	return &CcpHubManager{hubs: make(map[string]*CcpHub)}
}

// GetOrCreate 获取或创建房间 Hub
func (m *CcpHubManager) GetOrCreate(code string) *CcpHub {
	m.mu.Lock()
	defer m.mu.Unlock()
	if h, ok := m.hubs[code]; ok {
		return h
	}
	h := &CcpHub{
		code:       code,
		manager:    m,
		clients:    make(map[int64]*CcpClient),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *CcpClient, 8),
		unregister: make(chan *CcpClient, 8),
		stopCh:     make(chan struct{}),
	}
	m.hubs[code] = h
	go h.run()
	return h
}

// Get 获取已有 Hub
func (m *CcpHubManager) Get(code string) *CcpHub {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.hubs[code]
}

// Remove 移除 Hub
func (m *CcpHubManager) Remove(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.hubs, code)
}

func (h *CcpHub) run() {
	idleTimer := time.NewTimer(10 * time.Minute)
	defer idleTimer.Stop()

	for {
		select {
		case <-h.stopCh:
			h.mu.Lock()
			for _, c := range h.clients {
				close(c.send)
			}
			h.clients = make(map[int64]*CcpClient)
			h.mu.Unlock()
			h.manager.Remove(h.code)
			return

		case client := <-h.register:
			h.mu.Lock()
			if old, ok := h.clients[client.userID]; ok {
				close(old.send)
			}
			h.clients[client.userID] = client
			h.mu.Unlock()
			idleTimer.Stop()
			h.BroadcastJSON(map[string]interface{}{
				"type":      "player_joined",
				"user_id":   client.userID,
				"username":  client.username,
			})
			if h.session != nil {
				h.session.SendStateToClient(client)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if cur, ok := h.clients[client.userID]; ok && cur == client {
				close(client.send)
				delete(h.clients, client.userID)
			}
			empty := len(h.clients) == 0
			h.mu.Unlock()
			h.BroadcastJSON(map[string]interface{}{
				"type":    "player_offline",
				"user_id": client.userID,
			})
			if empty {
				idleTimer.Reset(5 * time.Minute)
			}

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, c := range h.clients {
				select {
				case c.send <- msg:
				default:
				}
			}
			h.mu.RUnlock()

		case <-idleTimer.C:
			h.mu.RLock()
			empty := len(h.clients) == 0
			h.mu.RUnlock()
			if empty {
				close(h.stopCh)
			}
		}
	}
}

// Stop 停止 Hub
func (h *CcpHub) Stop() {
	select {
	case <-h.stopCh:
	default:
		close(h.stopCh)
	}
}

// BroadcastJSON 广播 JSON 消息
func (h *CcpHub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
	}
}

// SendToUser 发送消息给指定用户
func (h *CcpHub) SendToUser(userID int64, v interface{}) {
	h.mu.RLock()
	c, ok := h.clients[userID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

// CcpUpgradeAndServe 升级 HTTP 为 WebSocket 并启动读写协程
func CcpUpgradeAndServe(hub *CcpHub, w http.ResponseWriter, r *http.Request, userID int64, username string, isHost bool) {
	conn, err := ccUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ccp ws upgrade error: %v", err)
		return
	}
	client := &CcpClient{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   userID,
		username: username,
		isHost:   isHost,
	}
	hub.register <- client
	go client.writePump()
	go client.readPump()
}

func (c *CcpClient) readPump() {
	defer func() {
		select {
		case c.hub.unregister <- c:
		default:
		}
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var msg struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}
		if msg.Type == "ping" {
			continue
		}
		if c.hub.session != nil {
			c.hub.session.HandleMessage(c, msg.Type, msg.Data)
		}
	}
}

func (c *CcpClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
