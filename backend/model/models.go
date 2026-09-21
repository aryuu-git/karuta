package model

import "time"

type User struct {
	ID             int64     `json:"id"`
	Username       string    `json:"username"`
	Email          string    `json:"email"`
	Password       string    `json:"-"`
	InvitedBy      int64     `json:"invited_by"`
	Disabled       bool      `json:"disabled"`
	IsAdmin        bool      `json:"is_admin"`
	IsGuest        bool      `json:"is_guest"`
	GuestTokenHash string    `json:"-"`
	AvatarPath     string    `json:"-"`
	AvatarURL      string    `json:"avatar_url,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
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
	// v8 牌组增强：列表封面拼贴（前 4 张成员卡）与点赞
	CoverPaths  string    `json:"-"`
	CoverURLs   []string  `json:"cover_urls,omitempty"`
	Likes       int       `json:"likes,omitempty"`
	LikedByMe   bool      `json:"liked_by_me,omitempty"`
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
	// AudioDuration 全部音频实测时长合计（秒，列表查询聚合；0=无音频/旧数据）
	AudioDuration float64    `json:"audio_duration,omitempty"`
	// Likes/LikedByMe 点赞数与「我是否赞过」（公共库社交，v6）
	Likes       int          `json:"likes,omitempty"`
	LikedByMe   bool         `json:"liked_by_me,omitempty"`
	OwnerName   string       `json:"owner_name,omitempty"`
}

type CardAudio struct {
	ID        int64     `json:"id"`
	CardID    int64     `json:"card_id"`
	AudioPath string    `json:"audio_path"`
	AudioURL  string    `json:"audio_url,omitempty"`
	HintText  string    `json:"hint_text"`
	// DurationSec 音频时长（秒），由上传链路浏览器端测量；0 表示未知
	// （旧数据），服务端回合时钟回退到上限兜底。
	DurationSec float64 `json:"duration_sec"`
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
	ID               int64  `json:"id"`
	Code             string `json:"code"`
	DeckID           int64  `json:"deck_id"`
	HostID           int64  `json:"host_id"`
	Status           string `json:"status"`
	IntervalSec      int    `json:"interval_sec"`
	Mode             string `json:"mode"`
	MaskEnabled      bool   `json:"mask_enabled"`
	MaskDifficulty   string `json:"mask_difficulty"`
	MaskSeed         int64  `json:"-"`
	PenaltyWrong     bool   `json:"penalty_wrong"`
	PenaltySlow      bool   `json:"penalty_slow"`
	PenaltyLast      int    `json:"penalty_last"`
	Training         bool   `json:"training"`
	MinPlayTime      int    `json:"min_play_time"`
	MultiAudioMode   string `json:"multi_audio_mode"`
	ShuffleRemaining int    `json:"shuffle_remaining"`
	RandomStart      bool   `json:"random_start"`
	RandomStartMax   int    `json:"random_start_max"`
	// Duel mode fields
	DuelTotalCards  int       `json:"duel_total_cards"`
	DuelFlip        bool      `json:"duel_flip"`
	DuelRequeue     bool      `json:"duel_requeue"`
	DuelMaxRounds   int       `json:"duel_max_rounds"`
	DuelRoundTime   int       `json:"duel_round_time"`
	DuelGrabChances int       `json:"duel_grab_chances"`
	DuelArrangeTime int       `json:"duel_arrange_time"`
	CreatedAt   time.Time `json:"created_at"`
	// v7：私密房（列表隐藏，凭码可进）与人数上限（0=默认 16）
	IsPrivate   bool      `json:"is_private"`
	MaxPlayers  int       `json:"max_players"`
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
