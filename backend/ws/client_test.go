package ws

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// 包含旧客户端报告和过期回合报告：个人媒体错误不能触发普通/对阵模式过牌。
func TestMediaFailureDoesNotSkipRoomRound(t *testing.T) {
	for _, role := range []string{"player", "spectator"} {
		t.Run(role, func(t *testing.T) {
			hub := newRoomHub(1, nil)
			hub.session = &GameSession{skipCh: make(chan struct{}, 1)}
			hub.duelSession = &DuelSession{roundTimeoutCh: make(chan struct{}, 1)}
			done := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				defer close(done)
				conn, err := upgrader.Upgrade(w, r, nil)
				if err != nil {
					t.Errorf("upgrade: %v", err)
					return
				}
				client := &Client{hub: hub, conn: conn, userID: 7, username: "mobile", role: role}
				client.readPump()
			}))
			defer server.Close()
			conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				conn.Close()
				select {
				case <-done:
				case <-time.After(time.Second):
					t.Error("client read pump did not exit")
				}
			}()
			for _, roundID := range []int{1, 2, 99, 0} {
				if err := conn.WriteJSON(wsMessage{Type: "media_event", RoundID: roundID, Text: "buffer_fail"}); err != nil {
					t.Fatal(err)
				}
			}
			// 同一连接顺序处理后续聊天，确认前面的媒体报告已全部消费。
			if err := conn.WriteJSON(wsMessage{Type: "chat", Text: "still connected"}); err != nil {
				t.Fatal(err)
			}
			select {
			case raw := <-hub.broadcast:
				var event wsMessage
				if err := json.Unmarshal(raw, &event); err != nil || event.Type != "chat_message" {
					t.Fatalf("unexpected acknowledgement: %s", raw)
				}
			case <-time.After(time.Second):
				t.Fatal("media reports were not processed")
			}
			if len(hub.session.skipCh) != 0 {
				t.Fatal("client media failure skipped the normal room round")
			}
			if len(hub.duelSession.roundTimeoutCh) != 0 {
				t.Fatal("client media failure skipped the duel room round")
			}
		})
	}
}
