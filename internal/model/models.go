package model

import "time"

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

type Deck struct {
	ID          int64     `json:"id"`
	OwnerID     int64     `json:"owner_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsPublic    bool      `json:"is_public"`
	CardCount   int       `json:"card_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	OwnerName   string    `json:"owner_name,omitempty"`
}

type Card struct {
	ID          int64     `json:"id"`
	DeckID      int64     `json:"deck_id"`
	AudioPath   string    `json:"audio_path"`
	AudioURL    string    `json:"audio_url,omitempty"`
	CoverPath   string    `json:"cover_path"`
	CoverURL    string    `json:"cover_url,omitempty"`
	HintText    string    `json:"hint_text"`
	DisplayText string    `json:"display_text"`
	SortOrder   int       `json:"sort_order"`
	CreatedAt   time.Time `json:"created_at"`
}

type Room struct {
	ID          int64     `json:"id"`
	Code        string    `json:"code"`
	DeckID      int64     `json:"deck_id"`
	HostID      int64     `json:"host_id"`
	Status      string    `json:"status"` // waiting/reading/judging/paused/end
	IntervalSec int       `json:"interval_sec"`
	Mode        string    `json:"mode"` // "auto" | "judge"
	CreatedAt   time.Time `json:"created_at"`
}

type RoomPlayer struct {
	RoomID   int64     `json:"room_id"`
	UserID   int64     `json:"user_id"`
	Username string    `json:"username"`
	Role     string    `json:"role"` // player/spectator
	Score    int       `json:"score"`
	Online   bool      `json:"online"`
	JoinedAt time.Time `json:"joined_at"`
}

type GameRecord struct {
	ID        int64     `json:"id"`
	RoomID    int64     `json:"room_id"`
	CardID    int64     `json:"card_id"`
	WinnerID  *int64    `json:"winner_id"`
	GrabbedAt time.Time `json:"grabbed_at"`
}
