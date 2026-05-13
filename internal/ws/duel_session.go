package ws

import (
	"encoding/json"
	"math/rand"
	"sync"
	"time"

	"karuta/internal/mask"
	"karuta/internal/model"
	"karuta/internal/storage"
	"karuta/internal/store"
)

// DuelSession manages a 1v1 duel game.
type DuelSession struct {
	hub   *RoomHub
	room  *model.Room
	store *store.Store

	allCards []*model.Card // all cards loaded from deck
	masks    map[int64]*mask.CardMask

	// Duel state
	player1ID    int64
	player2ID    int64
	player1Cards []int64 // card IDs in player1's area
	player2Cards []int64 // card IDs in player2's area
	cardMap      map[int64]*model.Card
	cardRemaining map[int64]int // for "all" mode: remaining layers per card

	// Playback queue
	queue       []*PlayItem
	currentItem *PlayItem
	round       int

	// Per-round grab state
	mu             sync.Mutex
	p1GrabsLeft    int
	p2GrabsLeft    int
	p1Grabbed      bool // player1 has grabbed correctly this round
	p2Grabbed      bool // player2 has grabbed correctly this round
	roundGrabCh    chan duelGrabResult
	roundTimeoutCh chan struct{}
	stopCh         chan struct{}

	// Give card state
	waitingGive    bool
	giveFromUserID int64
	giveCh         chan int64 // card ID chosen to give

	// Grabbed cards tracking (full game)
	p1GrabbedCards []int64
	p2GrabbedCards []int64
	claimedFrom    map[int64]int64 // cardID → playerID whose area it was in

	// Arranging phase
	phase         string // "arranging" | "playing"
	p1Ready       bool
	p2Ready       bool
	arrangeDoneCh chan struct{}

	// Pause
	pauseCh  chan struct{}
	resumeCh chan struct{}
	paused   bool
}

type duelGrabResult struct {
	UserID  int64
	CardID  int64
	Correct bool
}

func newDuelSession(hub *RoomHub, room *model.Room, cards []*model.Card, s *store.Store, player1, player2 int64) *DuelSession {
	// Load audios for each card
	for _, card := range cards {
		card.Audios = s.CardAudios.GetAudiosForCard(card)
		card.AudioCount = len(card.Audios)
		if card.AudioCount == 0 && card.AudioPath != "" {
			card.AudioCount = 1
		}
	}

	// Filter cards with audio
	validCards := make([]*model.Card, 0)
	for _, c := range cards {
		if c.AudioCount > 0 {
			validCards = append(validCards, c)
		}
	}

	// Select duel_total_cards (or all if less)
	totalCards := room.DuelTotalCards
	if totalCards <= 0 {
		totalCards = 50
	}
	if len(validCards) < totalCards {
		totalCards = len(validCards)
	}

	// Shuffle and pick
	rand.Shuffle(len(validCards), func(i, j int) {
		validCards[i], validCards[j] = validCards[j], validCards[i]
	})
	selectedCards := validCards[:totalCards]

	// Build card map + remaining counts
	cardMap := make(map[int64]*model.Card, totalCards)
	cardRemaining := make(map[int64]int, totalCards)
	for _, c := range selectedCards {
		cardMap[c.ID] = c
		cardRemaining[c.ID] = c.AudioCount
		if cardRemaining[c.ID] <= 0 {
			cardRemaining[c.ID] = 1
		}
	}

	// Generate masks if enabled
	var masks map[int64]*mask.CardMask
	if room.MaskEnabled && room.MaskSeed != 0 {
		cardIDs := make([]int64, len(selectedCards))
		for i, c := range selectedCards {
			cardIDs[i] = c.ID
		}
		masks = mask.GenerateMasks(room.MaskSeed, cardIDs, room.MaskDifficulty)
	}

	// Split into two halves
	half := totalCards / 2
	p1Cards := make([]int64, 0, half)
	p2Cards := make([]int64, 0, totalCards-half)
	for i, c := range selectedCards {
		if i < half {
			p1Cards = append(p1Cards, c.ID)
		} else {
			p2Cards = append(p2Cards, c.ID)
		}
	}

	// Build play queue from all selected cards' audios
	queue := expandToPlayItems(selectedCards)
	rand.Shuffle(len(queue), func(i, j int) {
		queue[i], queue[j] = queue[j], queue[i]
	})
	for i := range queue {
		queue[i].Index = i
	}

	return &DuelSession{
		hub:          hub,
		room:         room,
		store:        s,
		allCards:     selectedCards,
		masks:        masks,
		player1ID:    player1,
		player2ID:    player2,
		player1Cards:  p1Cards,
		player2Cards:  p2Cards,
		cardMap:       cardMap,
		cardRemaining: cardRemaining,
		queue:        queue,
		claimedFrom:    make(map[int64]int64),
		roundGrabCh:    make(chan duelGrabResult, 10),
		roundTimeoutCh: make(chan struct{}, 1),
		stopCh:         make(chan struct{}),
		giveCh:         make(chan int64, 1),
		pauseCh:        make(chan struct{}, 1),
		resumeCh:       make(chan struct{}, 1),
	}
}

func (ds *DuelSession) Run() {
	ds.phase = "arranging"
	ds.broadcastDuelState()

	// Arranging phase: let players rearrange their cards
	arrangeTime := ds.room.DuelArrangeTime
	if arrangeTime <= 0 {
		arrangeTime = 60
	}
	ds.arrangeDoneCh = make(chan struct{})
	ds.hub.BroadcastJSON(map[string]interface{}{
		"type":    "duel_arrange_start",
		"timeout": arrangeTime,
	})
	ds.waitArrangeComplete(arrangeTime)

	// Broadcast final arrangement
	ds.phase = "playing"
	ds.hub.BroadcastJSON(map[string]interface{}{
		"type":          "duel_arrange_done",
		"player1_cards": ds.buildCardList(ds.player1Cards),
		"player2_cards": ds.buildCardList(ds.player2Cards),
	})
	time.Sleep(1 * time.Second)

	// Countdown
	for i := 3; i >= 1; i-- {
		ds.hub.BroadcastJSON(map[string]interface{}{"type": "countdown", "count": i})
		time.Sleep(1 * time.Second)
	}
	ds.hub.BroadcastJSON(map[string]interface{}{"type": "countdown", "count": 0})

	ds.runLoop()
}

func (ds *DuelSession) waitArrangeComplete(seconds int) {
	timer := time.NewTimer(time.Duration(seconds) * time.Second)
	defer timer.Stop()
	select {
	case <-ds.arrangeDoneCh:
	case <-timer.C:
	case <-ds.stopCh:
	}
}

func (ds *DuelSession) HandleArrangeSwap(userID int64, posA, posB int, cross bool) {
	if ds.phase != "arranging" {
		return
	}
	ds.mu.Lock()
	defer ds.mu.Unlock()

	isP1 := userID == ds.player1ID
	isP2 := userID == ds.player2ID
	if !isP1 && !isP2 {
		return
	}

	if cross {
		// Cross-area swap: posA from my area, posB from opponent's area
		var myCards, oppCards []int64
		if isP1 {
			myCards = ds.player1Cards
			oppCards = ds.player2Cards
		} else {
			myCards = ds.player2Cards
			oppCards = ds.player1Cards
		}
		if posA < 0 || posA >= len(myCards) || posB < 0 || posB >= len(oppCards) {
			return
		}
		myCards[posA], oppCards[posB] = oppCards[posB], myCards[posA]
	} else {
		// Same-area swap
		var cards []int64
		if isP1 {
			cards = ds.player1Cards
		} else {
			cards = ds.player2Cards
		}
		if posA < 0 || posA >= len(cards) || posB < 0 || posB >= len(cards) || posA == posB {
			return
		}
		cards[posA], cards[posB] = cards[posB], cards[posA]
	}
	ds.broadcastArrangeState()
}

func (ds *DuelSession) HandleArrangeReady(userID int64) {
	if ds.phase != "arranging" {
		return
	}
	ds.mu.Lock()
	if userID == ds.player1ID {
		ds.p1Ready = true
	} else if userID == ds.player2ID {
		ds.p2Ready = true
	}
	bothReady := ds.p1Ready && ds.p2Ready
	ds.mu.Unlock()

	ds.broadcastArrangeState()

	if bothReady {
		select {
		case <-ds.arrangeDoneCh:
		default:
			close(ds.arrangeDoneCh)
		}
	}
}

func (ds *DuelSession) broadcastArrangeState() {
	ds.hub.BroadcastJSON(map[string]interface{}{
		"type":          "duel_arrange_state",
		"player1_cards": ds.buildCardList(ds.player1Cards),
		"player2_cards": ds.buildCardList(ds.player2Cards),
		"p1_ready":      ds.p1Ready,
		"p2_ready":      ds.p2Ready,
	})
}

func (ds *DuelSession) runLoop() {
	for {
		if len(ds.queue) == 0 {
			// No more songs — check winner by card count
			ds.endGame("queue_empty")
			return
		}

		// Check win condition
		if len(ds.player1Cards) == 0 {
			ds.endGame("player1_win")
			return
		}
		if len(ds.player2Cards) == 0 {
			ds.endGame("player2_win")
			return
		}

		// Max rounds check
		if ds.room.DuelMaxRounds > 0 && ds.round >= ds.room.DuelMaxRounds {
			ds.endGame("max_rounds")
			return
		}

		select {
		case <-ds.stopCh:
			return
		default:
		}

		// Drain stale grabs from previous round
		for {
			select {
			case <-ds.roundGrabCh:
			default:
				goto drained
			}
		}
	drained:

		// Pop next item from queue, skip items whose card is already claimed
		var item *PlayItem
		for len(ds.queue) > 0 {
			candidate := ds.queue[0]
			ds.queue = ds.queue[1:]
			if ds.inArea(candidate.CardID, ds.player1Cards) || ds.inArea(candidate.CardID, ds.player2Cards) {
				item = candidate
				break
			}
		}
		if item == nil {
			ds.endGame("queue_empty")
			return
		}
		ds.currentItem = item
		ds.round++

		// Reset per-round state
		ds.mu.Lock()
		ds.p1GrabsLeft = ds.room.DuelGrabChances
		ds.p2GrabsLeft = ds.room.DuelGrabChances
		if ds.p1GrabsLeft <= 0 {
			ds.p1GrabsLeft = 1
		}
		if ds.p2GrabsLeft <= 0 {
			ds.p2GrabsLeft = 1
		}
		ds.p1Grabbed = false
		ds.p2Grabbed = false
		ds.mu.Unlock()

		// Broadcast card_start
		cardStartMsg := map[string]interface{}{
			"type":       "duel_card_start",
			"card_id":    item.CardID,
			"audio_url":  storage.FileURL(item.AudioPath, "audio"),
			"hint_text":  item.HintText,
			"round":      ds.round,
			"queue_left": len(ds.queue),
		}
		if ds.room.RandomStart {
			rng := rand.New(rand.NewSource(ds.room.MaskSeed ^ item.CardAudioID ^ int64(ds.round)))
			maxPct := ds.room.RandomStartMax
			if maxPct <= 0 || maxPct > 80 {
				maxPct = 50
			}
			cardStartMsg["start_ratio"] = float64(rng.Intn(maxPct)) / 100.0
		}
		ds.hub.BroadcastJSON(cardStartMsg)

		// Wait for grabs or timeout
		roundTime := ds.room.DuelRoundTime
		if roundTime <= 0 {
			roundTime = 30
		}
		timer := time.NewTimer(time.Duration(roundTime) * time.Second)

		resolved := false
		for !resolved {
			select {
			case <-ds.stopCh:
				timer.Stop()
				return

			case result := <-ds.roundGrabCh:
				ds.handleGrabResult(result)
				// Check if round is over (both grabbed correctly or both out of chances)
				ds.mu.Lock()
				bothDone := (ds.p1Grabbed || ds.p1GrabsLeft <= 0) && (ds.p2Grabbed || ds.p2GrabsLeft <= 0)
				anyCorrect := ds.p1Grabbed || ds.p2Grabbed
				ds.mu.Unlock()
				if anyCorrect || bothDone {
					timer.Stop()
					resolved = true
				}

			case <-timer.C:
				// Timeout — requeue if enabled
				if ds.room.DuelRequeue {
					ds.queue = append(ds.queue, item)
				}
				ds.hub.BroadcastJSON(map[string]interface{}{
					"type":    "duel_timeout",
					"card_id": item.CardID,
					"requeued": ds.room.DuelRequeue,
				})
				resolved = true

			case <-ds.roundTimeoutCh:
				// Host skipped this card
				timer.Stop()
				ds.hub.BroadcastJSON(map[string]interface{}{
					"type":    "duel_timeout",
					"card_id": item.CardID,
					"requeued": false,
				})
				resolved = true
			}
		}

		// If waiting for give card
		if ds.waitingGive {
			ds.waitForGive()
		}

		ds.currentItem = nil
		time.Sleep(500 * time.Millisecond)

		// Check for pause between rounds
		select {
		case <-ds.pauseCh:
			ds.paused = true
			ds.hub.BroadcastJSON(map[string]interface{}{"type": "paused"})
			// Wait for resume or stop
			select {
			case <-ds.resumeCh:
				ds.paused = false
				ds.hub.BroadcastJSON(map[string]interface{}{"type": "resumed"})
			case <-ds.stopCh:
				return
			}
		default:
		}
	}
}

func (ds *DuelSession) handleGrabResult(result duelGrabResult) {
	card := ds.cardMap[result.CardID]
	if card == nil {
		// Invalid card
		ds.hub.SendJSONToUser(result.UserID, map[string]interface{}{
			"type": "duel_grab_invalid",
		})
		return
	}

	// Determine which area the answer card is in
	answerCardID := ds.currentItem.CardID
	answerInP1 := ds.inArea(answerCardID, ds.player1Cards)
	answerInP2 := ds.inArea(answerCardID, ds.player2Cards)

	isPlayer1 := result.UserID == ds.player1ID

	ds.mu.Lock()
	defer ds.mu.Unlock()

	// Check if player already done this round
	if isPlayer1 && (ds.p1Grabbed || ds.p1GrabsLeft <= 0) {
		ds.hub.SendJSONToUser(result.UserID, map[string]interface{}{"type": "duel_grab_blocked"})
		return
	}
	if !isPlayer1 && (ds.p2Grabbed || ds.p2GrabsLeft <= 0) {
		ds.hub.SendJSONToUser(result.UserID, map[string]interface{}{"type": "duel_grab_blocked"})
		return
	}

	// Is the grab correct?
	correct := result.CardID == answerCardID
	grabberName := ""
	if u, err := ds.store.Users.GetByID(result.UserID); err == nil {
		grabberName = u.Username
	}

	if !correct {
		// Wrong — always consume a chance in duel mode
		if isPlayer1 {
			ds.p1GrabsLeft--
		} else {
			ds.p2GrabsLeft--
		}
		ds.hub.BroadcastJSON(map[string]interface{}{
			"type":     "duel_grab_wrong",
			"user_id":  result.UserID,
			"username": grabberName,
			"card_id":  result.CardID,
		})
		// Requeue if both out of chances
		if ds.p1GrabsLeft <= 0 && ds.p2GrabsLeft <= 0 && !ds.p1Grabbed && !ds.p2Grabbed {
			if ds.room.DuelRequeue {
				ds.queue = append(ds.queue, ds.currentItem)
			}
		}
		return
	}

	// Correct grab!
	if isPlayer1 {
		ds.p1Grabbed = true
		ds.p1GrabbedCards = append(ds.p1GrabbedCards, answerCardID)
	} else {
		ds.p2Grabbed = true
		ds.p2GrabbedCards = append(ds.p2GrabbedCards, answerCardID)
	}

	// Record which area the card was in
	if answerInP1 {
		ds.claimedFrom[answerCardID] = ds.player1ID
	} else if answerInP2 {
		ds.claimedFrom[answerCardID] = ds.player2ID
	}

	// Determine card area
	inMyArea := (isPlayer1 && answerInP1) || (!isPlayer1 && answerInP2)
	inOpponentArea := (isPlayer1 && answerInP2) || (!isPlayer1 && answerInP1)

	// "all" mode: decrement remaining, only remove when fully exhausted
	if ds.room.MultiAudioMode == "all" {
		ds.cardRemaining[answerCardID]--
		if ds.cardRemaining[answerCardID] > 0 {
			// Not fully exhausted yet — don't remove card, just notify
			ds.hub.BroadcastJSON(map[string]interface{}{
				"type":      "duel_card_claimed",
				"user_id":   result.UserID,
				"username":  grabberName,
				"card_id":   answerCardID,
				"area":      "layer",
				"remaining": ds.cardRemaining[answerCardID],
				"p1_count":  len(ds.player1Cards),
				"p2_count":  len(ds.player2Cards),
			})
			return
		}
		// Fully exhausted — fall through to remove logic
	}

	if inMyArea {
		// Card in my area — remove it, my area -1
		if isPlayer1 {
			ds.player1Cards = ds.removeCard(ds.player1Cards, answerCardID)
		} else {
			ds.player2Cards = ds.removeCard(ds.player2Cards, answerCardID)
		}
		ds.hub.BroadcastJSON(map[string]interface{}{
			"type":      "duel_card_claimed",
			"user_id":   result.UserID,
			"username":  grabberName,
			"card_id":   answerCardID,
			"area":      "own",
			"p1_count":  len(ds.player1Cards),
			"p2_count":  len(ds.player2Cards),
		})
	} else if inOpponentArea {
		// Card in opponent area — remove from opponent, but need to give one
		if isPlayer1 {
			ds.player2Cards = ds.removeCard(ds.player2Cards, answerCardID)
		} else {
			ds.player1Cards = ds.removeCard(ds.player1Cards, answerCardID)
		}
		// Request give card
		ds.waitingGive = true
		ds.giveFromUserID = result.UserID
		ds.hub.BroadcastJSON(map[string]interface{}{
			"type":      "duel_card_claimed",
			"user_id":   result.UserID,
			"username":  grabberName,
			"card_id":   answerCardID,
			"area":      "opponent",
			"p1_count":  len(ds.player1Cards),
			"p2_count":  len(ds.player2Cards),
			"needs_give": true,
		})
	}
}

func (ds *DuelSession) waitForGive() {
	ds.hub.SendJSONToUser(ds.giveFromUserID, map[string]interface{}{
		"type": "duel_give_request",
		"cards": ds.getMyCards(ds.giveFromUserID),
	})

	// Wait up to 30s for give response
	timer := time.NewTimer(30 * time.Second)
	defer timer.Stop()

	select {
	case <-ds.stopCh:
		return
	case cardID := <-ds.giveCh:
		ds.processGive(cardID)
	case <-timer.C:
		// Timeout — auto pick first card
		myCards := ds.getMyCardIDs(ds.giveFromUserID)
		if len(myCards) > 0 {
			ds.processGive(myCards[0])
		}
	}

	ds.waitingGive = false
	ds.giveFromUserID = 0
}

func (ds *DuelSession) processGive(cardID int64) {
	ds.mu.Lock()
	defer ds.mu.Unlock()

	isP1 := ds.giveFromUserID == ds.player1ID
	if isP1 {
		ds.player1Cards = ds.removeCard(ds.player1Cards, cardID)
		ds.player2Cards = append(ds.player2Cards, cardID)
	} else {
		ds.player2Cards = ds.removeCard(ds.player2Cards, cardID)
		ds.player1Cards = append(ds.player1Cards, cardID)
	}

	ds.hub.BroadcastJSON(map[string]interface{}{
		"type":     "duel_give_done",
		"from_id":  ds.giveFromUserID,
		"card_id":  cardID,
		"p1_count": len(ds.player1Cards),
		"p2_count": len(ds.player2Cards),
	})
}

func (ds *DuelSession) SkipCard() {
	select {
	case ds.roundTimeoutCh <- struct{}{}:
	default:
	}
}

func (ds *DuelSession) Pause() {
	select {
	case ds.pauseCh <- struct{}{}:
	default:
	}
}

func (ds *DuelSession) Resume() {
	select {
	case ds.resumeCh <- struct{}{}:
	default:
	}
}

func (ds *DuelSession) HandleGrab(userID, cardID int64) {
	if userID != ds.player1ID && userID != ds.player2ID {
		return // spectator can't grab
	}
	select {
	case ds.roundGrabCh <- duelGrabResult{UserID: userID, CardID: cardID, Correct: false}:
	default:
	}
}

func (ds *DuelSession) HandleGiveCard(userID, cardID int64) {
	if userID != ds.giveFromUserID {
		return
	}
	select {
	case ds.giveCh <- cardID:
	default:
	}
}

func (ds *DuelSession) Stop() {
	select {
	case <-ds.stopCh:
	default:
		close(ds.stopCh)
	}
}

func (ds *DuelSession) endGame(reason string) {
	winner := ""
	var winnerID int64
	switch reason {
	case "player1_win":
		winnerID = ds.player1ID
	case "player2_win":
		winnerID = ds.player2ID
	case "queue_empty", "max_rounds":
		if len(ds.player1Cards) < len(ds.player2Cards) {
			winnerID = ds.player1ID
		} else if len(ds.player2Cards) < len(ds.player1Cards) {
			winnerID = ds.player2ID
		}
	}
	if winnerID != 0 {
		if u, err := ds.store.Users.GetByID(winnerID); err == nil {
			winner = u.Username
		}
	}

	ds.hub.BroadcastJSON(map[string]interface{}{
		"type":            "duel_game_over",
		"reason":          reason,
		"winner_id":       winnerID,
		"winner":          winner,
		"p1_count":        len(ds.player1Cards),
		"p2_count":        len(ds.player2Cards),
		"rounds":          ds.round,
		"p1_grabbed_cards": ds.buildCardList(ds.p1GrabbedCards),
		"p2_grabbed_cards": ds.buildCardList(ds.p2GrabbedCards),
		"p1_remaining":    ds.buildCardList(ds.player1Cards),
		"p2_remaining":    ds.buildCardList(ds.player2Cards),
	})

	_ = ds.store.Rooms.UpdateStatus(ds.room.ID, "end")
	time.Sleep(3 * time.Second)
	ds.hub.Stop()
}

func (ds *DuelSession) broadcastDuelState() {
	p1Name, p2Name := "", ""
	if u, err := ds.store.Users.GetByID(ds.player1ID); err == nil {
		p1Name = u.Username
	}
	if u, err := ds.store.Users.GetByID(ds.player2ID); err == nil {
		p2Name = u.Username
	}

	ds.hub.BroadcastJSON(map[string]interface{}{
		"type": "duel_state",
		"data": map[string]interface{}{
			"room":     ds.buildRoomMap(),
			"player1":  map[string]interface{}{"id": ds.player1ID, "username": p1Name, "cards": ds.buildCardList(ds.player1Cards)},
			"player2":  map[string]interface{}{"id": ds.player2ID, "username": p2Name, "cards": ds.buildCardList(ds.player2Cards)},
			"p1_count": len(ds.player1Cards),
			"p2_count": len(ds.player2Cards),
			"queue_left": len(ds.queue),
			"flip":     ds.room.DuelFlip,
		},
	})
}

func (ds *DuelSession) SendDuelStateToClient(client *Client) {
	p1Name, p2Name := "", ""
	if u, err := ds.store.Users.GetByID(ds.player1ID); err == nil {
		p1Name = u.Username
	}
	if u, err := ds.store.Users.GetByID(ds.player2ID); err == nil {
		p2Name = u.Username
	}

	// Build card lists with claimed cards included (for reconnection visual consistency)
	allGrabbed := append(append([]int64{}, ds.p1GrabbedCards...), ds.p2GrabbedCards...)
	p1Cards := ds.buildCardListWithClaimed(ds.player1Cards, allGrabbed, ds.player1ID)
	p2Cards := ds.buildCardListWithClaimed(ds.player2Cards, allGrabbed, ds.player2ID)
	data, _ := json.Marshal(map[string]interface{}{
		"type": "duel_state",
		"data": map[string]interface{}{
			"room":       ds.buildRoomMap(),
			"player1":    map[string]interface{}{"id": ds.player1ID, "username": p1Name, "cards": p1Cards},
			"player2":    map[string]interface{}{"id": ds.player2ID, "username": p2Name, "cards": p2Cards},
			"p1_count":   len(ds.player1Cards),
			"p2_count":   len(ds.player2Cards),
			"queue_left": len(ds.queue),
			"flip":       ds.room.DuelFlip,
		},
	})
	select {
	case client.send <- data:
	default:
	}

	// If in arranging phase, also send arrange state so reconnecting client can participate
	if ds.phase == "arranging" {
		arrangeData, _ := json.Marshal(map[string]interface{}{
			"type":          "duel_arrange_state",
			"player1_cards": ds.buildCardList(ds.player1Cards),
			"player2_cards": ds.buildCardList(ds.player2Cards),
			"p1_ready":      ds.p1Ready,
			"p2_ready":      ds.p2Ready,
		})
		select {
		case client.send <- arrangeData:
		default:
		}
	}
}

func (ds *DuelSession) buildRoomMap() map[string]interface{} {
	return map[string]interface{}{
		"id":           ds.room.ID,
		"code":         ds.room.Code,
		"status":       "reading",
		"mode":         "duel",
		"host_id":      ds.room.HostID,
		"deck_id":      ds.room.DeckID,
		"duel_flip":    ds.room.DuelFlip,
		"duel_requeue": ds.room.DuelRequeue,
	}
}

func (ds *DuelSession) buildCardList(cardIDs []int64) []map[string]interface{} {
	list := make([]map[string]interface{}, 0, len(cardIDs))
	for _, id := range cardIDs {
		c := ds.cardMap[id]
		if c == nil {
			continue
		}
		item := map[string]interface{}{
			"id":           c.ID,
			"display_text": c.DisplayText,
			"cover_url":    storage.FileURL(c.CoverPath, "covers"),
		}
		if ds.masks != nil {
			if m, ok := ds.masks[c.ID]; ok {
				item["mask"] = m
			}
		}
		list = append(list, item)
	}
	return list
}

func (ds *DuelSession) buildCardListWithClaimed(remainingIDs []int64, allGrabbed []int64, areaOwnerID int64) []map[string]interface{} {
	list := ds.buildCardList(remainingIDs)
	// Append grabbed cards that were originally in this area
	for _, gid := range allGrabbed {
		if ds.claimedFrom[gid] == areaOwnerID {
			c := ds.cardMap[gid]
			if c == nil {
				continue
			}
			list = append(list, map[string]interface{}{
				"id":           c.ID,
				"display_text": c.DisplayText,
				"cover_url":    storage.FileURL(c.CoverPath, "covers"),
				"claimed":      true,
			})
		}
	}
	return list
}

func (ds *DuelSession) getMyCards(userID int64) []map[string]interface{} {
	ids := ds.getMyCardIDs(userID)
	return ds.buildCardList(ids)
}

func (ds *DuelSession) getMyCardIDs(userID int64) []int64 {
	if userID == ds.player1ID {
		return ds.player1Cards
	}
	return ds.player2Cards
}

func (ds *DuelSession) inArea(cardID int64, area []int64) bool {
	for _, id := range area {
		if id == cardID {
			return true
		}
	}
	return false
}

func (ds *DuelSession) removeCard(area []int64, cardID int64) []int64 {
	result := make([]int64, 0, len(area))
	for _, id := range area {
		if id != cardID {
			result = append(result, id)
		}
	}
	return result
}
