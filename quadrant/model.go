package quadrant

// Item represents any entity placed on the quadrant (anime, game, character, person, etc.)
type Item struct {
	ID       int64  `json:"id"`
	BankID   int64  `json:"bank_id"`
	Title    string `json:"title"`
	ImageURL string `json:"image_url"`
	Source   string `json:"source"`
	SourceID string `json:"source_id,omitempty"`
}

// Label represents a tag/dimension used as an axis or candidate
type Label struct {
	ID     int64  `json:"id"`
	BankID int64  `json:"bank_id"`
	Name   string `json:"name"`
}

// Question represents a single puzzle in a bank
type Question struct {
	ID           int64   `json:"id"`
	BankID       int64   `json:"bank_id"`
	AxisXLabelID int64   `json:"axis_x_label_id"`
	AxisYLabelID int64   `json:"axis_y_label_id"`
	ScoreSource  string  `json:"score_source"`
	Quality      float64 `json:"quality"`
	CreatedAt    int64   `json:"created_at"`
}

// QuestionDetail includes full question data for gameplay
type QuestionDetail struct {
	Question
	AxisXName  string      `json:"axis_x_name"`
	AxisYName  string      `json:"axis_y_name"`
	Candidates []Label     `json:"candidates"`
	Placements []Placement `json:"placements"`
}

// Placement represents an item's position in a question's coordinate space
type Placement struct {
	ID          int64   `json:"id"`
	QuestionID  int64   `json:"question_id"`
	ItemID      int64   `json:"item_id"`
	X           float64 `json:"x"`
	Y           float64 `json:"y"`
	RevealOrder int     `json:"reveal_order"`
	Item        *Item   `json:"item,omitempty"`
}

// QuestionBank holds a collection of questions
type QuestionBank struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	OwnerID       int64  `json:"owner_id"`
	OwnerName     string `json:"owner_name,omitempty"`
	Visibility    string `json:"visibility"`
	Category      string `json:"category"`
	QuestionCount int    `json:"question_count"`
	PlayCount     int    `json:"play_count"`
	LikeCount     int    `json:"like_count"`
	CreatedAt     int64  `json:"created_at"`
	UpdatedAt     int64  `json:"updated_at"`
}

// Room represents a quadrant game room
type Room struct {
	ID         int64  `json:"id"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	HostID     int64  `json:"host_id"`
	JudgeID    int64  `json:"judge_id"`
	BankID     int64  `json:"bank_id"`
	Status     string `json:"status"`
	Visibility string `json:"visibility"`
	MaxPlayers int    `json:"max_players"`

	RoundsTotal    int `json:"rounds_total"`
	RoundsCurrent  int `json:"rounds_current"`
	CandidateCount int `json:"candidate_count"`
	RevealInterval int `json:"reveal_interval"`
	GuessWindow    int `json:"guess_window"`

	BaseScore      int `json:"base_score"`
	DecayPerReveal int `json:"decay_per_reveal"`
	WrongPenalty   int `json:"wrong_penalty"`
	CooldownRounds int `json:"cooldown_rounds"`

	CreatedAt int64 `json:"created_at"`
}

// Player represents a user in a quadrant room
type Player struct {
	RoomID   int64  `json:"room_id"`
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Role     string `json:"role"`
	Score    int    `json:"score"`
	IsReady  bool   `json:"is_ready"`
	Online   bool   `json:"online,omitempty"`
	JoinedAt int64  `json:"joined_at"`
}

// Guess records a player's guess attempt
type Guess struct {
	ID         int64  `json:"id"`
	RoomID     int64  `json:"room_id"`
	QuestionID int64  `json:"question_id"`
	UserID     int64  `json:"user_id"`
	GuessXName string `json:"guess_x_name"`
	GuessYName string `json:"guess_y_name"`
	Correct    bool   `json:"correct"`
	Score      int    `json:"score"`
	RevealedAt int    `json:"revealed_at"`
	CreatedAt  int64  `json:"created_at"`
}

// TagScore caches computed affinity scores
type TagScore struct {
	ItemID    int64   `json:"item_id"`
	LabelName string  `json:"label_name"`
	Source    string  `json:"source"`
	Score     float64 `json:"score"`
	UpdatedAt int64   `json:"updated_at"`
}

// RoomState is the full state sent to clients on connect
type RoomState struct {
	Room    *Room    `json:"room"`
	Players []Player `json:"players"`
}
