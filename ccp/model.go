package ccp

// CcpBank 题库
type CcpBank struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	UploaderID  int64  `json:"uploader_id"`
	UploaderName string `json:"uploader_name,omitempty"`
	CreatedAt   int64  `json:"created_at"`
}

// CcpBankImage 题库图片
type CcpBankImage struct {
	ID             int64  `json:"id"`
	BankID         int64  `json:"bank_id"`
	ImageURL       string `json:"image_url"`
	AnswerKeywords string `json:"answer_keywords"`
	CreatedAt      int64  `json:"created_at"`
}

// CcpRoom 房间
type CcpRoom struct {
	ID         string `json:"id"`
	Code       string `json:"code"`
	HostUserID int64  `json:"host_user_id"`
	Status     string `json:"status"`
	JudgeMode  string `json:"judge_mode"` // "judge" | "auto"
	GridSize   int    `json:"grid_size"`
	MaxGuesses int    `json:"max_guesses"`
	Difficulty string `json:"difficulty"` // "normal" | "blur"
	BlurLevel  int    `json:"blur_level"`
	CreatedAt  int64  `json:"created_at"`
}

// CcpRoomImage 房间关联图片
type CcpRoomImage struct {
	RoomID         string `json:"room_id"`
	ImageURL       string `json:"image_url"`
	AnswerKeywords string `json:"answer_keywords"`
	SortOrder      int    `json:"sort_order"`
}

// RoomImageInfo 房间图片信息（含答案关键词）
type RoomImageInfo struct {
	ImageURL       string `json:"image_url"`
	AnswerKeywords string `json:"answer_keywords"`
}

// CcpPlayer 房间玩家
type CcpPlayer struct {
	RoomID     string `json:"room_id"`
	UserID     int64  `json:"user_id"`
	Username   string `json:"username"`
	AvatarURL  string `json:"avatar_url"`
	IsHost     bool   `json:"is_host"`
	IsReady    bool   `json:"is_ready"`
	Score      int    `json:"score"`
	GuessCount int    `json:"guess_count"`
	JoinedAt   int64  `json:"joined_at"`
}

// CcpGameState 游戏状态
type CcpGameState struct {
	RoomID             string        `json:"room_id"`
	Status             string        `json:"status"` // "active" | "completed"
	CurrentRound       int           `json:"current_round"`
	MaxRounds          int           `json:"max_rounds"`
	PlayerOrder        []int64       `json:"player_order"`
	CurrentPlayerIndex int           `json:"current_player_index"`
	RevealedTiles      []int         `json:"revealed_tiles"`
	CurrentImageIndex  int           `json:"current_image_index"`
	CurrentBlurLevel   int           `json:"current_blur_level"`
	Logs               []CcpGameLog  `json:"logs"`
	PendingGuess       *CcpPendingGuess `json:"pending_guess"`
}

// CcpGameLog 游戏日志
type CcpGameLog struct {
	ID             int64  `json:"id"`
	Type           string `json:"type"` // "reveal" | "guess" | "system"
	UserID         int64  `json:"user_id"`
	Username       string `json:"username"`
	Message        string `json:"message"`
	Timestamp      int64  `json:"timestamp"`
}

// CcpPendingGuess 待判定猜测
type CcpPendingGuess struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Username  string `json:"username"`
	Word      string `json:"word"`
	Timestamp int64  `json:"timestamp"`
}

// CcpRoomInfo 房间列表信息
type CcpRoomInfo struct {
	Code        string `json:"code"`
	HostUserID  int64  `json:"host_user_id"`
	HostUsername string `json:"host_username"`
	PlayerCount int    `json:"player_count"`
	Difficulty  string `json:"difficulty"`
	JudgeMode   string `json:"judge_mode"`
	Status      string `json:"status"`
}

// CcpRoomFullState 完整房间状态（前端使用）
type CcpRoomFullState struct {
	Room      *CcpRoom       `json:"room"`
	Players   []CcpPlayer    `json:"players"`
	GameState *CcpGameState  `json:"game_state,omitempty"`
	Images    []RoomImageInfo `json:"images"`
}

// GameState 存储用（包含 images）
type CcpGameStateStore struct {
	CcpGameState
	Images []RoomImageInfo `json:"images"`
}
