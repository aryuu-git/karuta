package security

import (
	"testing"
	"time"
)

func TestWSTicketIsScopedAndSingleUse(t *testing.T) {
	m := NewWSTicketManager(30 * time.Second)
	ticket, _, err := m.Issue(WSTicketIdentity{UserID: 42, Username: "owner"}, "/ws/rooms/7")
	if err != nil {
		t.Fatal(err)
	}
	identity, err := m.Consume(ticket, "/ws/rooms/7")
	if err != nil {
		t.Fatal(err)
	}
	if identity.UserID != 42 || identity.Username != "owner" {
		t.Fatalf("unexpected identity: %+v", identity)
	}
	if _, err := m.Consume(ticket, "/ws/rooms/7"); err == nil {
		t.Fatal("ticket was accepted more than once")
	}

	wrongPath, _, err := m.Issue(WSTicketIdentity{UserID: 42}, "/ws/rooms/8")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Consume(wrongPath, "/ws/rooms/9"); err == nil {
		t.Fatal("ticket was accepted for the wrong path")
	}
}

func TestWSTicketExpires(t *testing.T) {
	m := NewWSTicketManager(time.Second)
	now := time.Unix(100, 0)
	m.now = func() time.Time { return now }
	ticket, _, err := m.Issue(WSTicketIdentity{UserID: 1}, "/ws/rooms/1")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Second)
	if _, err := m.Consume(ticket, "/ws/rooms/1"); err == nil {
		t.Fatal("expired ticket was accepted")
	}
}
