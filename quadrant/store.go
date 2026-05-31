package quadrant

import (
	"database/sql"
	"math/rand"
	"strings"
	"time"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// --- Banks ---

func (s *Store) CreateBank(name, description string, ownerID int64, visibility, category string) (*QuestionBank, error) {
	res, err := s.db.Exec(
		`INSERT INTO q_banks (name, description, owner_id, visibility, category) VALUES (?, ?, ?, ?, ?)`,
		name, description, ownerID, visibility, category,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return s.GetBank(id)
}

func (s *Store) GetBank(id int64) (*QuestionBank, error) {
	b := &QuestionBank{}
	err := s.db.QueryRow(`
		SELECT id, name, description, owner_id, visibility, category, play_count, like_count, created_at, updated_at
		FROM q_banks WHERE id = ?`, id,
	).Scan(&b.ID, &b.Name, &b.Description, &b.OwnerID, &b.Visibility, &b.Category, &b.PlayCount, &b.LikeCount, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, err
	}
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM q_questions WHERE bank_id = ?`, id).Scan(&count)
	b.QuestionCount = count
	return b, nil
}

func (s *Store) ListBanks(ownerID int64, visibility string) ([]QuestionBank, error) {
	query := `SELECT b.id, b.name, b.description, b.owner_id, b.visibility, b.category, b.play_count, b.like_count, b.created_at, b.updated_at,
		(SELECT COUNT(*) FROM q_questions WHERE bank_id = b.id) as qcount
		FROM q_banks b WHERE 1=1`
	args := []interface{}{}
	if ownerID > 0 {
		query += " AND b.owner_id = ?"
		args = append(args, ownerID)
	}
	if visibility != "" {
		query += " AND b.visibility = ?"
		args = append(args, visibility)
	}
	query += " ORDER BY b.updated_at DESC"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var banks []QuestionBank
	for rows.Next() {
		var b QuestionBank
		if err := rows.Scan(&b.ID, &b.Name, &b.Description, &b.OwnerID, &b.Visibility, &b.Category, &b.PlayCount, &b.LikeCount, &b.CreatedAt, &b.UpdatedAt, &b.QuestionCount); err != nil {
			continue
		}
		banks = append(banks, b)
	}
	return banks, nil
}

func (s *Store) UpdateBank(id int64, name, description, visibility, category string) error {
	_, err := s.db.Exec(`UPDATE q_banks SET name=?, description=?, visibility=?, category=?, updated_at=unixepoch() WHERE id=?`,
		name, description, visibility, category, id)
	return err
}

func (s *Store) DeleteBank(id int64) error {
	_, err := s.db.Exec(`DELETE FROM q_banks WHERE id = ?`, id)
	return err
}

// --- Items ---

func (s *Store) CreateItem(bankID int64, title, imageURL, source, sourceID string) (*Item, error) {
	res, err := s.db.Exec(`INSERT INTO q_items (bank_id, title, image_url, source, source_id) VALUES (?, ?, ?, ?, ?)`,
		bankID, title, imageURL, source, sourceID)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &Item{ID: id, BankID: bankID, Title: title, ImageURL: imageURL, Source: source, SourceID: sourceID}, nil
}

func (s *Store) ListItems(bankID int64) ([]Item, error) {
	rows, err := s.db.Query(`SELECT id, bank_id, title, image_url, source, source_id FROM q_items WHERE bank_id = ? ORDER BY id`, bankID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Item
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.ID, &it.BankID, &it.Title, &it.ImageURL, &it.Source, &it.SourceID); err != nil {
			continue
		}
		items = append(items, it)
	}
	return items, nil
}

func (s *Store) GetItem(id int64) (*Item, error) {
	it := &Item{}
	err := s.db.QueryRow(`SELECT id, bank_id, title, image_url, source, source_id FROM q_items WHERE id = ?`, id).
		Scan(&it.ID, &it.BankID, &it.Title, &it.ImageURL, &it.Source, &it.SourceID)
	return it, err
}

func (s *Store) DeleteItem(id int64) error {
	_, err := s.db.Exec(`DELETE FROM q_items WHERE id = ?`, id)
	return err
}

// --- Labels ---

func (s *Store) CreateLabel(bankID int64, name string) (*Label, error) {
	res, err := s.db.Exec(`INSERT OR IGNORE INTO q_labels (bank_id, name) VALUES (?, ?)`, bankID, name)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	if id == 0 {
		row := s.db.QueryRow(`SELECT id FROM q_labels WHERE bank_id = ? AND name = ?`, bankID, name)
		row.Scan(&id)
	}
	return &Label{ID: id, BankID: bankID, Name: name}, nil
}

func (s *Store) ListLabels(bankID int64) ([]Label, error) {
	rows, err := s.db.Query(`SELECT id, bank_id, name FROM q_labels WHERE bank_id = ? ORDER BY name`, bankID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var labels []Label
	for rows.Next() {
		var l Label
		if err := rows.Scan(&l.ID, &l.BankID, &l.Name); err != nil {
			continue
		}
		labels = append(labels, l)
	}
	return labels, nil
}

func (s *Store) GetLabel(id int64) (*Label, error) {
	l := &Label{}
	err := s.db.QueryRow(`SELECT id, bank_id, name FROM q_labels WHERE id = ?`, id).Scan(&l.ID, &l.BankID, &l.Name)
	return l, err
}

func (s *Store) GetLabelByName(bankID int64, name string) (*Label, error) {
	l := &Label{}
	err := s.db.QueryRow(`SELECT id, bank_id, name FROM q_labels WHERE bank_id = ? AND name = ?`, bankID, name).Scan(&l.ID, &l.BankID, &l.Name)
	return l, err
}

func (s *Store) DeleteLabel(id int64) error {
	_, err := s.db.Exec(`DELETE FROM q_labels WHERE id = ?`, id)
	return err
}

// --- Questions ---

func (s *Store) CreateQuestion(bankID, axisXID, axisYID int64, scoreSource string, candidateIDs []int64) (*Question, error) {
	res, err := s.db.Exec(`INSERT INTO q_questions (bank_id, axis_x_label_id, axis_y_label_id, score_source) VALUES (?, ?, ?, ?)`,
		bankID, axisXID, axisYID, scoreSource)
	if err != nil {
		return nil, err
	}
	qID, _ := res.LastInsertId()

	for _, lid := range candidateIDs {
		s.db.Exec(`INSERT OR IGNORE INTO q_question_candidates (question_id, label_id) VALUES (?, ?)`, qID, lid)
	}

	return &Question{ID: qID, BankID: bankID, AxisXLabelID: axisXID, AxisYLabelID: axisYID, ScoreSource: scoreSource}, nil
}

func (s *Store) GetQuestionDetail(id int64) (*QuestionDetail, error) {
	qd := &QuestionDetail{}
	err := s.db.QueryRow(`
		SELECT q.id, q.bank_id, q.axis_x_label_id, q.axis_y_label_id, q.score_source, q.quality, q.created_at,
			lx.name, ly.name
		FROM q_questions q
		JOIN q_labels lx ON lx.id = q.axis_x_label_id
		JOIN q_labels ly ON ly.id = q.axis_y_label_id
		WHERE q.id = ?`, id,
	).Scan(&qd.ID, &qd.BankID, &qd.AxisXLabelID, &qd.AxisYLabelID, &qd.ScoreSource, &qd.Quality, &qd.CreatedAt, &qd.AxisXName, &qd.AxisYName)
	if err != nil {
		return nil, err
	}

	// candidates
	rows, err := s.db.Query(`
		SELECT l.id, l.bank_id, l.name FROM q_question_candidates qc
		JOIN q_labels l ON l.id = qc.label_id WHERE qc.question_id = ?`, id)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var l Label
			rows.Scan(&l.ID, &l.BankID, &l.Name)
			qd.Candidates = append(qd.Candidates, l)
		}
	}

	// placements
	pRows, err := s.db.Query(`
		SELECT p.id, p.question_id, p.item_id, p.x, p.y, p.reveal_order,
			i.id, i.bank_id, i.title, i.image_url, i.source, i.source_id
		FROM q_placements p JOIN q_items i ON i.id = p.item_id
		WHERE p.question_id = ? ORDER BY p.reveal_order`, id)
	if err == nil {
		defer pRows.Close()
		for pRows.Next() {
			var p Placement
			var it Item
			pRows.Scan(&p.ID, &p.QuestionID, &p.ItemID, &p.X, &p.Y, &p.RevealOrder,
				&it.ID, &it.BankID, &it.Title, &it.ImageURL, &it.Source, &it.SourceID)
			p.Item = &it
			qd.Placements = append(qd.Placements, p)
		}
	}

	return qd, nil
}

func (s *Store) ListQuestions(bankID int64) ([]Question, error) {
	rows, err := s.db.Query(`SELECT id, bank_id, axis_x_label_id, axis_y_label_id, score_source, quality, created_at FROM q_questions WHERE bank_id = ? ORDER BY id`, bankID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var qs []Question
	for rows.Next() {
		var q Question
		rows.Scan(&q.ID, &q.BankID, &q.AxisXLabelID, &q.AxisYLabelID, &q.ScoreSource, &q.Quality, &q.CreatedAt)
		qs = append(qs, q)
	}
	return qs, nil
}

func (s *Store) DeleteQuestion(id int64) error {
	_, err := s.db.Exec(`DELETE FROM q_questions WHERE id = ?`, id)
	return err
}

// --- Placements ---

func (s *Store) SetPlacements(questionID int64, placements []Placement) error {
	s.db.Exec(`DELETE FROM q_placements WHERE question_id = ?`, questionID)
	for i, p := range placements {
		order := p.RevealOrder
		if order == 0 {
			order = i + 1
		}
		_, err := s.db.Exec(`INSERT INTO q_placements (question_id, item_id, x, y, reveal_order) VALUES (?, ?, ?, ?, ?)`,
			questionID, p.ItemID, p.X, p.Y, order)
		if err != nil {
			return err
		}
	}
	return nil
}

// --- Rooms ---

func (s *Store) CreateRoom(room *Room) (*Room, error) {
	room.Code = generateCode()
	room.CreatedAt = time.Now().Unix()
	res, err := s.db.Exec(`INSERT INTO q_rooms (code, name, host_id, judge_id, bank_id, status, visibility, max_players,
		rounds_total, rounds_current, candidate_count, reveal_interval, guess_window,
		base_score, decay_per_reveal, wrong_penalty, cooldown_rounds, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		room.Code, room.Name, room.HostID, room.JudgeID, room.BankID, room.Status, room.Visibility, room.MaxPlayers,
		room.RoundsTotal, room.RoundsCurrent, room.CandidateCount, room.RevealInterval, room.GuessWindow,
		room.BaseScore, room.DecayPerReveal, room.WrongPenalty, room.CooldownRounds, room.CreatedAt)
	if err != nil {
		return nil, err
	}
	room.ID, _ = res.LastInsertId()
	return room, nil
}

func (s *Store) GetRoom(id int64) (*Room, error) {
	r := &Room{}
	err := s.db.QueryRow(`SELECT id, code, name, host_id, judge_id, bank_id, status, visibility, max_players,
		rounds_total, rounds_current, candidate_count, reveal_interval, guess_window,
		base_score, decay_per_reveal, wrong_penalty, cooldown_rounds, created_at
		FROM q_rooms WHERE id = ?`, id).
		Scan(&r.ID, &r.Code, &r.Name, &r.HostID, &r.JudgeID, &r.BankID, &r.Status, &r.Visibility, &r.MaxPlayers,
			&r.RoundsTotal, &r.RoundsCurrent, &r.CandidateCount, &r.RevealInterval, &r.GuessWindow,
			&r.BaseScore, &r.DecayPerReveal, &r.WrongPenalty, &r.CooldownRounds, &r.CreatedAt)
	return r, err
}

func (s *Store) GetRoomByCode(code string) (*Room, error) {
	r := &Room{}
	err := s.db.QueryRow(`SELECT id, code, name, host_id, judge_id, bank_id, status, visibility, max_players,
		rounds_total, rounds_current, candidate_count, reveal_interval, guess_window,
		base_score, decay_per_reveal, wrong_penalty, cooldown_rounds, created_at
		FROM q_rooms WHERE code = ?`, code).
		Scan(&r.ID, &r.Code, &r.Name, &r.HostID, &r.JudgeID, &r.BankID, &r.Status, &r.Visibility, &r.MaxPlayers,
			&r.RoundsTotal, &r.RoundsCurrent, &r.CandidateCount, &r.RevealInterval, &r.GuessWindow,
			&r.BaseScore, &r.DecayPerReveal, &r.WrongPenalty, &r.CooldownRounds, &r.CreatedAt)
	return r, err
}

func (s *Store) ListRooms() ([]Room, error) {
	rows, err := s.db.Query(`SELECT id, code, name, host_id, judge_id, bank_id, status, visibility, max_players,
		rounds_total, rounds_current, candidate_count, reveal_interval, guess_window,
		base_score, decay_per_reveal, wrong_penalty, cooldown_rounds, created_at
		FROM q_rooms WHERE status != 'ended' ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var rooms []Room
	for rows.Next() {
		var r Room
		rows.Scan(&r.ID, &r.Code, &r.Name, &r.HostID, &r.JudgeID, &r.BankID, &r.Status, &r.Visibility, &r.MaxPlayers,
			&r.RoundsTotal, &r.RoundsCurrent, &r.CandidateCount, &r.RevealInterval, &r.GuessWindow,
			&r.BaseScore, &r.DecayPerReveal, &r.WrongPenalty, &r.CooldownRounds, &r.CreatedAt)
		rooms = append(rooms, r)
	}
	return rooms, nil
}

func (s *Store) UpdateRoomStatus(id int64, status string) error {
	_, err := s.db.Exec(`UPDATE q_rooms SET status = ? WHERE id = ?`, status, id)
	return err
}

func (s *Store) IncrementRound(id int64) error {
	_, err := s.db.Exec(`UPDATE q_rooms SET rounds_current = rounds_current + 1 WHERE id = ?`, id)
	return err
}

// --- Players ---

func (s *Store) AddPlayer(roomID, userID int64, username, role string) error {
	_, err := s.db.Exec(`INSERT INTO q_players (room_id, user_id, username, role, score, is_ready) VALUES (?, ?, ?, ?, 0, FALSE)
		ON CONFLICT(room_id, user_id) DO UPDATE SET username=excluded.username, role=excluded.role`,
		roomID, userID, username, role)
	return err
}

func (s *Store) RemovePlayer(roomID, userID int64) error {
	_, err := s.db.Exec(`DELETE FROM q_players WHERE room_id = ? AND user_id = ?`, roomID, userID)
	return err
}

func (s *Store) ListPlayers(roomID int64) ([]Player, error) {
	rows, err := s.db.Query(`SELECT room_id, user_id, username, role, score, is_ready, joined_at FROM q_players WHERE room_id = ? ORDER BY joined_at`, roomID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var players []Player
	for rows.Next() {
		var p Player
		rows.Scan(&p.RoomID, &p.UserID, &p.Username, &p.Role, &p.Score, &p.IsReady, &p.JoinedAt)
		players = append(players, p)
	}
	return players, nil
}

func (s *Store) GetPlayerRole(roomID, userID int64) string {
	var role string
	s.db.QueryRow(`SELECT role FROM q_players WHERE room_id = ? AND user_id = ?`, roomID, userID).Scan(&role)
	return role
}

func (s *Store) SetPlayerReady(roomID, userID int64, ready bool) error {
	_, err := s.db.Exec(`UPDATE q_players SET is_ready = ? WHERE room_id = ? AND user_id = ?`, ready, roomID, userID)
	return err
}

func (s *Store) UpdatePlayerScore(roomID, userID int64, delta int) error {
	_, err := s.db.Exec(`UPDATE q_players SET score = score + ? WHERE room_id = ? AND user_id = ?`, delta, roomID, userID)
	return err
}

func (s *Store) PlayerCount(roomID int64) int {
	var count int
	s.db.QueryRow(`SELECT COUNT(*) FROM q_players WHERE room_id = ?`, roomID).Scan(&count)
	return count
}

// --- Guesses ---

func (s *Store) RecordGuess(g *Guess) error {
	_, err := s.db.Exec(`INSERT INTO q_guesses (room_id, question_id, user_id, guess_x_name, guess_y_name, correct, score, revealed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		g.RoomID, g.QuestionID, g.UserID, g.GuessXName, g.GuessYName, g.Correct, g.Score, g.RevealedAt)
	return err
}

// --- TagScore cache ---

func (s *Store) GetTagScore(itemID int64, labelName, source string) (float64, bool) {
	var score float64
	err := s.db.QueryRow(`SELECT score FROM q_tag_scores WHERE item_id = ? AND label_name = ? AND source = ?`,
		itemID, labelName, source).Scan(&score)
	if err != nil {
		return 0, false
	}
	return score, true
}

func (s *Store) SetTagScore(itemID int64, labelName, source string, score float64) error {
	_, err := s.db.Exec(`INSERT OR REPLACE INTO q_tag_scores (item_id, label_name, source, score, updated_at) VALUES (?, ?, ?, ?, unixepoch())`,
		itemID, labelName, source, score)
	return err
}

// --- helpers ---

func generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

// RandomQuestionFromBank picks a random unplayed question
func (s *Store) RandomQuestionFromBank(bankID int64, excludeIDs []int64) (*QuestionDetail, error) {
	query := `SELECT id FROM q_questions WHERE bank_id = ?`
	args := []interface{}{bankID}
	if len(excludeIDs) > 0 {
		placeholders := make([]string, len(excludeIDs))
		for i, id := range excludeIDs {
			placeholders[i] = "?"
			args = append(args, id)
		}
		query += " AND id NOT IN (" + strings.Join(placeholders, ",") + ")"
	}
	query += " ORDER BY RANDOM() LIMIT 1"

	var qID int64
	err := s.db.QueryRow(query, args...).Scan(&qID)
	if err != nil {
		return nil, err
	}
	return s.GetQuestionDetail(qID)
}
