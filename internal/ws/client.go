package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 30 * time.Second
	maxMessageSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for development
	},
}

// Client represents a single WebSocket connection.
type Client struct {
	hub      *RoomHub
	conn     *websocket.Conn
	send     chan []byte
	userID   int64
	username string
	role     string // "player" or "spectator"
}

// wsMessage is the generic message envelope for incoming WS messages.
type wsMessage struct {
	Type     string          `json:"type"`
	CardID   int64           `json:"card_id,omitempty"`
	Text     string          `json:"text,omitempty"`      // chat
	TargetID int64           `json:"target_id,omitempty"` // egg_throw
	Data     json.RawMessage `json:"data,omitempty"`
}

// NewClient creates and registers a new client, then starts its pumps.
func NewClient(hub *RoomHub, conn *websocket.Conn, userID int64, username, role string) *Client {
	c := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		userID:   userID,
		username: username,
		role:     role,
	}
	hub.register <- c
	go c.writePump()
	go c.readPump()
	return c
}

// readPump reads messages from the WebSocket connection.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws read error userID=%d: %v", c.userID, err)
			}
			break
		}

		var msg wsMessage
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("ws unmarshal error userID=%d: %v", c.userID, err)
			continue
		}

		switch msg.Type {
		case "grab":
			if c.role != "spectator" {
				c.hub.HandleGrab(c.userID, msg.CardID)
			}
		case "audio_ended":
			c.hub.HandleAudioEnded()
		case "pause":
			c.hub.PauseGame()
		case "resume":
			c.hub.ResumeGame()
		case "chat":
			if msg.Text != "" {
				c.hub.BroadcastJSON(map[string]interface{}{
					"type":     "chat_message",
					"user_id":  c.userID,
					"username": c.username,
					"role":     c.role,
					"text":     msg.Text,
				})
			}
		case "egg_throw":
			// 丢鸡蛋给指定玩家
			targetName := c.hub.GetUsername(msg.TargetID)
			c.hub.BroadcastJSON(map[string]interface{}{
				"type":        "egg_throw",
				"from_id":     c.userID,
				"from_name":   c.username,
				"target_id":   msg.TargetID,
				"target_name": targetName,
			})
		case "ping":
			// client-side ping, just ignore
		default:
			log.Printf("ws unknown message type=%s userID=%d", msg.Type, c.userID)
		}
	}
}

// writePump writes messages from the send channel to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("ws write error userID=%d: %v", c.userID, err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// UpgradeHandler upgrades the HTTP connection and creates a new Client.
func UpgradeHandler(hub *RoomHub, w http.ResponseWriter, r *http.Request, userID int64, username, role string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	NewClient(hub, conn, userID, username, role)
}
