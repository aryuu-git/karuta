package ccp

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type CcpLocalLiveHub struct {
	mu      sync.RWMutex
	clients map[*CcpLocalLiveClient]bool
	state   map[string]interface{}
}

type CcpLocalLiveClient struct {
	hub  *CcpLocalLiveHub
	conn *websocket.Conn
	send chan []byte
}

func NewCcpLocalLiveHub() *CcpLocalLiveHub {
	return &CcpLocalLiveHub{
		clients: make(map[*CcpLocalLiveClient]bool),
		state: map[string]interface{}{
			"screen":          "idle",
			"images":          []interface{}{},
			"currentImageIdx": 0,
			"grid":            map[string]int{"rows": 5, "cols": 5},
			"blurRadius":      0,
			"maskChance":      0,
			"flipped":         []int{},
			"version":         time.Now().UnixMilli(),
		},
	}
}

func (h *CcpLocalLiveHub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := ccUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ccp local ws upgrade error: %v", err)
		return
	}

	client := &CcpLocalLiveClient{
		hub:  h,
		conn: conn,
		send: make(chan []byte, 32),
	}

	h.mu.Lock()
	h.clients[client] = true
	state := h.state
	h.mu.Unlock()

	client.sendJSON(map[string]interface{}{"type": "state_update", "data": state})
	go client.writePump()
	client.readPump()
}

func (h *CcpLocalLiveHub) setState(state map[string]interface{}) {
	h.mu.Lock()
	state["version"] = time.Now().UnixMilli()
	h.state = state
	h.mu.Unlock()
	h.broadcast(map[string]interface{}{"type": "state_update", "data": state})
}

func (h *CcpLocalLiveHub) broadcast(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func (h *CcpLocalLiveHub) remove(client *CcpLocalLiveClient) {
	h.mu.Lock()
	if h.clients[client] {
		delete(h.clients, client)
		close(client.send)
	}
	h.mu.Unlock()
}

func (c *CcpLocalLiveClient) readPump() {
	defer func() {
		c.hub.remove(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(25 << 20)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type string                 `json:"type"`
			Data map[string]interface{} `json:"data"`
		}
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "set_state":
			if msg.Data != nil {
				c.hub.setState(msg.Data)
			}
		case "chat":
			c.hub.broadcast(map[string]interface{}{
				"type": "chat",
				"data": msg.Data,
			})
		case "action":
			c.hub.broadcast(map[string]interface{}{
				"type": "action",
				"data": msg.Data,
			})
		case "ping":
		default:
		}
	}
}

func (c *CcpLocalLiveClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
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

func (c *CcpLocalLiveClient) sendJSON(v interface{}) {
	data, err := json.Marshal(v)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}
