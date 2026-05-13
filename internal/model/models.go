package model

import "time"

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	InvitedBy int64     `json:"invited_by"`
	Disabled  bool      `json:"disabled"`
	IsAdmin    bool      `json:"is_admin"`
	IsGuest    bool      `json:"is_guest"`
	AvatarPath string    `json:"-"`
	AvatarURL  string    `json:"avatar_url,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type Deck struct {
	ID          int64     `json:"id"`
	OwnerID     int64     `json:"owner_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsPublic    bool      `json:"is_public"`
	ShareLevel  string    `json:"share_level"`
	EditLevel   string    `json:"edit_level"`
	CardCount   int       `json:"card_count,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	OwnerName   string    `json:"owner_name,omitempty"`
}

type Card struct {
	ID          int64        `json:"id"`
	DeckID      int64        `json:"deck_id,omitempty"`
	OwnerID     int64        `json:"owner_id"`
	AudioPath   string       `json:"audio_path"`
	AudioURL    string       `json:"audio_url,omitempty"`
	CoverPath   string       `json:"cover_path"`
	CoverURL    string       `json:"cover_url,omitempty"`
	HintText    string       `json:"hint_text"`
	DisplayText string       `json:"display_text"`
	Series      string       `json:"series"`
	Tags        string       `json:"tags"`
	IsShared    bool         `json:"is_shared"`
	ShareLevel  string       `json:"share_level"`
	SortOrder   int          `json:"sort_order"`
	CreatedAt   time.Time    `json:"created_at"`
	Audios      []*CardAudio `json:"audios,omitempty"`
	AudioCount  int          `json:"audio_count,omitempty"`
	OwnerName   string       `json:"owner_name,omitempty"`
}

type CardAudio struct {
	ID        int64     `json:"id"`
	CardID    int64     `json:"card_id"`
	AudioPath string    `json:"audio_path"`
	AudioURL  string    `json:"audio_url,omitempty"`
	HintText  string    `json:"hint_text"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type DeckCard struct {
	DeckID    int64     `json:"deck_id"`
	CardID    int64     `json:"card_id"`
	SortOrder int       `json:"sort_order"`
	AddedBy   int64     `json:"added_by"`
	AddedAt   time.Time `json:"added_at"`
}

type Room struct {
	ID             int64     `json:"id"`
	Code           string    `json:"code"`
	DeckID         int64     `json:"deck_id"`
	HostID         int64     `json:"host_id"`
	Status         string    `json:"status"`
	IntervalSec    int       `json:"interval_sec"`
	Mode           string    `json:"mode"`
	MaskEnabled    bool      `json:"mask_enabled"`
	MaskDifficulty string    `json:"mask_difficulty"`
	MaskSeed       int64     `json:"-"`
	PenaltyWrong     bool `json:"penalty_wrong"`
	PenaltySlow      bool `json:"penalty_slow"`
	PenaltyLast      int  `json:"penalty_last"`
	Training         bool   `json:"training"`
	MinPlayTime      int    `json:"min_play_time"`
	MultiAudioMode   string `json:"multi_audio_mode"`
	ShuffleRemaining int  `json:"shuffle_remaining"`
	RandomStart    bool `json:"random_start"`
	RandomStartMax int  `json:"random_start_max"`
	// Duel mode fields
	DuelTotalCards  int  `json:"duel_total_cards"`
	DuelFlip        bool `json:"duel_flip"`
	DuelRequeue     bool `json:"duel_requeue"`
	DuelMaxRounds   int  `json:"duel_max_rounds"`
	DuelRoundTime   int  `json:"duel_round_time"`
	DuelGrabChances int  `json:"duel_grab_chances"`
	DuelArrangeTime int  `json:"duel_arrange_time"`
	CreatedAt      time.Time `json:"created_at"`
}

type RoomPlayer struct {
	RoomID    int64     `json:"room_id"`
	UserID    int64     `json:"user_id"`
	Username  string    `json:"username"`
	AvatarURL string    `json:"avatar_url,omitempty"`
	Role      string    `json:"role"`
	Score     int       `json:"score"`
	Online    bool      `json:"online"`
	JoinedAt  time.Time `json:"joined_at"`
}

type GameRecord struct {
	ID          int64     `json:"id"`
	RoomID      int64     `json:"room_id"`
	CardID      int64     `json:"card_id"`
	CardAudioID *int64    `json:"card_audio_id"`
	WinnerID    *int64    `json:"winner_id"`
	GrabbedAt   time.Time `json:"grabbed_at"`
	IsLast      bool      `json:"is_last"`
	HintText    string    `json:"hint_text"`
}
