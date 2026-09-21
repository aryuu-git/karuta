// 成就定义注册表：32 个成就的唯一权威定义（title/description/icon/category/target）。
// 定义放代码而非数据库——单体项目定义随版本走，前端经 /api/me/achievements 原样获取，
// 零双端同步成本。2026-09-21 Owner 决策：成就数据全量丢弃、事件驱动从零累计、
// 不回填历史战绩。
package achievement

// Category 成就分组（个人页按此分节展示）
type Category string

const (
	CategoryParticipate Category = "participate" // 参与
	CategoryVictory     Category = "victory"     // 胜利
	CategorySkill       Category = "skill"       // 抢牌技巧
	CategoryMode        Category = "mode"        // 模式专精
	CategoryContent     Category = "content"     // 内容创造
	CategorySocial      Category = "social"      // 社交
	CategoryFun         Category = "fun"         // 趣味
)

// Def 单个成就定义。Target>0 为累计型（progress 达标解锁）；
// Target<=0 为事件型（发生即解锁，由评估器直接 Unlock）。
type Def struct {
	Key         string
	Title       string
	Description string
	Icon        string
	Category    Category
	Target      int64
	Hidden      bool // 未解锁时个人页仅显示剪影与谜语
}

// Registry 全部成就定义，顺序即个人页展示顺序。
var Registry = []Def{
	// ── 参与（4） ──
	{Key: "first_game", Title: "初阵", Description: "完成你的第一局对战", Icon: "🌸", Category: CategoryParticipate, Target: 1},
	{Key: "games_10", Title: "十合", Description: "累计完成 10 局对战", Icon: "🎴", Category: CategoryParticipate, Target: 10},
	{Key: "games_100", Title: "百战", Description: "累计完成 100 局对战", Icon: "⚔️", Category: CategoryParticipate, Target: 100},
	{Key: "games_1000", Title: "千本樱", Description: "累计完成 1000 局对战", Icon: "🌳", Category: CategoryParticipate, Target: 1000},

	// ── 胜利（5） ──
	{Key: "first_win", Title: "初冠", Description: "首次夺得第一", Icon: "👑", Category: CategoryVictory, Target: 1},
	{Key: "wins_10", Title: "常胜将军", Description: "累计 10 次第一", Icon: "🎖️", Category: CategoryVictory, Target: 10},
	{Key: "wins_100", Title: "百胜大名", Description: "累计 100 次第一", Icon: "🏆", Category: CategoryVictory, Target: 100},
	{Key: "all_modes_win", Title: "三冠王", Description: "自动、裁判、对阵三种模式各胜一次", Icon: "♛", Category: CategoryVictory, Target: 0},
	{Key: "win_streak_3", Title: "三连胜", Description: "连续三局夺得第一", Icon: "🔥", Category: CategoryVictory, Target: 0},

	// ── 抢牌技巧（6） ──
	{Key: "world_first", Title: "世一网", Description: "首次抢到最后一张牌", Icon: "🌐", Category: CategorySkill, Target: 1},
	{Key: "world_first_10", Title: "世一网十段", Description: "累计 10 次抢到最后一张牌", Icon: "🕸️", Category: CategorySkill, Target: 10},
	{Key: "flawless_win", Title: "神速", Description: "单局零扣分且夺得第一", Icon: "⚡", Category: CategorySkill, Target: 1},
	{Key: "penalty_zero_10", Title: "铁壁之手", Description: "累计 10 局零扣分完赛", Icon: "🛡️", Category: CategorySkill, Target: 10},
	{Key: "oops_king", Title: "手残王", Description: "单局扣分达到 5 分", Icon: "🤦", Category: CategorySkill, Target: 1},
	{Key: "perfect_round", Title: "一击必杀", Description: "？？？（单局抢下全部读牌）", Icon: "💯", Category: CategorySkill, Target: 1, Hidden: true},

	// ── 模式专精（6） ──
	{Key: "judge_first", Title: "裁判官", Description: "以裁判身份完成一局", Icon: "🃏", Category: CategoryMode, Target: 1},
	{Key: "judge_sweep", Title: "明镜止水", Description: "裁判局全部牌被抢光（无人漏抢）", Icon: "🎐", Category: CategoryMode, Target: 1},
	{Key: "duel_win_1", Title: "决斗者", Description: "对阵模式首胜", Icon: "🔥", Category: CategoryMode, Target: 1},
	{Key: "duel_win_10", Title: "决斗之巅", Description: "对阵模式累计 10 胜", Icon: "⚡", Category: CategoryMode, Target: 10},
	{Key: "duel_flawless", Title: "完胜", Description: "？？？（对阵中对手颗粒无收）", Icon: "💀", Category: CategoryMode, Target: 1, Hidden: true},
	{Key: "duel_first_blood", Title: "一骑讨", Description: "对阵中首次抢到对方区域的牌", Icon: "🗡️", Category: CategoryMode, Target: 1},

	// ── 内容创造（5） ──
	{Key: "first_card", Title: "造牌者", Description: "创建你的第一张歌牌", Icon: "🎴", Category: CategoryContent, Target: 1},
	{Key: "cards_50", Title: "量产家", Description: "累计创建 50 张歌牌", Icon: "🏭", Category: CategoryContent, Target: 50},
	{Key: "decks_5", Title: "牌组收藏家", Description: "累计创建 5 个牌组", Icon: "📚", Category: CategoryContent, Target: 5},
	{Key: "first_share", Title: "分享家", Description: "首次把牌组分享给所有人", Icon: "🎁", Category: CategoryContent, Target: 1},
	{Key: "multi_audio_5", Title: "组曲师", Description: "单张歌牌挂上 5 首音频", Icon: "🎵", Category: CategoryContent, Target: 5},

	// ── 社交（3） ──
	{Key: "first_invite_used", Title: "招募者", Description: "你发出的邀请码被成功使用", Icon: "📨", Category: CategorySocial, Target: 1},
	{Key: "rooms_hosted_10", Title: "常主", Description: "累计开辟 10 次战场", Icon: "🏠", Category: CategorySocial, Target: 10},
	{Key: "full_house", Title: "满员盛况", Description: "参与一局四人以上的完赛对局", Icon: "🏯", Category: CategorySocial, Target: 1},

	// ── 趣味（3） ──
	{Key: "night_owl", Title: "夜猫", Description: "？？？（北京时间午夜后的完赛）", Icon: "🦉", Category: CategoryFun, Target: 1, Hidden: true},
	{Key: "comeback", Title: "苦命鸳鸯", Description: "累计 3 次屈居第二", Icon: "💔", Category: CategoryFun, Target: 3},
	{Key: "loyal", Title: "不舍不弃", Description: "用同一副牌组累计完赛 20 局", Icon: "🌙", Category: CategoryFun, Target: 0},
}

// ByKey 索引。
var ByKey = func() map[string]Def {
	m := make(map[string]Def, len(Registry))
	for _, d := range Registry {
		m[d.Key] = d
	}
	return m
}()
