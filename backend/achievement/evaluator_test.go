// 成就评估器回归（2026-09-21 落地）：事件驱动从零累计、只解锁一次、
// 练习局不计、duel 胜负与内容事件语义。
package achievement

import (
	"database/sql"
	"path/filepath"
	"testing"

	"karuta/backend/store"
)

func newTestEvaluator(t *testing.T) (*Evaluator, *store.Store, *sql.DB) {
	t.Helper()
	db, err := store.OpenDB(filepath.Join(t.TempDir(), "karuta.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	s := store.NewStore(db)
	if _, err := db.Exec(`
		INSERT INTO users (id, username, email, password) VALUES (1, 'a', 'a@x.test', 'x');
		INSERT INTO users (id, username, email, password) VALUES (2, 'b', 'b@x.test', 'x');
	`); err != nil {
		t.Fatal(err)
	}
	return NewEvaluator(s), s, db
}

func unlocked(t *testing.T, e *Evaluator, userID int64, key string) bool {
	t.Helper()
	list, err := e.ListForUser(userID)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range list {
		if a.Key == key {
			return a.UnlockedAt != nil
		}
	}
	return false
}

func progressOf(t *testing.T, e *Evaluator, userID int64, key string) int64 {
	t.Helper()
	list, err := e.ListForUser(userID)
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range list {
		if a.Key == key {
			return a.Progress
		}
	}
	return 0
}

// 核心语义：首局胜利（零扣分）一次性解锁参与/胜利/技巧三类；重复事件不再解锁
func TestGameEndUnlocksOnce(t *testing.T) {
	e, _, _ := newTestEvaluator(t)
	snap := GameSnapshot{
		Mode: "auto", PlayerCount: 2,
		Penalties: map[int64]int{1: 0, 2: 3},
		Ranks:     map[int64]int{1: 1, 2: 2},
		PlayerIDs: []int64{1, 2},
	}
	out := e.OnGameEnd(snap)
	if len(out[1]) == 0 {
		t.Fatal("expected unlocks for winner")
	}
	for _, key := range []string{"first_game", "first_win", "flawless_win"} {
		if !unlocked(t, e, 1, key) {
			t.Fatalf("expected %s unlocked after first win", key)
		}
	}
	if progressOf(t, e, 1, "penalty_zero_10") != 1 {
		t.Fatal("zero-penalty game must progress penalty_zero_10 (target 10)")
	}
	if !unlocked(t, e, 2, "first_game") {
		t.Fatal("loser must also unlock first_game")
	}
	if !unlocked(t, e, 2, "comeback") && progressOf(t, e, 2, "comeback") != 1 {
		t.Fatal("rank2 must progress comeback")
	}

	// 第二局同样结果：first_win 不重复出现在新解锁列表，进度继续累计
	out2 := e.OnGameEnd(snap)
	for _, u := range out2[1] {
		if u.Key == "first_game" || u.Key == "first_win" {
			t.Fatalf("achievement %s unlocked twice", u.Key)
		}
	}
	if progressOf(t, e, 1, "first_win") != 2 {
		t.Fatalf("win progress=%d want 2", progressOf(t, e, 1, "first_win"))
	}
	if progressOf(t, e, 1, "games_10") != 2 {
		t.Fatalf("games progress=%d want 2", progressOf(t, e, 1, "games_10"))
	}
}

// 累计型达标解锁：手残王单局 5 扣分即时；铁壁之手需 10 次
func TestCumulativeThresholds(t *testing.T) {
	e, _, _ := newTestEvaluator(t)
	snap := GameSnapshot{
		Mode: "auto", PlayerCount: 2,
		Penalties: map[int64]int{1: 5, 2: 0},
		Ranks:     map[int64]int{1: 2, 2: 1},
		PlayerIDs: []int64{1, 2},
	}
	e.OnGameEnd(snap)
	if !unlocked(t, e, 1, "oops_king") {
		t.Fatal("penalty>=5 must unlock oops_king immediately")
	}
	if unlocked(t, e, 2, "penalty_zero_10") {
		t.Fatal("penalty_zero_10 needs 10 games")
	}
	for i := 0; i < 9; i++ {
		e.OnGameEnd(snap)
	}
	if !unlocked(t, e, 2, "penalty_zero_10") {
		t.Fatal("penalty_zero_10 must unlock at 10 zero-penalty games")
	}
}

// 练习局不计任何成就
func TestTrainingIgnored(t *testing.T) {
	e, _, _ := newTestEvaluator(t)
	out := e.OnGameEnd(GameSnapshot{Training: true, PlayerIDs: []int64{1}})
	if out != nil {
		t.Fatal("training game must not produce unlocks")
	}
	if progressOf(t, e, 1, "first_game") != 0 {
		t.Fatal("training must not progress achievements")
	}
}

// duel：胜者得胜场与世一网，败者 comeback，一骑讨独立计
func TestDuelEndSemantics(t *testing.T) {
	e, _, _ := newTestEvaluator(t)
	out := e.OnDuelEnd(DuelSnapshot{
		WinnerID: 1, LoserID: 2, LoserGrabbed: 0,
		FirstBlood: map[int64]bool{2: true},
		PlayerIDs:  []int64{1, 2},
	})
	if len(out[1]) == 0 {
		t.Fatal("duel winner must unlock achievements")
	}
	for _, key := range []string{"duel_win_1", "world_first", "duel_flawless", "first_game"} {
		if !unlocked(t, e, 1, key) {
			t.Fatalf("duel winner must unlock %s", key)
		}
	}
	if !unlocked(t, e, 2, "duel_first_blood") {
		t.Fatal("first blood must unlock")
	}
	if progressOf(t, e, 2, "comeback") != 1 {
		t.Fatal("duel loser must progress comeback")
	}
}

// 内容事件：造牌者即时、量产家 50 张达标
func TestContentEvents(t *testing.T) {
	e, _, _ := newTestEvaluator(t)
	e.OnContentEvent(1, "card")
	if !unlocked(t, e, 1, "first_card") {
		t.Fatal("first card must unlock immediately")
	}
	for i := 0; i < 49; i++ {
		e.OnContentEvent(1, "card")
	}
	if !unlocked(t, e, 1, "cards_50") {
		t.Fatal("cards_50 must unlock at 50")
	}
}

// 注册表完整性：32 项、key 唯一、hidden 三项
func TestRegistryShape(t *testing.T) {
	if len(Registry) != 32 {
		t.Fatalf("registry has %d defs, want 32", len(Registry))
	}
	seen := map[string]bool{}
	hidden := 0
	for _, d := range Registry {
		if seen[d.Key] {
			t.Fatalf("duplicate key %s", d.Key)
		}
		seen[d.Key] = true
		if d.Hidden {
			hidden++
		}
	}
	if hidden != 3 {
		t.Fatalf("hidden count=%d want 3", hidden)
	}
}

// 口径回归（第二轮回顾发现）：duel 席位 role=duel_p1/p2，原 CTE 只认
// role='player' → duel 局在统计与连胜中整体不可见，duel 落分形同虚设。
func TestDuelRolesCountedInStatsAndStreak(t *testing.T) {
	e, s, db := newTestEvaluator(t)
	if _, err := db.Exec(`INSERT INTO decks (id, owner_id, name) VALUES (1, 1, 'deck')`); err != nil {
		t.Fatal(err)
	}
	// 两局 auto（user1 胜）+ 一局 duel（user1 以 duel_p1 身份胜，score=1）
	for i := 1; i <= 2; i++ {
		room, err := s.Rooms.CreateRoom("STAT0"+string(rune('0'+i)), 1, 1, 5, "auto", false, "normal", true, true, 0, false, 50, false, 0)
		if err != nil {
			t.Fatal(err)
		}
		_ = s.Rooms.AddPlayer(room.ID, 1, "player")
		_ = s.Rooms.AddPlayer(room.ID, 2, "player")
		_ = s.Rooms.UpdateScore(room.ID, 1, 10)
		_ = s.Rooms.UpdateStatus(room.ID, "end")
	}
	duelRoom, err := s.Rooms.CreateRoom("DUEL99", 1, 1, 5, "duel", false, "normal", true, true, 0, false, 50, false, 0)
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Rooms.AddPlayer(duelRoom.ID, 1, "duel_p1")
	_ = s.Rooms.AddPlayer(duelRoom.ID, 2, "duel_p2")
	_ = s.Rooms.UpdateScore(duelRoom.ID, 1, 1)
	_ = s.Rooms.UpdateStatus(duelRoom.ID, "end")

	stats, err := s.Rooms.GetUserStats(1)
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalGames != 3 {
		t.Fatalf("total_games=%d want 3（duel 席位必须计入）", stats.TotalGames)
	}
	if stats.FirstGames != 3 {
		t.Fatalf("first_games=%d want 3", stats.FirstGames)
	}
	if ok, err := s.Achievements.WinStreakTop3(1); err != nil || !ok {
		t.Fatalf("streak over 2 auto + 1 duel wins must hold, ok=%v err=%v", ok, err)
	}
	_ = e
}

func TestWinStreakTop3(t *testing.T) {
	e, s, db := newTestEvaluator(t)
	if _, err := db.Exec(`INSERT INTO decks (id, owner_id, name) VALUES (1, 1, 'deck')`); err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 3; i++ {
		room, err := s.Rooms.CreateRoom("CODE0"+string(rune('0'+i)), 1, 1, 5, "auto", false, "normal", true, true, 0, false, 50, false, 0)
		if err != nil {
			t.Fatal(err)
		}
		_ = s.Rooms.AddPlayer(room.ID, 1, "player")
		_ = s.Rooms.AddPlayer(room.ID, 2, "player")
		_ = s.Rooms.UpdateScore(room.ID, 1, 10)
		_ = s.Rooms.UpdateScore(room.ID, 2, 3)
		_ = s.Rooms.UpdateStatus(room.ID, "end")
	}
	// 触发一次胜利事件驱动 streak 检查
	e.OnGameEnd(GameSnapshot{
		Mode: "auto", PlayerCount: 2,
		Penalties: map[int64]int{1: 1, 2: 1},
		Ranks:     map[int64]int{1: 1, 2: 2},
		PlayerIDs: []int64{1, 2},
	})
	if !unlocked(t, e, 1, "win_streak_3") {
		t.Fatal("three straight firsts must unlock win_streak_3")
	}
}
