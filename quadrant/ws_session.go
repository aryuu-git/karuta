package quadrant

import (
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"
)

// GameSession manages the lifecycle of a single quadrant game round
type GameSession struct {
	hub   *Hub
	room  *Room
	store *Store

	question    *QuestionDetail
	revealedIdx int
	finished    bool

	// player state
	scores       map[int64]int
	cooldowns    map[int64]int // userID -> cooldown remaining rounds
	guessedRight map[int64]bool

	mu     sync.Mutex
	stopCh chan struct{}

	// judge control channels
	revealCh    chan int  // index to reveal, -1 for next
	pauseCh     chan struct{}
	resumeCh    chan struct{}
	endCh       chan struct{}
	paused      bool
}

func newGameSession(hub *Hub, room *Room, store *Store, question *QuestionDetail) *GameSession {
	return &GameSession{
		hub:          hub,
		room:         room,
		store:        store,
		question:     question,
		revealedIdx:  0,
		scores:       make(map[int64]int),
		cooldowns:    make(map[int64]int),
		guessedRight: make(map[int64]bool),
		stopCh:       make(chan struct{}),
		revealCh:     make(chan int, 8),
		pauseCh:      make(chan struct{}, 1),
		resumeCh:     make(chan struct{}, 1),
		endCh:        make(chan struct{}, 1),
	}
}

func (gs *GameSession) Run() {
	// broadcast game start
	candidateNames := make([]string, len(gs.question.Candidates))
	for i, c := range gs.question.Candidates {
		candidateNames[i] = c.Name
	}
	gs.hub.BroadcastJSON(map[string]any{
		"type":        "game_start",
		"candidates":  candidateNames,
		"item_count":  len(gs.question.Placements),
		"round":       gs.room.RoundsCurrent,
		"total_rounds": gs.room.RoundsTotal,
	})

	if gs.room.RevealInterval > 0 {
		gs.runAutoMode()
	} else {
		gs.runJudgeMode()
	}
}

func (gs *GameSession) runAutoMode() {
	interval := time.Duration(gs.room.RevealInterval) * time.Second
	timer := time.NewTimer(2 * time.Second)
	defer timer.Stop()

	for i := range gs.question.Placements {
		select {
		case <-gs.stopCh:
			return
		case <-timer.C:
		}

		gs.revealItem(i)

		if gs.allGuessedRight() {
			break
		}

		if i < len(gs.question.Placements)-1 {
			timer.Reset(interval)
		}
	}

	// wait a bit after last reveal then end
	time.Sleep(3 * time.Second)
	gs.endRound()
}

func (gs *GameSession) runJudgeMode() {
	for {
		select {
		case <-gs.stopCh:
			return
		case <-gs.endCh:
			gs.endRound()
			return
		case idx := <-gs.revealCh:
			if idx < 0 {
				idx = gs.revealedIdx
			}
			if idx < len(gs.question.Placements) {
				gs.revealItem(idx)
				if gs.allGuessedRight() {
					time.Sleep(2 * time.Second)
					gs.endRound()
					return
				}
			}
		case <-gs.pauseCh:
			gs.mu.Lock()
			gs.paused = true
			gs.mu.Unlock()
			gs.hub.BroadcastJSON(map[string]any{"type": "game_paused"})
			// wait for resume
			select {
			case <-gs.resumeCh:
				gs.mu.Lock()
				gs.paused = false
				gs.mu.Unlock()
				gs.hub.BroadcastJSON(map[string]any{"type": "game_resumed"})
			case <-gs.stopCh:
				return
			}
		}
	}
}

func (gs *GameSession) revealItem(idx int) {
	gs.mu.Lock()
	if idx >= len(gs.question.Placements) {
		gs.mu.Unlock()
		return
	}
	p := gs.question.Placements[idx]
	gs.revealedIdx = idx + 1
	// decrement cooldowns
	for uid := range gs.cooldowns {
		gs.cooldowns[uid]--
		if gs.cooldowns[uid] <= 0 {
			delete(gs.cooldowns, uid)
		}
	}
	gs.mu.Unlock()

	msg := map[string]any{
		"type":           "item_revealed",
		"index":          idx,
		"title":          p.Item.Title,
		"image_url":      p.Item.ImageURL,
		"x":             p.X,
		"y":             p.Y,
		"revealed_count": gs.revealedIdx,
		"total_count":    len(gs.question.Placements),
	}
	gs.hub.BroadcastJSON(msg)
}

func (gs *GameSession) HandleMessage(c *Client, msgType string, data json.RawMessage) {
	switch msgType {
	case "guess":
		gs.handleGuess(c, data)
	case "judge_reveal_next":
		if c.role == "judge" || c.userID == gs.room.HostID {
			select {
			case gs.revealCh <- -1:
			default:
			}
		}
	case "judge_reveal":
		if c.role == "judge" || c.userID == gs.room.HostID {
			var d struct{ ItemIndex int `json:"item_index"` }
			json.Unmarshal(data, &d)
			select {
			case gs.revealCh <- d.ItemIndex:
			default:
			}
		}
	case "judge_pause":
		if c.role == "judge" || c.userID == gs.room.HostID {
			select {
			case gs.pauseCh <- struct{}{}:
			default:
			}
		}
	case "judge_resume":
		if c.role == "judge" || c.userID == gs.room.HostID {
			select {
			case gs.resumeCh <- struct{}{}:
			default:
			}
		}
	case "judge_end":
		if c.role == "judge" || c.userID == gs.room.HostID {
			select {
			case gs.endCh <- struct{}{}:
			default:
			}
		}
	case "judge_eliminate":
		if c.role == "judge" || c.userID == gs.room.HostID {
			var d struct{ Label string `json:"label"` }
			json.Unmarshal(data, &d)
			gs.hub.BroadcastJSON(map[string]any{
				"type":      "hint",
				"hint_type": "eliminate",
				"label":     d.Label,
			})
		}
	case "judge_hint":
		if c.role == "judge" || c.userID == gs.room.HostID {
			var d struct{ Text string `json:"text"` }
			json.Unmarshal(data, &d)
			gs.hub.BroadcastJSON(map[string]any{
				"type":      "hint",
				"hint_type": "text",
				"text":      d.Text,
			})
		}
	case "judge_submit_question":
		if c.role == "judge" || c.userID == gs.room.HostID {
			gs.handleJudgeSubmitQuestion(data)
		}
	case "next_round":
		if c.userID == gs.room.HostID {
			gs.StartNextRound()
		}
	case "restart":
		if c.userID == gs.room.HostID {
			gs.store.UpdateRoomStatus(gs.room.ID, "waiting")
			gs.hub.session = nil
			gs.hub.BroadcastJSON(map[string]any{"type": "restart"})
		}
	}
}

func (gs *GameSession) handleGuess(c *Client, data json.RawMessage) {
	var guess struct {
		XLabel string `json:"x_label"`
		YLabel string `json:"y_label"`
	}
	if err := json.Unmarshal(data, &guess); err != nil {
		return
	}

	gs.mu.Lock()
	defer gs.mu.Unlock()

	if gs.finished {
		return
	}

	// check if player can guess
	if c.role != "player" {
		return
	}
	if gs.guessedRight[c.userID] {
		gs.hub.SendToUser(c.userID, map[string]any{"type": "guess_result", "error": "already_correct"})
		return
	}
	if cd, ok := gs.cooldowns[c.userID]; ok && cd > 0 {
		gs.hub.SendToUser(c.userID, map[string]any{"type": "guess_result", "error": "cooldown", "cooldown_remaining": cd})
		return
	}

	// check correctness (XY unordered)
	guessX := strings.TrimSpace(guess.XLabel)
	guessY := strings.TrimSpace(guess.YLabel)
	answerX := gs.question.AxisXName
	answerY := gs.question.AxisYName

	correct := (guessX == answerX && guessY == answerY) || (guessX == answerY && guessY == answerX)

	revealed := gs.revealedIdx
	var scoreDelta int

	if correct {
		scoreDelta = gs.room.BaseScore - (revealed * gs.room.DecayPerReveal)
		if scoreDelta < 10 {
			scoreDelta = 10
		}
		gs.guessedRight[c.userID] = true
		gs.scores[c.userID] += scoreDelta
		gs.store.UpdatePlayerScore(gs.room.ID, c.userID, scoreDelta)

		gs.hub.SendToUser(c.userID, map[string]any{
			"type":    "guess_result",
			"correct": true,
			"score":   scoreDelta,
		})
		gs.hub.BroadcastJSON(map[string]any{
			"type":           "player_correct",
			"user_id":        c.userID,
			"username":       c.username,
			"score":          scoreDelta,
			"revealed_count": revealed,
		})
	} else {
		scoreDelta = -gs.room.WrongPenalty
		gs.scores[c.userID] += scoreDelta
		gs.cooldowns[c.userID] = gs.room.CooldownRounds
		gs.store.UpdatePlayerScore(gs.room.ID, c.userID, scoreDelta)

		gs.hub.SendToUser(c.userID, map[string]any{
			"type":             "guess_result",
			"correct":         false,
			"score":           scoreDelta,
			"cooldown_rounds": gs.room.CooldownRounds,
		})
	}

	// record guess
	gs.store.RecordGuess(&Guess{
		RoomID:     gs.room.ID,
		QuestionID: gs.question.ID,
		UserID:     c.userID,
		GuessXName: guessX,
		GuessYName: guessY,
		Correct:    correct,
		Score:      scoreDelta,
		RevealedAt: revealed,
	})
}

func (gs *GameSession) handleJudgeSubmitQuestion(data json.RawMessage) {
	gs.mu.Lock()
	if gs.question != nil && len(gs.question.Placements) > 0 {
		gs.mu.Unlock()
		return
	}
	gs.mu.Unlock()
	var submission struct {
		AxisX      string `json:"axis_x"`
		AxisY      string `json:"axis_y"`
		Candidates []string `json:"candidates"`
		Items      []struct {
			Title    string  `json:"title"`
			ImageURL string  `json:"image_url"`
			X        float64 `json:"x"`
			Y        float64 `json:"y"`
		} `json:"items"`
	}
	if err := json.Unmarshal(data, &submission); err != nil {
		log.Printf("judge submit parse error: %v", err)
		return
	}

	// build question detail in memory (no DB persistence for judge live questions)
	candidates := make([]Label, len(submission.Candidates))
	for i, name := range submission.Candidates {
		candidates[i] = Label{ID: int64(i + 1), Name: name}
	}

	placements := make([]Placement, len(submission.Items))
	for i, item := range submission.Items {
		placements[i] = Placement{
			ID:          int64(i + 1),
			ItemID:      int64(i + 1),
			X:           item.X,
			Y:           item.Y,
			RevealOrder: i + 1,
			Item:        &Item{ID: int64(i + 1), Title: item.Title, ImageURL: item.ImageURL},
		}
	}

	gs.mu.Lock()
	gs.question = &QuestionDetail{
		Question: Question{
			ID:          0,
			ScoreSource: "manual",
		},
		AxisXName:  submission.AxisX,
		AxisYName:  submission.AxisY,
		Candidates: candidates,
		Placements: placements,
	}
	gs.mu.Unlock()

	// notify all and start
	candidateNames := make([]string, len(submission.Candidates))
	copy(candidateNames, submission.Candidates)

	gs.hub.BroadcastJSON(map[string]any{
		"type":        "game_start",
		"candidates":  candidateNames,
		"item_count":  len(placements),
		"round":       gs.room.RoundsCurrent,
		"total_rounds": gs.room.RoundsTotal,
	})

	// start judge-controlled reveal mode
	go gs.runJudgeMode()
}

func (gs *GameSession) endRound() {
	gs.mu.Lock()
	gs.finished = true
	gs.mu.Unlock()

	// reveal all remaining
	allPlacements := make([]map[string]any, len(gs.question.Placements))
	for i, p := range gs.question.Placements {
		allPlacements[i] = map[string]any{
			"title":     p.Item.Title,
			"image_url": p.Item.ImageURL,
			"x":         p.X,
			"y":         p.Y,
		}
	}

	players, _ := gs.store.ListPlayers(gs.room.ID)
	rankings := make([]map[string]any, 0)
	for _, p := range players {
		if p.Role == "player" {
			rankings = append(rankings, map[string]any{
				"user_id":  p.UserID,
				"username": p.Username,
				"score":    p.Score,
			})
		}
	}

	gs.hub.BroadcastJSON(map[string]any{
		"type":            "round_end",
		"axis_x":          gs.question.AxisXName,
		"axis_y":          gs.question.AxisYName,
		"all_placements":  allPlacements,
		"rankings":        rankings,
		"round":           gs.room.RoundsCurrent,
		"total_rounds":    gs.room.RoundsTotal,
		"has_next_round":  gs.room.RoundsCurrent < gs.room.RoundsTotal || gs.room.RoundsTotal == 0,
	})

	// auto-advance for multi-round bank mode
	if gs.room.BankID > 0 && gs.room.RoundsCurrent < gs.room.RoundsTotal {
		gs.store.UpdateRoomStatus(gs.room.ID, "waiting")
	} else if gs.room.BankID > 0 && gs.room.RoundsTotal > 0 {
		gs.store.UpdateRoomStatus(gs.room.ID, "ended")
	}
}

func (gs *GameSession) StartNextRound() {
	gs.mu.Lock()
	gs.finished = false
	gs.revealedIdx = 0
	gs.scores = make(map[int64]int)
	gs.cooldowns = make(map[int64]int)
	gs.guessedRight = make(map[int64]bool)
	gs.mu.Unlock()

	gs.store.IncrementRound(gs.room.ID)
	room, err := gs.store.GetRoom(gs.room.ID)
	if err != nil {
		return
	}
	gs.room = room

	if room.BankID > 0 {
		// load next question from bank
		// collect used question IDs (approximate, since we don't track them)
		qd, err := gs.store.RandomQuestionFromBank(room.BankID, nil)
		if err != nil {
			gs.hub.BroadcastJSON(map[string]any{"type": "error", "message": "no more questions"})
			gs.store.UpdateRoomStatus(gs.room.ID, "ended")
			return
		}
		gs.question = qd
		gs.store.UpdateRoomStatus(gs.room.ID, "playing")

		// send game_start and run
		candidateNames := make([]string, len(qd.Candidates))
		for i, c := range qd.Candidates {
			candidateNames[i] = c.Name
		}
		gs.hub.BroadcastJSON(map[string]any{
			"type":         "game_start",
			"candidates":   candidateNames,
			"item_count":   len(qd.Placements),
			"round":        room.RoundsCurrent,
			"total_rounds": room.RoundsTotal,
		})
		go gs.runAutoMode()
	}
	// judge mode: next round needs judge to submit again
}

func (gs *GameSession) allGuessedRight() bool {
	gs.mu.Lock()
	defer gs.mu.Unlock()
	onlinePlayers := gs.hub.OnlinePlayers()
	if len(onlinePlayers) == 0 {
		return false
	}
	for _, uid := range onlinePlayers {
		if !gs.guessedRight[uid] {
			return false
		}
	}
	return true
}

func (gs *GameSession) SendStateToClient(c *Client) {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	candidateNames := make([]string, len(gs.question.Candidates))
	for i, cand := range gs.question.Candidates {
		candidateNames[i] = cand.Name
	}

	// send revealed items so far
	revealed := make([]map[string]any, 0)
	for i := 0; i < gs.revealedIdx && i < len(gs.question.Placements); i++ {
		p := gs.question.Placements[i]
		revealed = append(revealed, map[string]any{
			"index":     i,
			"title":     p.Item.Title,
			"image_url": p.Item.ImageURL,
			"x":         p.X,
			"y":         p.Y,
		})
	}

	gs.hub.SendToUser(c.userID, map[string]any{
		"type":           "game_state",
		"candidates":     candidateNames,
		"item_count":     len(gs.question.Placements),
		"revealed_items": revealed,
		"revealed_count": gs.revealedIdx,
		"paused":         gs.paused,
		"finished":       gs.finished,
	})
}

func (gs *GameSession) Stop() {
	select {
	case <-gs.stopCh:
	default:
		close(gs.stopCh)
	}
}
