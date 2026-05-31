package quadrant

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client represents a connected WebSocket user
type Client struct {
	hub       *Hub
	conn      *websocket.Conn
	send      chan []byte
	userID    int64
	username  string
	role      string
}

// Hub manages WebSocket connections for a single quadrant room
type Hub struct {
	roomID     int64
	manager    *HubManager
	clients    map[int64]*Client
	mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	stopCh     chan struct{}
	session    *GameSession
}

// HubManager manages all active quadrant hubs
type HubManager struct {
	mu   sync.RWMutex
	hubs map[int64]*Hub
}

func NewHubManager() *HubManager {
	return &HubManager{hubs: make(map[int64]*Hub)}
}

func (m *HubManager) GetOrCreate(roomID int64) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()
	if h, ok := m.hubs[roomID]; ok {
		return h
	}
	h := &Hub{
		roomID:     roomID,
		manager:    m,
		clients:    make(map[int64]*Client),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client, 8),
		unregister: make(chan *Client, 8),
		stopCh:     make(chan struct{}),
	}
	m.hubs[roomID] = h
	go h.run()
	return h
}

func (m *HubManager) Get(roomID int64) *Hub {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.hubs[roomID]
}

func (m *HubManager) Remove(roomID int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.hubs, roomID)
}

func (h *Hub) run() {
	idleTimer := time.NewTimer(10 * time.Minute)
	defer idleTimer.Stop()

	for {
		select {
		case <-h.stopCh:
			h.mu.Lock()
			for _, c := range h.clients {
				close(c.send)
			}
			h.clients = make(map[int64]*Client)
			h.mu.Unlock()
			h.manager.Remove(h.roomID)
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
				"type":     "player_joined",
				"user_id":  client.userID,
				"username": client.username,
				"role":     client.role,
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

func (h *Hub) Stop() {
	select {
	case <-h.stopCh:
	default:
		close(h.stopCh)
	}
}

func (h *Hub) BroadcastJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
	}
}

func (h *Hub) SendToUser(userID int64, v interface{}) {
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

func (h *Hub) OnlinePlayers() []int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	ids := make([]int64, 0, len(h.clients))
	for id, c := range h.clients {
		if c.role == "player" {
			ids = append(ids, id)
		}
	}
	return ids
}

// UpgradeAndServe upgrades HTTP to WebSocket and starts read/write pumps
func UpgradeAndServe(hub *Hub, w http.ResponseWriter, r *http.Request, userID int64, username, role string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("quadrant ws upgrade error: %v", err)
		return
	}
	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   userID,
		username: username,
		role:     role,
	}
	hub.register <- client
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
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

func (c *Client) writePump() {
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
