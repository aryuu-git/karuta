package ccp

import (
	"database/sql"
	"encoding/json"
	"math/rand"
	"time"
)

// Store 数据访问层
type Store struct {
	db *sql.DB
}

// NewStore 创建 Store 实例
func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// ==================== Banks ====================

func (s *Store) CreateBank(name, description string, uploaderID int64) (*CcpBank, error) {
	res, err := s.db.Exec(
		`INSERT INTO c_banks (name, description, uploader_id) VALUES (?, ?, ?)`,
		name, description, uploaderID,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetBank(id)
}

func (s *Store) GetBank(id int64) (*CcpBank, error) {
	b := &CcpBank{}
	err := s.db.QueryRow(
		`SELECT id, name, description, uploader_id, created_at FROM c_banks WHERE id = ?`, id,
	).Scan(&b.ID, &b.Name, &b.Description, &b.UploaderID, &b.CreatedAt)
	return b, err
}

func (s *Store) ListBanks() ([]CcpBank, error) {
	rows, err := s.db.Query(`SELECT id, name, description, uploader_id, created_at FROM c_banks ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var banks []CcpBank
	for rows.Next() {
		var b CcpBank
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &b.UploaderID, &b.CreatedAt); err != nil {
			continue
		}
		banks = append(banks, b)
	}
	if banks == nil {
		banks = []CcpBank{}
	}
	return banks, nil
}

func (s *Store) UpdateBank(id int64, name, description string) error {
	_, err := s.db.Exec(`UPDATE c_banks SET name=?, description=? WHERE id=?`, name, description, id)
	return err
}

func (s *Store) DeleteBank(id int64) error {
	_, err := s.db.Exec(`DELETE FROM c_banks WHERE id = ?`, id)
	return err
}

// ==================== Bank Images ====================

func (s *Store) CreateBankImage(bankID int64, imageURL, answerKeywords string) (*CcpBankImage, error) {
	res, err := s.db.Exec(
		`INSERT INTO c_bank_images (bank_id, image_url, answer_keywords) VALUES (?, ?, ?)`,
		bankID, imageURL, answerKeywords,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &CcpBankImage{ID: id, BankID: bankID, ImageURL: imageURL, AnswerKeywords: answerKeywords, CreatedAt: time.Now().Unix()}, nil
}

func (s *Store) ListBankImages(bankID int64) ([]CcpBankImage, error) {
	rows, err := s.db.Query(`SELECT id, bank_id, image_url, answer_keywords, created_at FROM c_bank_images WHERE bank_id = ? ORDER BY id`, bankID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var images []CcpBankImage
	for rows.Next() {
		var img CcpBankImage
		if err := rows.Scan(&img.ID, &img.BankID, &img.ImageURL, &img.AnswerKeywords, &img.CreatedAt); err != nil {
			continue
		}
		images = append(images, img)
	}
	if images == nil {
		images = []CcpBankImage{}
	}
	return images, nil
}

func (s *Store) GetBankImage(id int64) (*CcpBankImage, error) {
	img := &CcpBankImage{}
	err := s.db.QueryRow(
		`SELECT id, bank_id, image_url, answer_keywords, created_at FROM c_bank_images WHERE id = ?`, id,
	).Scan(&img.ID, &img.BankID, &img.ImageURL, &img.AnswerKeywords, &img.CreatedAt)
	return img, err
}

func (s *Store) DeleteBankImage(id int64) error {
	_, err := s.db.Exec(`DELETE FROM c_bank_images WHERE id = ?`, id)
	return err
}

func (s *Store) GetRandomBankImages(bankID int64, count int) ([]CcpBankImage, error) {
	query := `SELECT id, bank_id, image_url, answer_keywords, created_at FROM c_bank_images`
	var args []interface{}
	if bankID > 0 {
		query += ` WHERE bank_id = ?`
		args = append(args, bankID)
	}
	query += ` ORDER BY RANDOM() LIMIT ?`
	args = append(args, count)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var images []CcpBankImage
	for rows.Next() {
		var img CcpBankImage
		if err := rows.Scan(&img.ID, &img.BankID, &img.ImageURL, &img.AnswerKeywords, &img.CreatedAt); err != nil {
			continue
		}
		images = append(images, img)
	}
	return images, nil
}

// ==================== Rooms ====================

func (s *Store) CreateRoom(hostUserID int64, judgeMode string, gridSize, maxGuesses int, difficulty string, blurLevel int) (*CcpRoom, error) {
	code := generateRoomCode()
	room := &CcpRoom{
		Code:       code,
		HostUserID: hostUserID,
		Status:     "waiting",
		JudgeMode:  judgeMode,
		GridSize:   gridSize,
		MaxGuesses: maxGuesses,
		Difficulty: difficulty,
		BlurLevel:  blurLevel,
		CreatedAt:  time.Now().Unix(),
	}
	_, err := s.db.Exec(
		`INSERT INTO c_rooms (code, host_user_id, status, judge_mode, grid_size, max_guesses, difficulty, blur_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		room.Code, room.HostUserID, room.Status, room.JudgeMode, room.GridSize, room.MaxGuesses, room.Difficulty, room.BlurLevel, room.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return room, nil
}

func (s *Store) GetRoom(code string) (*CcpRoom, error) {
	r := &CcpRoom{}
	err := s.db.QueryRow(
		`SELECT code, host_user_id, status, judge_mode, grid_size, max_guesses, difficulty, blur_level, created_at FROM c_rooms WHERE code = ?`, code,
	).Scan(&r.Code, &r.HostUserID, &r.Status, &r.JudgeMode, &r.GridSize, &r.MaxGuesses, &r.Difficulty, &r.BlurLevel, &r.CreatedAt)
	return r, err
}

func (s *Store) ListWaitingRooms() ([]CcpRoomInfo, error) {
	rows, err := s.db.Query(`
		SELECT r.code, r.host_user_id, COALESCE(u.username,''), r.difficulty, r.judge_mode, r.status,
			(SELECT COUNT(*) FROM c_players WHERE room_code = r.code) as player_count
		FROM c_rooms r LEFT JOIN users u ON u.id = r.host_user_id
		WHERE r.status = 'waiting' ORDER BY r.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rooms []CcpRoomInfo
	for rows.Next() {
		var ri CcpRoomInfo
		if err := rows.Scan(&ri.Code, &ri.HostUserID, &ri.HostUsername, &ri.Difficulty, &ri.JudgeMode, &ri.Status, &ri.PlayerCount); err != nil {
			continue
		}
		rooms = append(rooms, ri)
	}
	if rooms == nil {
		rooms = []CcpRoomInfo{}
	}
	return rooms, nil
}

func (s *Store) UpdateRoomStatus(code, status string) error {
	_, err := s.db.Exec(`UPDATE c_rooms SET status = ? WHERE code = ?`, status, code)
	return err
}

func (s *Store) UpdateRoomSettings(code string, judgeMode string, gridSize, maxGuesses int, difficulty string, blurLevel int) error {
	_, err := s.db.Exec(`UPDATE c_rooms SET judge_mode=?, grid_size=?, max_guesses=?, difficulty=?, blur_level=? WHERE code=?`,
		judgeMode, gridSize, maxGuesses, difficulty, blurLevel, code)
	return err
}

func (s *Store) DeleteRoom(code string) error {
	_, err := s.db.Exec(`DELETE FROM c_rooms WHERE code = ?`, code)
	return err
}

// ==================== Room Images ====================

func (s *Store) SetRoomImages(code string, images []RoomImageInfo) error {
	s.db.Exec(`DELETE FROM c_room_images WHERE room_code = ?`, code)
	for i, img := range images {
		_, err := s.db.Exec(`INSERT INTO c_room_images (room_code, image_url, answer_keywords, sort_order) VALUES (?, ?, ?, ?)`, code, img.ImageURL, img.AnswerKeywords, i)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) GetRoomImages(code string) ([]RoomImageInfo, error) {
	rows, err := s.db.Query(`SELECT image_url, answer_keywords FROM c_room_images WHERE room_code = ? ORDER BY sort_order`, code)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var images []RoomImageInfo
	for rows.Next() {
		var img RoomImageInfo
		if err := rows.Scan(&img.ImageURL, &img.AnswerKeywords); err != nil {
			continue
		}
		images = append(images, img)
	}
	if images == nil {
		images = []RoomImageInfo{}
	}
	return images, nil
}

func (s *Store) RemoveRoomImage(code, imageURL string) error {
	_, err := s.db.Exec(`DELETE FROM c_room_images WHERE room_code = ? AND image_url = ?`, code, imageURL)
	return err
}

func (s *Store) RandomRoomImages(code string, bankID int64, count int) error {
	images, err := s.GetRandomBankImages(bankID, count)
	if err != nil {
		return err
	}
	roomImages := make([]RoomImageInfo, len(images))
	for i, img := range images {
		roomImages[i] = RoomImageInfo{ImageURL: img.ImageURL, AnswerKeywords: img.AnswerKeywords}
	}
	return s.SetRoomImages(code, roomImages)
}

// ==================== Players ====================

func (s *Store) AddPlayer(roomCode string, userID int64, isHost bool) error {
	_, err := s.db.Exec(
		`INSERT OR IGNORE INTO c_players (room_code, user_id, is_host, is_ready, score, guess_count) VALUES (?, ?, ?, ?, 0, 0)`,
		roomCode, userID, isHost, isHost,
	)
	return err
}

func (s *Store) RemovePlayer(roomCode string, userID int64) error {
	_, err := s.db.Exec(`DELETE FROM c_players WHERE room_code = ? AND user_id = ?`, roomCode, userID)
	return err
}

func (s *Store) ListPlayers(roomCode string) ([]CcpPlayer, error) {
	rows, err := s.db.Query(`
		SELECT p.room_code, p.user_id, u.username, COALESCE(u.avatar_path,''), p.is_host, p.is_ready, p.score, p.guess_count, p.joined_at
		FROM c_players p LEFT JOIN users u ON u.id = p.user_id
		WHERE p.room_code = ? ORDER BY p.joined_at`, roomCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var players []CcpPlayer
	for rows.Next() {
		var p CcpPlayer
		var avatarPath string
		if err := rows.Scan(&p.RoomID, &p.UserID, &p.Username, &avatarPath, &p.IsHost, &p.IsReady, &p.Score, &p.GuessCount, &p.JoinedAt); err != nil {
			continue
		}
		if avatarPath != "" {
			p.AvatarURL = "/uploads/avatars/" + avatarPath
		}
		players = append(players, p)
	}
	if players == nil {
		players = []CcpPlayer{}
	}
	return players, nil
}

func (s *Store) GetPlayer(roomCode string, userID int64) (*CcpPlayer, error) {
	p := &CcpPlayer{}
	var avatarPath string
	err := s.db.QueryRow(
		`SELECT p.room_code, p.user_id, u.username, COALESCE(u.avatar_path,''), p.is_host, p.is_ready, p.score, p.guess_count, p.joined_at
		FROM c_players p LEFT JOIN users u ON u.id = p.user_id
		WHERE p.room_code = ? AND p.user_id = ?`,
		roomCode, userID,
	).Scan(&p.RoomID, &p.UserID, &p.Username, &avatarPath, &p.IsHost, &p.IsReady, &p.Score, &p.GuessCount, &p.JoinedAt)
	if err != nil {
		return nil, err
	}
	if avatarPath != "" {
		p.AvatarURL = "/uploads/avatars/" + avatarPath
	}
	return p, nil
}

func (s *Store) SetPlayerReady(roomCode string, userID int64, ready bool) error {
	_, err := s.db.Exec(`UPDATE c_players SET is_ready = ? WHERE room_code = ? AND user_id = ?`, ready, roomCode, userID)
	return err
}

func (s *Store) UpdatePlayerScore(roomCode string, userID int64, delta int) error {
	_, err := s.db.Exec(`UPDATE c_players SET score = score + ? WHERE room_code = ? AND user_id = ?`, delta, roomCode, userID)
	return err
}

func (s *Store) IncrementPlayerGuessCount(roomCode string, userID int64) error {
	_, err := s.db.Exec(`UPDATE c_players SET guess_count = guess_count + 1 WHERE room_code = ? AND user_id = ?`, roomCode, userID)
	return err
}

func (s *Store) ResetPlayerGuessCounts(roomCode string) error {
	_, err := s.db.Exec(`UPDATE c_players SET guess_count = 0 WHERE room_code = ?`, roomCode)
	return err
}

func (s *Store) ResetPlayerGuessCount(roomCode string, userID int64) error {
	_, err := s.db.Exec(`UPDATE c_players SET guess_count = 0 WHERE room_code = ? AND user_id = ?`, roomCode, userID)
	return err
}

func (s *Store) ResetPlayerScores(roomCode string) error {
	_, err := s.db.Exec(`UPDATE c_players SET score = 0, guess_count = 0 WHERE room_code = ?`, roomCode)
	return err
}

func (s *Store) PlayerCount(roomCode string) int {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM c_players WHERE room_code = ?`, roomCode).Scan(&count)
	return count
}

// ==================== Game States ====================

func (s *Store) CreateGameState(state *CcpGameState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT OR REPLACE INTO c_game_states (room_code, state_json) VALUES (?, ?)`, state.RoomID, string(data))
	return err
}

func (s *Store) GetGameState(roomCode string) (*CcpGameState, error) {
	var stateJSON string
	err := s.db.QueryRow(`SELECT state_json FROM c_game_states WHERE room_code = ?`, roomCode).Scan(&stateJSON)
	if err != nil {
		return nil, err
	}
	var state CcpGameState
	if err := json.Unmarshal([]byte(stateJSON), &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (s *Store) UpdateGameState(state *CcpGameState) error {
	return s.CreateGameState(state)
}

func (s *Store) DeleteGameState(roomCode string) error {
	_, err := s.db.Exec(`DELETE FROM c_game_states WHERE room_code = ?`, roomCode)
	return err
}

// ==================== Helpers ====================

func generateRoomCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}
