# 08 · 对局战场（三模式回合引擎与结算动线）

## 能力概览

战场是开局后的对局全生命周期，核心架构为**服务端权威**：每房间一个 `RoomHub`
（goroutine 事件循环），每局一个 `GameSession`（auto/judge）或 `DuelSession`（duel）
独立 goroutine，**内存即对局真相**——DB 只落流水（`game_records`/分数），重连经
`LiveBoard` 权威投影恢复（杜绝"已抢牌复活"类反推缺陷）。回合推进由 **B1 服务端
权威时钟**驱动（`ends_at = 音频开始 + 实测时长 + settle 缓冲`，到期自动切首），
客户端 `audio_ended` 降级为日志；抢牌带 `cmd_id` 幂等防重试双扣分。三种模式共用
一套 WS 协议（39 事件，`api/ws-events.ts` 为前端权威类型）+ 各自的回合语义：
auto（自动轮播抢牌）、judge（房主裁判选牌）、duel（1v1 编排+区域争夺）。前端为
`roomReducer`（纯函数 27 action）+ `useRoomGame`（副作用编排）分层，RoomPage 仅
99 行组装。结算为仪式层：称号/牌面回顾/本局成就 + rematch ≤2 taps 原班再来。

## 能力清单

### A. 通用对局骨架

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 开局 CAS | `TransitionStatus(waiting→reading)` 条件更新防并发双开；CAS 赢后生成 `mask_seed`（失败回滚状态）→ `hub.StartGame/StartDuelGame` 起会话 goroutine | `handler/room.go:StartRoom`；`store/room_store.go:TransitionStatus` |
| 2 | 开场倒计时 | countdown 3-2-1-0 广播后进入回合循环 | `ws/game_session.go:runAutoMode` |
| 3 | 权威棋盘投影 | `SnapshotBoard()`（剩余次数 + 已出结果牌含 hint）经 `hub.LiveBoard()` 供 REST 快照；无 session（重启等）回退 DB 流水 | `game_session.go:SnapshotBoard`；`handler/room.go:GetRoom` |
| 4 | 重连语义 | 新连接由 hub 推 `room_state`（或 duel_state + 编排态）；终态房间（end/aborted）拒绝接入（410）；成员门 403（不自动旁观加入） | `ws/hub.go`；`handler/ws.go:ServeWS` |
| 5 | 暂停/恢复 | `pauseCh/resumeCh` 驱动；暂停期间 `roundEndsAt += pausedDuration` 顺延补偿（同时修复了旧实现"暂停重置全时长"缺陷）；前端倒计时同步冻结 | `game_session.go:waitInterval/waitAudioOnly` |
| 6 | 权威回合时钟 | `ends_at = playStart + duration_sec + settle`（末首 tail=2s）；`card_start` 携带 `start_at/ends_at/server_now` 供客户端对表；时长未知（旧数据）回退 maxWait（interval×10，下限 60s） | `game_session.go:runAutoMode` |
| 7 | 抢牌幂等 | `cmd_id` 单调递增，`(user_id)` 维度记录 lastCmdID，重放静默忽略；cmd_id=0 视为旧客户端直接处理 | `game_session.go:HandleGrab` |
| 8 | 缓冲失败上报 | 客户端 `media_event(buffer_fail)` → 服务端提前切首防全场卡死 | `ws/client.go` readPump |
| 9 | 慢客户端策略 | 广播 `select default` 非阻塞——写不动的客户端丢消息不拖垮 hub | `ws/hub.go:Broadcast` |

### B. auto 模式（自动轮播抢牌）

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 10 | 回合展开 | `expandToPlayItems`：多音频牌**逐首音频为一回合**；非 judge 全局 shuffle，Index 稳定编号 | `game_session.go:expandToPlayItems/newGameSession` |
| 11 | 抢牌判分 | 抢中：`roundResults[idx]=uid`、分数+1、广播 card_claimed；抢错（not_current）：wrongUsers 禁赛本回合 + 按配置罚分；抢慢（already_grabbed）：罚分；`checkAllBanned` 全员被禁时提前切首 | `game_session.go:HandleGrab` |
| 12 | 多音频 once 模式 | 抢中即耗尽该牌（remaining=0）并**从未来队列剔除同牌音频**（roundResults 按 Index 键控不受影响） | `game_session.go:HandleGrab` |
| 13 | 无人抢处理 | `card_missed` + 耗尽广播 + `game_records` winner=NULL 流水 | `game_session.go:runAutoMode` |
| 14 | 随机起点 | `start_ratio` 由 `mask_seed^audioID^回合号` 确定性生成（服务端算，全端一致） | `game_session.go:runAutoMode` |
| 15 | 滚动预取 | `card_start.next_audio_urls`（后 2 首）供客户端滚动预取；等待大厅全量封面 + 前 3 音频 | `game_session.go:upcomingAudioURLs`；`features/room/useAudioPreload.ts` |
| 16 | 结算 | 分数插入排序排名 → `game_over`（results 含每人 grabbed_cards/penalty_count + last_card_winner_id）→ 成就评估推送 → 4s 后停 hub | `game_session.go:broadcastGameOver` |

### C. judge 模式（房主当裁判）

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 17 | 裁判选牌 | `judge_waiting` → 房主 `POST /play-card`（waiting 分支 CAS 起局 + 100ms 等 session 就绪）→ 广播 card_start；首回合窗口内重复选牌被拒（并发保护） | `handler/room.go:PlayCard`；`game_session.go:runJudgeMode` |
| 18 | 裁判禁抢 | judgeUserID 的 grab 一律 `grab_banned`；裁判不计入排名（broadcastGameOver 过滤 + 统计 CTE 剔除） | `game_session.go:HandleGrab/broadcastGameOver` |
| 19 | 裁判掉线 | WS 断开触发 `judge_offline`（60s 等待重连，超时结束） | `ws/hub.go`（unregister 分支）；`game_session.go:OnJudgeDisconnected` |
| 20 | 终局判定 | 每回合后检查：全部 playItem 有结果 **或** 剩余次数耗尽 → allPlayed → 结算 | `game_session.go:runJudgeMode` |

### D. duel 模式（1v1 对阵）

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 21 | 席位与开局 | 双席原子占座（`ClaimSeat` 单条条件 UPDATE，冲突 `409 SEAT_TAKEN`）；双席未满开局按钮禁用；选牌 shuffle 后对半分区 | `store/room_store.go:ClaimSeat`；`ws/duel_session.go:newDuelSession` |
| 22 | 编排阶段 | `duel_arrange_start` → 同区/跨区 swap（越界拒绝）→ 双方 ready 或超时 → `duel_arrange_done` 锁定布局 | `duel_session.go:HandleArrangeSwap/Ready/waitArrangeComplete` |
| 23 | 回合争夺 | queue 弹出（跳过已被抢的牌）→ `duel_card_start` → 每方 `grab_chances` 次机会；抢错消耗机会，双耗尽且无人中 → 按配置 requeue 入队尾 | `duel_session.go:runLoop/handleGrabResult` |
| 24 | 区域判定 | 抢中**己方区**牌：直接收编；抢中**对方区**牌：触发 `give_card`（30s 超时自动给第一张）——「一骑讨」成就的数据源 | `duel_session.go:handleGrabResult/waitForGive` |
| 25 | 超时与终局 | 回合超时 `duel_timeout`（requeue 可配）；`queue_empty`/某方 0 牌/`max_rounds` → endGame；轮时长下限钳制 30s（听歌需要时间） | `duel_session.go:runLoop` |
| 26 | duel 结算落分 | 胜者 `room_players.score=1` + 末牌 `game_records` 流水（is_last 归胜者）——duel 自此进入统计/排行/世一网/连胜口径 | `duel_session.go:endGame`（v7 前修复） |

### E. 前端战场编排

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 27 | 状态分层 | `roomReducer` 纯函数 27 action；三不变量：init 竞态守卫（WS 投影先落定则 REST 不覆盖）、displayOrder 稳定、暂停冻结倒计时 | `features/room/roomReducer.ts`（21 断言回归） |
| 28 | 副作用编排 | `useRoomGame`：WS 接线（一次性 ticket + 连接代际守卫防 StrictMode 双连接）、toast/音效/预取/定时器、myRoundStatus 推导 | `features/room/useRoomGame.ts` |
| 29 | 战场 UI 件 | StatusStrip 六态恒驻（可抢态唯一强提示）、ConnectionBanner（n/10 重连 + 恢复 2s 消失）、MobileScoreSheet、ControlMenu（duel FAB 上移避让）、ShuffleOverlay、DuelStatusBar | `features/room/*`（均有组件测试） |
| 30 | 中途下场（旁观↔玩家） | 任意时刻切换（Owner 裁定 2026-09-21：合法玩法，waiting-only 曾短暂收紧后撤回）；战场 StatusStrip「加入战斗」入口有效（非 duel 非 training 旁观者），下一首起生效；`joinBattle`/裁判选牌失败均补 toast（修静默） | `views/RoomBattleView.tsx`；`useRoomGame.ts:joinBattle`；`handler/room.go:SetSpectate` |
| 31 | 视图分发 | RoomPage 99 行组装：loading → 等待大厅 → 战场（三模式）→ 结算（双结算组件按 mode 分发） | `pages/RoomPage.tsx` |
| 32 | WS 客户端 | ticket 30 秒一次性路径绑定（JWT 不进 URL）；指数退避重连 10 次封顶；read limit 4KB；聊天/丢蛋共享 300ms 连接级限流 | `hooks/useRoomSocket.ts`；`security/ws_ticket.go`；`ws/client.go` |

### F. 结算动线

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 33 | 结算仪式 | 名次/称号（世一网/手残选手/苦命鸳鸯——结算层临时称号）、抢牌面回顾、本局成就金箔区块、樱花粒子 | `components/GameOver.tsx`、`DuelGameOver.tsx` |
| 34 | rematch | 结算页主 CTA ≤2 taps：`POST /rematch`（源房须 end）→ `RematchAndMigrate` 单事务（25 列配置复制 + 原班迁入 role=player/score=0，或仅房主）→ 导航新房，邀请面板自动高亮（focusInvite） | `handler/room.go:Rematch`；`store/room_store.go:RematchAndMigrate`；`features/play/useRematch.ts` |
| 35 | 换牌组再来 | 跳 `/rooms/new?deck_id=` 携带原配置语义入口 | `GameOver.tsx` |
| 36 | 对局会话生命周期 | hub 停止（强停/解散/空房回收）时同步 `session.Stop()`——无人房间不再跑完整副牌写脏流水发成就（2026-09-21 修复） | `ws/hub.go` Run stopCh 分支 |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | duel 平局无胜者 | winnerID=0 时无人得分、无人得胜场/成就（对局本身正常结束展示） | 设计现状 |
| 2 | 音频时长未知的等待 | 旧数据 duration_sec=0 时每回合 maxWait 兜底（60s+）——B1 之前的老牌组体验降级；可 ffmpeg 批量回填 | 遗留数据债 |
| 3 | once 模式的 sweep 不可达 | 剔除的未读回合计入 MissedRounds → judge_sweep/一击必杀在 once 房几乎无法达成（04 篇同记） | 接受 |
| 4 | debugEnd 仅前端 mock | 「跳到结算」本地构造结果，不落库不产生统计/成就——调试用途 | 设计现状 |
| 5 | 慢客户端丢消息 | 广播非阻塞策略的固有代价；重连经权威快照补偿 | 设计取舍 |
| 6 | 同分名次错位 | 结算展示序（稳定排序）与 SQL 名次（user_id 决胜）在同分时可能差一位（04 篇同记） | 记录不修 |
| 7 | duel 轮时长钳制 | `round_time < 30` 强制抬到 30（听歌需要时间）；前端表单若放开小值会被静默抬高 | 服务端规则 |
| 8 | 结算期聊天不可用 | hub 在结算后 3-4s 停止，结算页无聊天载体（05 篇同记，「结算即散场」） | 设计取舍 |
| 9 | give 超时自动给第一张 | 对方 30s 不选则系统代选己方首牌——不选择也是一种选择 | 产品语义 |

## 验证记录（截至 2026-09-21）

**E2E 九件套**（`frontend/e2e/`，协议级 + 浏览器 UI 双层）：
- 三模式协议：`game-protocol-verify`（auto 11 断言：countdown/card_start 权威时钟字段/抢牌判分/聊天广播）、`game-modes-verify`（judge 6 + duel 7 断言：裁判禁抢、席位、编排、己方区判定）
- duel 子分支：`duel-subbranches-verify`（抢错/机会耗尽/超时 requeue/requeue 闭环；give 首跑验证）
- 浏览器 UI：`browser-game-verify`（auto 全链含 claimed toast 计数=1 回归——双 WS 竞态修复钉死）、`duel-ui-verify`（九断言，含 FAB 遮挡修复实证）、`judge-ui-verify`（七断言 + 暂停全端同步）
- 韧性：`banner-reconnect-verify`（真实断线横幅 n/10 → 恢复消失）、`ws-kick-verify`（禁用踢 WS 四步）、`rematch-ui-verify`（自然结算 1s 快局七断言）

**单元/组件**：前端 vitest 81 条中 battle 相关约 40 条——roomReducer 15（竞态守卫三断言/myRoundStatus 全链/displayOrder）、roomCreate 10、StatusStrip 10、ConnectionBanner 7、MobileScoreSheet 7、PresetPicker 9；后端 `go test` 13 包（rematch 5 条 403/409/404/成功+25列继承/reinvite）。

**历史修复在战场层的沉淀**：WS 升级 Hijacker 透传（修复前全量 WS 500，仅真实协议可暴露）、双 WS 连接竞态（代际守卫）、duel FAB 吞点击、已抢牌复活竞态（LiveBoard + reducer 守卫双侧）、对局会话生命周期（强停终止 session）。

**诚实边界**：E2E 为开发机真实双端验证；生产网络环境（弱网重连、COS CDN 首播延迟）未实测；duel give 分支复跑存在脚本层抖动（分支本身有首跑验证记录）。
