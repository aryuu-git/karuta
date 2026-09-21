// 成就评估器：对局结算与内容事件的解锁判定。
// 语义（Owner 决策 2026-09-21）：事件驱动从零累计，不回填历史战绩；
// 全部评估 best-effort——任何失败仅记日志，绝不阻塞结算主流程。
package achievement

import (
	"log/slog"
	"time"

	"karuta/backend/store"
)

// beijing 北京时间固定 UTC+8（Owner 决策）：与服务器时区无关。
var beijing = time.FixedZone("CST", 8*3600)

// Unlock 本次新解锁摘要（推送/响应载荷）。
type Unlock struct {
	Key   string `json:"key"`
	Title string `json:"title"`
	Icon  string `json:"icon"`
}

// GameSnapshot auto/judge 结算快照，由 GameSession 提供（内存权威数据）。
type GameSnapshot struct {
	Mode           string // auto | judge
	Training       bool
	JudgeUserID    int64
	PlayerCount    int // 参赛玩家数（judge 模式不含裁判）
	MissedRounds   int
	PerfectWinner  int64 // 本局全部回合同一赢家（0=无）
	LastCardWinner int64
	Penalties      map[int64]int
	Ranks          map[int64]int // 唯一名次（与结算展示一致）
	PlayerIDs      []int64
}

// DuelSnapshot duel 结算快照，由 DuelSession 提供。
type DuelSnapshot struct {
	WinnerID     int64 // 0=平局
	LoserID      int64
	LoserGrabbed int
	FirstBlood   map[int64]bool // 本局抢中过对方区域牌的玩家
	PlayerIDs    []int64
}

// contentKeys 内容事件 → 累计型成就键。
var contentKeys = map[string][]string{
	"card":   {"first_card", "cards_50"},
	"deck":   {"decks_5"},
	"share":  {"first_share"},
	"audio":  {"multi_audio_5"},
	"invite": {"first_invite_used"},
	"room":   {"rooms_hosted_10"},
}

// 内部模式胜场计数键（不出注册表，仅用于 all_modes_win 判定）。
const (
	internalWinAuto  = "_win_auto"
	internalWinJudge = "_win_judge"
	internalWinDuel  = "_win_duel"
)

type Evaluator struct{ s *store.Store }

func NewEvaluator(s *store.Store) *Evaluator { return &Evaluator{s: s} }

// OnGameEnd auto/judge 结算钩子：返回 每用户新解锁列表。
func (e *Evaluator) OnGameEnd(s GameSnapshot) map[int64][]Unlock {
	if s.Training {
		return nil // 练习局不计任何成就
	}
	out := map[int64][]Unlock{}
	for _, uid := range s.PlayerIDs {
		// 参与
		for _, k := range []string{"first_game", "games_10", "games_100", "games_1000"} {
			e.incr(out, uid, k)
		}
		// 夜猫（北京时间 0–4 点完赛）
		if h := time.Now().In(beijing).Hour(); h >= 0 && h < 4 {
			e.incr(out, uid, "night_owl")
		}
		// 胜利
		if s.Ranks[uid] == 1 {
			for _, k := range []string{"first_win", "wins_10", "wins_100"} {
				e.incr(out, uid, k)
			}
			if s.Penalties[uid] == 0 {
				e.incr(out, uid, "flawless_win")
			}
			modeKey := internalWinAuto
			if s.Mode == "judge" {
				modeKey = internalWinJudge
			}
			e.trackModeWin(out, uid, modeKey)
			if ok, err := e.s.Achievements.WinStreakTop3(uid); err == nil && ok {
				e.unlock(out, uid, "win_streak_3")
			}
		}
		if s.Ranks[uid] == 2 {
			e.incr(out, uid, "comeback")
		}
		// 技巧
		if s.Penalties[uid] == 0 {
			e.incr(out, uid, "penalty_zero_10")
		}
		if s.Penalties[uid] >= 5 {
			e.incr(out, uid, "oops_king")
		}
		if s.PerfectWinner == uid {
			e.incr(out, uid, "perfect_round")
		}
		if s.LastCardWinner == uid {
			e.incr(out, uid, "world_first")
			e.incr(out, uid, "world_first_10")
		}
		// 社交
		if s.PlayerCount >= 4 {
			e.incr(out, uid, "full_house")
		}
		// 忠诚（同牌组完赛数查询，历史局计入——忠诚度度量而非事件计数）
		if n, err := e.s.Achievements.MaxSameDeckGames(uid); err == nil && n >= 20 {
			e.unlock(out, uid, "loyal")
		}
	}
	// 裁判成就（judge 模式）
	if s.Mode == "judge" && s.JudgeUserID != 0 {
		e.incr(out, s.JudgeUserID, "judge_first")
		if s.MissedRounds == 0 {
			e.incr(out, s.JudgeUserID, "judge_sweep")
		}
	}
	return out
}

// OnDuelEnd duel 结算钩子。
func (e *Evaluator) OnDuelEnd(s DuelSnapshot) map[int64][]Unlock {
	out := map[int64][]Unlock{}
	for _, uid := range s.PlayerIDs {
		for _, k := range []string{"first_game", "games_10", "games_100", "games_1000"} {
			e.incr(out, uid, k)
		}
		if h := time.Now().In(beijing).Hour(); h >= 0 && h < 4 {
			e.incr(out, uid, "night_owl")
		}
		if s.PlayerCountSafe() >= 4 {
			e.incr(out, uid, "full_house")
		}
		if s.FirstBlood[uid] {
			e.incr(out, uid, "duel_first_blood")
		}
	}
	if s.WinnerID != 0 {
		for _, k := range []string{"first_win", "wins_10", "wins_100", "duel_win_1", "duel_win_10"} {
			e.incr(out, s.WinnerID, k)
		}
		e.trackModeWin(out, s.WinnerID, internalWinDuel)
		// duel 末牌=决胜牌，计入世一网
		e.incr(out, s.WinnerID, "world_first")
		e.incr(out, s.WinnerID, "world_first_10")
		if s.LoserGrabbed == 0 {
			e.incr(out, s.WinnerID, "duel_flawless")
		}
		if ok, err := e.s.Achievements.WinStreakTop3(s.WinnerID); err == nil && ok {
			e.unlock(out, s.WinnerID, "win_streak_3")
		}
	}
	if s.LoserID != 0 {
		e.incr(out, s.LoserID, "comeback") // duel 败者视作屈居第二
	}
	return out
}

// OnContentEvent 内容/社交写操作钩子（本人为操作者；invite 事件传邀请人）。
func (e *Evaluator) OnContentEvent(userID int64, kind string) []Unlock {
	keys, ok := contentKeys[kind]
	if !ok {
		return nil
	}
	local := map[int64][]Unlock{}
	for _, k := range keys {
		e.incr(local, userID, k)
	}
	return local[userID]
}

// OnAudioAdded AddAudio 钩子：组曲师按「单卡音频数」判定，语义与全局累计不同，
// 单独走查询路径。
func (e *Evaluator) OnAudioAdded(userID, cardID int64) []Unlock {
	n, err := e.s.Achievements.CountCardAudios(cardID)
	if err != nil {
		slog.Error("achievement audio count failed", "card_id", cardID, "err", err)
		return nil
	}
	if n < 5 {
		return nil
	}
	local := map[int64][]Unlock{}
	e.unlock(local, userID, "multi_audio_5")
	return local[userID]
}

// UserAchievement 输出行：注册表定义 + 用户侧状态。
type UserAchievement struct {
	Key         string     `json:"key"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Icon        string     `json:"icon"`
	Category    Category   `json:"category"`
	Target      int64      `json:"target"`
	Hidden      bool       `json:"hidden"`
	Progress    int64      `json:"progress"`
	UnlockedAt  *time.Time `json:"unlocked_at"`
}

// ListForUser 注册表全量 × 用户状态（无行=progress 0 未解锁）。
func (e *Evaluator) ListForUser(userID int64) ([]UserAchievement, error) {
	rows, err := e.s.Achievements.List(userID)
	if err != nil {
		return nil, err
	}
	state := make(map[string]store.AchievementRecord, len(rows))
	for _, r := range rows {
		state[r.Key] = r
	}
	list := make([]UserAchievement, 0, len(Registry))
	for _, d := range Registry {
		ua := UserAchievement{
			Key: d.Key, Title: d.Title, Description: d.Description, Icon: d.Icon,
			Category: d.Category, Target: d.Target, Hidden: d.Hidden,
		}
		if r, ok := state[d.Key]; ok {
			ua.Progress = r.Progress
			ua.UnlockedAt = r.UnlockedAt
		}
		list = append(list, ua)
	}
	return list, nil
}

// incr 累计型事件：进度 +1，达标则收集新解锁。
func (e *Evaluator) incr(out map[int64][]Unlock, userID int64, key string) {
	def, ok := ByKey[key]
	if !ok {
		return
	}
	unlocked, err := e.s.Achievements.Increment(userID, key, 1, def.Target)
	if err != nil {
		slog.Error("achievement increment failed", "key", key, "user_id", userID, "err", err)
		return
	}
	if unlocked {
		appendUnlock(out, userID, def)
	}
}

// unlock 事件型直接解锁（Target<=0）。
func (e *Evaluator) unlock(out map[int64][]Unlock, userID int64, key string) {
	def, ok := ByKey[key]
	if !ok {
		return
	}
	unlocked, err := e.s.Achievements.Unlock(userID, key)
	if err != nil {
		slog.Error("achievement unlock failed", "key", key, "user_id", userID, "err", err)
		return
	}
	if unlocked {
		appendUnlock(out, userID, def)
	}
}

// trackModeWin 内部模式胜场计数；三模式齐 → 三冠王。
func (e *Evaluator) trackModeWin(out map[int64][]Unlock, userID int64, modeKey string) {
	if _, err := e.s.Achievements.Increment(userID, modeKey, 1, 0); err != nil {
		slog.Error("achievement mode win track failed", "key", modeKey, "user_id", userID, "err", err)
	}
	for _, k := range []string{internalWinAuto, internalWinJudge, internalWinDuel} {
		n, err := e.s.Achievements.Progress(userID, k)
		if err != nil || n == 0 {
			return
		}
	}
	e.unlock(out, userID, "all_modes_win")
}

func appendUnlock(out map[int64][]Unlock, userID int64, def Def) {
	out[userID] = append(out[userID], Unlock{Key: def.Key, Title: def.Title, Icon: def.Icon})
}

// PlayerCountSafe duel 恒为 2 人局；占位实现保持快照接口稳定。
func (s DuelSnapshot) PlayerCountSafe() int { return 2 }
