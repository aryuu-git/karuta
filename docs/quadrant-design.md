# 猜象限（Quadrant Guess）— 系统设计

## 概述

一款基于"条目+标签"的多人推理游戏。游戏有两个隐藏标签作为坐标轴，条目按归属度放置在四象限中。玩家通过观察条目位置，从候选标签池中猜出真正的两个轴标签。

**通用性**：条目可以是动画、游戏、角色、群友、食物——任何东西。标签也是任意的。Bangumi 只是一个可选的条目导入源。

---

## 目录结构

```
karuta/
├── quadrant/                    # 独立模块根目录
│   ├── model.go                 # 数据模型
│   ├── store.go                 # 数据库操作
│   ├── migrate.go               # DDL 迁移
│   ├── handler.go               # HTTP handler
│   ├── ws_hub.go                # WebSocket hub (象限游戏专用)
│   ├── ws_session.go            # 游戏 session 生命周期
│   ├── ws_judge.go              # 裁判控制逻辑
│   ├── engine.go                # 出题引擎 (质量检查/自动出题)
│   ├── score_bangumi.go         # 归属度策略: Bangumi count
│   ├── score_ai.go              # 归属度策略: AI打分 (MiMo)
│   └── source_bangumi.go        # 条目导入源: Bangumi API
├── frontend/src/pages/quadrant/ # 前端页面
│   ├── QuadrantLobby.tsx        # 大厅/题库入口
│   ├── QuadrantRoom.tsx         # 房间等待/准备
│   ├── QuadrantGame.tsx         # 游戏主界面
│   ├── QuadrantJudge.tsx        # 裁判控制台
│   ├── QuadrantBankList.tsx     # 题库列表
│   └── QuadrantBankEdit.tsx     # 题库编辑
└── frontend/src/pages/HomePage.tsx  # 仅加一个"快闪游戏"入口
```

与主项目的耦合点：
1. `cmd/server/main.go` — 注册路由 `quadrant.RegisterRoutes(r)`
2. `internal/store/db.go` — 传入 `*sql.DB` 给 quadrant 模块
3. `frontend/src/pages/HomePage.tsx` — 入口按钮
4. 复用现有的 `middleware.Auth` 和 `User` 模型

---

## 数据模型

### 核心实体

```go
// Item — 条目，可以是任何东西
type Item struct {
    ID       int64  `json:"id"`
    BankID   int64  `json:"bank_id"`           // 归属题库
    Title    string `json:"title"`
    ImageURL string `json:"image_url"`          // 展示图 (URL或路径)
    Source   string `json:"source"`             // "bangumi" | "manual" | 将来可扩展
    SourceID string `json:"source_id,omitempty"` // 外部平台ID
}

// Label — 标签
type Label struct {
    ID     int64  `json:"id"`
    BankID int64  `json:"bank_id"`
    Name   string `json:"name"` // 任意文字
}

// Question — 一道题
type Question struct {
    ID           int64   `json:"id"`
    BankID       int64   `json:"bank_id"`
    AxisXLabelID int64   `json:"axis_x_label_id"` // 答案 X 轴标签
    AxisYLabelID int64   `json:"axis_y_label_id"` // 答案 Y 轴标签
    ScoreSource  string  `json:"score_source"`    // "bangumi" | "ai" | "manual"
    Quality      float64 `json:"quality"`         // 质量评分 0-1
}

// QuestionCandidate — 题目的候选标签池
type QuestionCandidate struct {
    QuestionID int64 `json:"question_id"`
    LabelID    int64 `json:"label_id"`
}

// Placement — 条目在题目中的坐标
type Placement struct {
    ID          int64   `json:"id"`
    QuestionID  int64   `json:"question_id"`
    ItemID      int64   `json:"item_id"`
    X           float64 `json:"x"`            // [-1, 1]
    Y           float64 `json:"y"`            // [-1, 1]
    RevealOrder int     `json:"reveal_order"` // 揭示顺序, 0=随机
}

// QuestionBank — 题库
type QuestionBank struct {
    ID            int64  `json:"id"`
    Name          string `json:"name"`
    Description   string `json:"description"`
    OwnerID       int64  `json:"owner_id"`
    Visibility    string `json:"visibility"`     // "private" | "public"
    Category      string `json:"category"`       // 展示标签: "anime"|"game"|"character"|"people"|"custom"
    QuestionCount int    `json:"question_count"`
    PlayCount     int    `json:"play_count"`
    LikeCount     int    `json:"like_count"`
    CreatedAt     int64  `json:"created_at"`
    UpdatedAt     int64  `json:"updated_at"`
}

// Room — 象限游戏房间
type Room struct {
    ID          int64  `json:"id"`
    Code        string `json:"code"`           // 6位邀请码
    Name        string `json:"name"`
    HostID      int64  `json:"host_id"`
    JudgeID     int64  `json:"judge_id"`       // 裁判模式下的裁判, 0=无裁判
    BankID      int64  `json:"bank_id"`        // 关联题库, 0=裁判现场出题
    Status      string `json:"status"`         // waiting | preparing | playing | ended
    Visibility  string `json:"visibility"`     // "public" | "private"
    MaxPlayers  int    `json:"max_players"`
    
    // 游戏配置
    RoundsTotal    int `json:"rounds_total"`     // 连续玩几题, 0=单题
    RoundsCurrent  int `json:"rounds_current"`
    CandidateCount int `json:"candidate_count"`  // 候选标签数, 默认8
    RevealInterval int `json:"reveal_interval"`  // 自动揭示间隔(秒), 0=裁判手动
    GuessWindow    int `json:"guess_window"`     // 猜测窗口(秒), 0=不限
    
    // 计分配置
    BaseScore      int `json:"base_score"`       // 基础分100
    DecayPerReveal int `json:"decay_per_reveal"` // 每揭示衰减10
    WrongPenalty   int `json:"wrong_penalty"`    // 猜错-20
    CooldownRounds int `json:"cooldown_rounds"`  // 猜错冷却轮数
    
    CreatedAt int64 `json:"created_at"`
}

// Player — 房间中的玩家
type Player struct {
    RoomID   int64  `json:"room_id"`
    UserID   int64  `json:"user_id"`
    Username string `json:"username"`
    Role     string `json:"role"`      // "player" | "judge" | "spectator"
    Score    int    `json:"score"`     // 累计总分
    IsReady  bool   `json:"is_ready"`
    JoinedAt int64  `json:"joined_at"`
}

// Guess — 猜测记录
type Guess struct {
    ID         int64  `json:"id"`
    RoomID     int64  `json:"room_id"`
    QuestionID int64  `json:"question_id"`
    UserID     int64  `json:"user_id"`
    GuessXName string `json:"guess_x_name"` // 猜的X轴标签名
    GuessYName string `json:"guess_y_name"` // 猜的Y轴标签名
    Correct    bool   `json:"correct"`
    Score      int    `json:"score"`        // 本次获得的分数
    RevealedAt int    `json:"revealed_at"`  // 猜测时已揭示几部
    CreatedAt  int64  `json:"created_at"`
}

// TagScore — 归属度缓存 (AI打分结果等)
type TagScore struct {
    ItemID    int64   `json:"item_id"`
    LabelName string  `json:"label_name"`
    Source    string  `json:"source"`     // "bangumi" | "ai"
    Score     float64 `json:"score"`      // 原始分
    UpdatedAt int64   `json:"updated_at"`
}
```

---

## 数据库 DDL

```sql
-- 题库
CREATE TABLE IF NOT EXISTS q_banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id INTEGER NOT NULL,
    visibility TEXT DEFAULT 'private',
    category TEXT DEFAULT 'custom',
    play_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
);

-- 条目
CREATE TABLE IF NOT EXISTS q_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    image_url TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    source_id TEXT DEFAULT '',
    created_at INTEGER DEFAULT (unixepoch())
);

-- 标签
CREATE TABLE IF NOT EXISTS q_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    UNIQUE(bank_id, name)
);

-- 题目
CREATE TABLE IF NOT EXISTS q_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_id INTEGER NOT NULL REFERENCES q_banks(id) ON DELETE CASCADE,
    axis_x_label_id INTEGER NOT NULL REFERENCES q_labels(id),
    axis_y_label_id INTEGER NOT NULL REFERENCES q_labels(id),
    score_source TEXT DEFAULT 'manual',
    quality REAL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

-- 题目候选标签池
CREATE TABLE IF NOT EXISTS q_question_candidates (
    question_id INTEGER NOT NULL REFERENCES q_questions(id) ON DELETE CASCADE,
    label_id INTEGER NOT NULL REFERENCES q_labels(id),
    PRIMARY KEY (question_id, label_id)
);

-- 条目坐标
CREATE TABLE IF NOT EXISTS q_placements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES q_questions(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES q_items(id),
    x REAL NOT NULL,
    y REAL NOT NULL,
    reveal_order INTEGER DEFAULT 0
);

-- 归属度缓存
CREATE TABLE IF NOT EXISTS q_tag_scores (
    item_id INTEGER NOT NULL,
    label_name TEXT NOT NULL,
    source TEXT NOT NULL,
    score REAL NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (item_id, label_name, source)
);

-- 房间
CREATE TABLE IF NOT EXISTS q_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT DEFAULT '',
    host_id INTEGER NOT NULL,
    judge_id INTEGER DEFAULT 0,
    bank_id INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting',
    visibility TEXT DEFAULT 'private',
    max_players INTEGER DEFAULT 8,
    rounds_total INTEGER DEFAULT 1,
    rounds_current INTEGER DEFAULT 0,
    candidate_count INTEGER DEFAULT 8,
    reveal_interval INTEGER DEFAULT 10,
    guess_window INTEGER DEFAULT 0,
    base_score INTEGER DEFAULT 100,
    decay_per_reveal INTEGER DEFAULT 10,
    wrong_penalty INTEGER DEFAULT 20,
    cooldown_rounds INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch())
);

-- 房间玩家
CREATE TABLE IF NOT EXISTS q_players (
    room_id INTEGER NOT NULL REFERENCES q_rooms(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    username TEXT DEFAULT '',
    role TEXT DEFAULT 'player',
    score INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (room_id, user_id)
);

-- 猜测记录
CREATE TABLE IF NOT EXISTS q_guesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    guess_x_name TEXT NOT NULL,
    guess_y_name TEXT NOT NULL,
    correct BOOLEAN DEFAULT FALSE,
    score INTEGER DEFAULT 0,
    revealed_at INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);
```

---

## API 设计

### 题库管理

```
POST   /api/quadrant/banks                    创建题库
GET    /api/quadrant/banks                    题库列表 (?visibility=public&category=anime)
GET    /api/quadrant/banks/:id                题库详情 (含题目数/统计)
PUT    /api/quadrant/banks/:id                更新题库信息
DELETE /api/quadrant/banks/:id                删除题库
```

### 题库内容编辑

```
# 条目
POST   /api/quadrant/banks/:id/items          添加条目 (手动或Bangumi导入)
GET    /api/quadrant/banks/:id/items          条目列表
DELETE /api/quadrant/items/:id                删除条目

# 标签
POST   /api/quadrant/banks/:id/labels         添加标签
GET    /api/quadrant/banks/:id/labels         标签列表
DELETE /api/quadrant/labels/:id               删除标签

# 题目
POST   /api/quadrant/banks/:id/questions      创建题目
GET    /api/quadrant/banks/:id/questions      题目列表
GET    /api/quadrant/questions/:id            题目详情 (含坐标)
PUT    /api/quadrant/questions/:id            更新题目
DELETE /api/quadrant/questions/:id            删除题目

# AI打分
POST   /api/quadrant/questions/:id/ai-score   对该题所有条目×标签 AI打分
GET    /api/quadrant/questions/:id/quality     质量评估
```

### 外部数据源

```
GET    /api/quadrant/bangumi/search?keyword=   搜索Bangumi条目
GET    /api/quadrant/bangumi/subject/:id       获取条目详情+tags
```

### 房间

```
POST   /api/quadrant/rooms                    创建房间
GET    /api/quadrant/rooms                    公开房间列表
POST   /api/quadrant/rooms/join               加入房间 (邀请码)
GET    /api/quadrant/rooms/:id                房间详情
DELETE /api/quadrant/rooms/:id                关闭房间
POST   /api/quadrant/rooms/:id/ready          准备/取消准备
POST   /api/quadrant/rooms/:id/start          开始游戏 (房主)
```

### WebSocket

```
GET    /ws/quadrant/rooms/:id?token=           游戏WebSocket连接
```

---

## WebSocket 消息协议

### 客户端 → 服务器

```json
// 玩家猜测
{"type": "guess", "data": {"x_label": "科幻", "y_label": "恋爱"}}

// 裁判: 揭示下一部
{"type": "judge_reveal_next"}

// 裁判: 揭示指定条目
{"type": "judge_reveal", "data": {"item_index": 3}}

// 裁判: 暂停/继续
{"type": "judge_pause"}
{"type": "judge_resume"}

// 裁判: 给提示 (划掉干扰标签)
{"type": "judge_eliminate", "data": {"label": "机战"}}

// 裁判: 自定义文字提示
{"type": "judge_hint", "data": {"text": "X轴和太空有关"}}

// 裁判: 结束本局
{"type": "judge_end"}

// 裁判: 提交题目 (preparing阶段)
{"type": "judge_submit_question", "data": {
    "axis_x": "傲娇",
    "axis_y": "社恐",
    "candidates": ["傲娇","社恐","天然呆","腹黑","中二","病娇","元气","毒舌"],
    "items": [
        {"title": "远坂凛", "image_url": "...", "x": 0.9, "y": -0.7},
        {"title": "长门有希", "image_url": "...", "x": -0.8, "y": 0.85}
    ]
}}
```

### 服务器 → 客户端

```json
// 游戏开始 (发给所有人)
{"type": "game_start", "data": {
    "candidates": ["科幻","恋爱","悬疑","热血","日常","机战","百合","治愈"],
    "item_count": 8,
    "round": 1,
    "total_rounds": 3
}}

// 条目揭示
{"type": "item_revealed", "data": {
    "index": 0,
    "title": "Steins;Gate",
    "image_url": "https://...",
    "x": 0.85,
    "y": 0.23,
    "revealed_count": 1,
    "total_count": 8
}}

// 猜测结果 (仅发给猜测者)
{"type": "guess_result", "data": {
    "correct": false,
    "score": -20,
    "cooldown_until": 3
}}

// 有人猜对了 (广播)
{"type": "player_correct", "data": {
    "user_id": 42,
    "username": "aryuu",
    "score": 70,
    "revealed_count": 4
}}

// 提示
{"type": "hint", "data": {"hint_type": "eliminate", "label": "机战"}}
{"type": "hint", "data": {"hint_type": "text", "text": "X轴和太空有关"}}

// 暂停/继续
{"type": "game_paused"}
{"type": "game_resumed"}

// 本题结束
{"type": "round_end", "data": {
    "axis_x": "科幻",
    "axis_y": "恋爱",
    "rankings": [
        {"user_id": 42, "username": "aryuu", "score": 70, "revealed_at": 4},
        {"user_id": 7, "username": "test", "score": 50, "revealed_at": 6}
    ],
    "all_placements": [...]
}}

// 全部结束 (多题连续模式最后)
{"type": "game_over", "data": {
    "final_rankings": [...]
}}

// 玩家加入/离开
{"type": "player_joined", "data": {"user_id": 42, "username": "aryuu", "role": "player"}}
{"type": "player_left", "data": {"user_id": 42}}
```

---

## 游戏流程状态机

```
                    ┌───────────────────────┐
                    │       waiting         │
                    │   等待玩家加入/准备     │
                    └───────────┬───────────┘
                                │ 房主点"开始"
                    ┌───────────▼───────────┐
          有题库 ──→│    loading_question    │←── 裁判提交题目
                    │   加载/生成题目         │
                    └───────────┬───────────┘
                                │
            ┌───── 裁判模式 ────┤──── 有题库 ─────┐
            ▼                   │                 ▼
  ┌─────────────────┐          │      ┌────────────────────┐
  │   preparing     │          │      │  直接进入 playing   │
  │  裁判出题界面   │          │      └────────────────────┘
  └────────┬────────┘          │
           │ 裁判提交           │
           ▼                   ▼
  ┌─────────────────────────────────────┐
  │              playing                 │
  │                                     │
  │  循环:                               │
  │    揭示条目 → 开放猜测窗口 →          │
  │    等待(定时/裁判) → 下一条目         │
  │                                     │
  │  结束条件:                            │
  │    - 所有人猜对                       │
  │    - 所有条目揭示完毕                  │
  │    - 裁判手动结束                     │
  └──────────────────┬──────────────────┘
                     │
          ┌──────────▼──────────┐
          │     round_end       │
          │   本题结算/展示答案   │
          └──────────┬──────────┘
                     │
          还有下一题? ├─── 是 → 回到 loading_question
                     │
                     └─── 否
                     │
          ┌──────────▼──────────┐
          │      ended          │
          │   最终排名/再来一局   │
          └─────────────────────┘
```

---

## 计分规则

```
当前可得分 = base_score - (已揭示条目数 × decay_per_reveal)
猜对: +当前可得分
猜错: -wrong_penalty, 进入 cooldown_rounds 轮冷却
猜对但XY轴反了: 按猜对处理 (XY轴无序, 猜对组合即可)

示例 (默认配置 base=100, decay=10, penalty=20, cooldown=1):
  第1部揭示后猜对: +90分
  第2部揭示后猜对: +80分
  第5部揭示后猜对: +50分
  猜错: -20分, 跳过下一轮不能猜
```

---

## 归属度策略

### 策略接口

```go
type ScoreStrategy interface {
    // 批量计算条目在指定标签上的归属度
    CalcScores(items []Item, label Label) (map[int64]float64, error)
}
```

### Bangumi 策略

```go
// 用 tag.count 归一化
// 1. 获取每个条目在该label上的 count
// 2. 在本题所有条目中 min-max 归一化到 [0, 1]
// 3. 映射到 [-1, 1]: val*2 - 1
```

### AI 策略 (MiMo)

```go
// 调用 MiMo API
// Prompt: 评估「{item.Title}」在「{label.Name}」维度的归属度 (-5到5)
// 结果 / 5.0 → [-1, 1]
// 缓存到 q_tag_scores 表
```

### Manual 策略

不走策略接口，裁判直接提交坐标。

---

## 出题引擎 (自动模式)

```go
func (e *Engine) GenerateQuestion(bank *QuestionBank) (*Question, error) {
    items := e.store.ListItems(bank.ID)
    labels := e.store.ListLabels(bank.ID)
    
    // 遍历标签两两组合
    for _, combo := range combinations(labels, 2) {
        axisX, axisY := combo[0], combo[1]
        
        // 计算所有条目坐标
        xScores, _ := e.strategy.CalcScores(items, axisX)
        yScores, _ := e.strategy.CalcScores(items, axisY)
        
        placements := buildPlacements(items, xScores, yScores)
        
        // 质量检查
        if !e.qualityCheck(placements, labels, axisX, axisY) {
            continue
        }
        
        // 选候选标签池 (含答案 + 干扰)
        candidates := e.selectCandidates(labels, axisX, axisY)
        
        return buildQuestion(axisX, axisY, candidates, placements), nil
    }
    return nil, ErrNoValidQuestion
}
```

### 质量检查

```go
func (e *Engine) qualityCheck(placements []Placement, ...) bool {
    // 1. 四象限覆盖 ≥ 3
    // 2. X轴方差 ≥ 0.3
    // 3. Y轴方差 ≥ 0.3
    // 4. 存在有效干扰标签
}
```

---

## 裁判控制

### preparing 阶段 (裁判出题)

裁判进入出题界面:
1. 输入/选择标签 → 选定 X轴 + Y轴 + 干扰标签
2. 添加条目 (手动输入 / 搜索Bangumi / 从题库导入)
3. 拖拽条目到坐标位置
4. 提交 → 通过 WebSocket 发送 `judge_submit_question`
5. 服务器验证后进入 playing 状态

### playing 阶段 (裁判操作)

| 操作 | 消息 | 效果 |
|------|------|------|
| 揭示下一部 | `judge_reveal_next` | 按 reveal_order 揭示 |
| 揭示指定 | `judge_reveal` | 跳过顺序揭示指定条目 |
| 暂停 | `judge_pause` | 冻结计时 |
| 继续 | `judge_resume` | 恢复 |
| 划掉干扰标签 | `judge_eliminate` | 广播给所有玩家,缩小范围 |
| 文字提示 | `judge_hint` | 广播自定义提示 |
| 结束 | `judge_end` | 强制揭晓答案,进入结算 |

### 自动模式

自动模式下无裁判,用定时器替代:
```go
// 每 reveal_interval 秒自动执行一次 reveal_next
ticker := time.NewTicker(time.Duration(room.RevealInterval) * time.Second)
```

---

## 房间流程

### 创建房间

```
POST /api/quadrant/rooms
{
    "name": "科幻大乱斗",
    "bank_id": 5,           // 0 = 裁判现场出题
    "visibility": "private",
    "max_players": 8,
    "rounds_total": 3,
    "candidate_count": 8,
    "reveal_interval": 10,  // 0 = 裁判手动
    "guess_window": 0,
    "base_score": 100,
    "decay_per_reveal": 10,
    "wrong_penalty": 20,
    "cooldown_rounds": 1
}
```

逻辑:
- `bank_id > 0` + `reveal_interval > 0` → 自动出题+自动揭示
- `bank_id > 0` + `reveal_interval = 0` → 自动出题+房主手动揭示
- `bank_id = 0` → 裁判模式,创建者自动成为裁判

### 加入房间

```
POST /api/quadrant/rooms/join
{"code": "ABC123"}

可选 role: "player" | "spectator"
```

### 准备 & 开始

- 所有玩家 ready → 房主可点"开始"
- 裁判模式: 开始后进入 preparing,等裁判提交题目
- 题库模式: 开始后直接 loading → playing

---

## 前端入口

HomePage.tsx 中新增一个区块:

```tsx
{/* 快闪游戏入口 */}
<div className="...">
    <span className="badge">内测中</span>
    <h3>猜象限</h3>
    <p>从标签和位置推理真相</p>
    <button onClick={() => navigate('/quadrant')}>进入</button>
</div>
```

---

## 第一期 MVP 范围

1. ✅ 裁判模式完整流程 (验证玩法核心)
2. ✅ 手动建题库 + 手动定坐标
3. ✅ 房间创建/加入/游戏/结算
4. ✅ 前端游戏界面 (坐标系+揭示动画+猜测交互)
5. ⏳ Bangumi 导入条目 (有handler基础)
6. ⏳ AI打分
7. ⏳ 自动出题引擎

先做 1-4 把游戏跑起来，验证好不好玩，再加自动化。

---

## 配置常量

```go
const (
    DefaultMaxPlayers     = 8
    DefaultCandidateCount = 8
    DefaultRevealInterval = 10 // seconds
    DefaultBaseScore      = 100
    DefaultDecay          = 10
    DefaultPenalty        = 20
    DefaultCooldown       = 1
    MinCandidateCount     = 4
    MaxCandidateCount     = 12
    MinWorkCount          = 4
    MaxWorkCount          = 20
    MinQualityVariance    = 0.3
    MinQuadrantCover      = 3
)
```
