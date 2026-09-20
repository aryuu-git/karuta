package security

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

var ErrInvalidWSTicket = errors.New("invalid, expired, or already used websocket ticket")

type WSTicketIdentity struct {
	UserID   int64
	Username string
}

type wsTicket struct {
	identity  WSTicketIdentity
	path      string
	expiresAt time.Time
}

// WSTicketManager issues short-lived, single-use credentials for WebSocket
// upgrades. JWTs stay in the Authorization header of the ticket request and
// never appear in proxy logs, browser history, or WebSocket URLs.
type WSTicketManager struct {
	mu      sync.Mutex
	tickets map[string]wsTicket
	ttl     time.Duration
	now     func() time.Time
}

func NewWSTicketManager(ttl time.Duration) *WSTicketManager {
	if ttl <= 0 {
		ttl = 30 * time.Second
	}
	return &WSTicketManager{
		tickets: make(map[string]wsTicket),
		ttl:     ttl,
		now:     time.Now,
	}
}

func (m *WSTicketManager) Issue(identity WSTicketIdentity, path string) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := m.now()
	expiresAt := now.Add(m.ttl)

	m.mu.Lock()
	defer m.mu.Unlock()
	for key, ticket := range m.tickets {
		if !ticket.expiresAt.After(now) {
			delete(m.tickets, key)
		}
	}
	m.tickets[token] = wsTicket{identity: identity, path: path, expiresAt: expiresAt}
	return token, expiresAt, nil
}

func (m *WSTicketManager) Consume(token, path string) (WSTicketIdentity, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ticket, ok := m.tickets[token]
	if ok {
		// Delete before validation so every presented ticket is single-use, even
		// when it is accidentally sent to the wrong WebSocket endpoint.
		delete(m.tickets, token)
	}
	if !ok || ticket.path != path || !ticket.expiresAt.After(m.now()) {
		return WSTicketIdentity{}, ErrInvalidWSTicket
	}
	return ticket.identity, nil
}
