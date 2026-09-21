# 04 · 成就与战绩（解锁体系、结算联动、统计与排行）

## 能力概览

本篇含两层：**成就**（事件驱动的持久化解锁体系）与**战绩**（统计/历史/排行——与成就
共用同一 CTE 口径，单一来源）。成就：32 项分 7 类，定义 100% 在后端代码注册表（前端
零定义维护），解锁由对局结算与内容写操作两类钩子触发，`user_achievements` 表持久化
进度与解锁时刻。核心决策：**历史战绩零回填、从零累计**（Owner 拍板丢弃现状数据）；
夜猫成就按**北京时间**（UTC+8 固定区）判定。解锁通过 WS 逐人推送 + 查询 diff 双通道
送达**右下角金箔弹层**（仪式层，与顶部 Toast 操作反馈隔离），结算页另设本局成就区块；
个人页有 7 类分节的成就网格与最近对局。战绩层：个人聚合统计、历史对局流水、全站三榜
排行（首页 TOP10），全部口径统一（ROW_NUMBER 名次、排除练习局、judge 剔除裁判、
duel 席位计入）。全部评估 best-effort——失败仅记日志，绝不阻塞结算主流程。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 32 项定义注册表 | 7 类：参与 4 / 胜利 5 / 技巧 6 / 模式专精 6 / 内容 5 / 社交 3 / 趣味 3；Target>0 累计型、<=0 事件型；3 项隐藏（一击必杀/完胜/夜猫）。`GET /api/me/achievements` 原样下发 title/description/icon/category/target | `backend/achievement/registry.go` |
| 2 | 持久化表（迁移 v5） | `user_achievements(user_id, achievement_key, progress, unlocked_at, PK(user_id,key))`；配套 `rooms.ended_at`（`UpdateStatus('end')` 自动落，连胜/夜猫等跨局维度依赖） | `store/db.go`（migrate）；`store/room_store.go:UpdateStatus` |
| 3 | 事件驱动累计 | `Increment`：单事务读改写 progress，**首次**越过 target 才解锁（`!alreadyUnlocked && progress>=target`）；重复事件只涨进度，永不二次解锁 | `store/achievement_store.go:Increment` |
| 4 | 事件型直接解锁 | `Unlock`：冲突分支 `WHERE unlocked_at IS NULL` 使重复触发 RowsAffected=0——幂等只解锁一次（三冠王/三连胜/忠诚） | `store/achievement_store.go:Unlock` |
| 5 | auto/judge 结算钩子 | `broadcastGameOver` 构建快照（名次/扣分/missed 回合/末牌赢家/完美局判定/裁判 id/参赛数）→ `OnGameEnd`；练习局整体不计 | `ws/game_session.go:broadcastGameOver`；`achievement/evaluator.go:OnGameEnd` |
| 6 | duel 结算钩子 | `endGame` 落分（胜者 +1）+ 补末牌 `game_records` 流水 + firstBlood（抢中对方区域牌）追踪 → `OnDuelEnd`；平局不发胜负类成就 | `ws/duel_session.go:endGame`；`evaluator.go:OnDuelEnd` |
| 7 | 内容/社交钩子 | 建卡（造牌者/量产家）、加音频（组曲师，**按单卡音频数**特判）、建牌组（收藏家）、分享牌组（分享家）、建房（常主）、邀请码被用（招募者，解锁归属**邀请人**） | `handler/card.go`、`deck.go`、`room.go`、`auth.go:Register`；`evaluator.go:OnContentEvent/OnAudioAdded` |
| 8 | 跨局状态查询 | 三连胜：最近 3 局（`ended_at` 倒序）全部 rank=1 的窗口 SQL；忠诚：同牌组完赛数最大值（含历史局——忠诚度度量而非事件计数） | `store/achievement_store.go:WinStreakTop3/MaxSameDeckGames` |
| 9 | 统计口径（前置修复） | `GetUserStats`：ROW_NUMBER 唯一名次（原 RANK() 在 0 分平局灌水第一）、排除 training、judge 模式剔除裁判、**`role IN ('player','duel_p1','duel_p2')`**（duel 席位原被整体漏计，第二轮回顾修复）；连胜 CTE 同口径 | `store/room_store.go:GetUserStats`；`achievement_store.go:WinStreakTop3` |
| 10 | 北京时间判定 | 夜猫：`time.FixedZone("CST", 8*3600)` 的 0–4 点完赛，与服务器时区无关（Owner 决策） | `evaluator.go`（beijing 常量） |
| 11 | WS 解锁推送 | 结算后逐人 `SendJSONToUser("achievement_unlocked", {achievements:[...]})`，在 `game_over` 广播后、`hub.Stop()` 缓冲期内发送，客户端必达 | `game_session.go` / `duel_session.go` 结算尾段；`api/ws-events.ts`（第 39 个事件） |
| 12 | 弹层数据双通道 | WS 推送直入 + 路程切换拉全量 diff（内容型解锁）；**双通道互查重**（基线集合，防同一解锁双弹——第二轮回顾修复的竞态）；首拉只建基线，登录不弹历史 | `features/achievements/useAchievementCenter.ts`、`unlockBus.ts` |
| 13 | 右下角解锁弹层 | 金箔卡片（gold-foil 描边+光晕）、右侧滑入、每张 5s、同屏 2 张叠卡、点击跳个人页；`lazy()` 隔离 framer（不进主包，实测主包仅 +1.1KB） | `features/achievements/AchievementPopup.tsx`；`components/AppLayout.tsx` 挂载 |
| 14 | 个人页成就网格 | 7 类分节；已解锁=着色+解锁日期；未解锁=灰阶+累计进度条 `37/100`；隐藏型=「？？？」谜语；0 局用户也可见内容类成就（独立于对局统计三态渲染） | `pages/ProfilePage.tsx:AchievementsSection` |
| 15 | REST API | `GET /api/me/achievements`：注册表全量 × 用户侧状态（progress/unlocked_at），内部计数键（`_win_*`）按注册表过滤不外泄 | `handler/auth.go:MyAchievements`；`cmd/server/main.go` 路由 |
| 16 | 结算页成就展示（2026-09-21 增补） | GameOver/DuelGameOver 挂载期订阅 unlockBus 收集本局推送的新解锁，金箔区块集中展示——弹层=即时仪式、结算=回顾仪式，双通道互补 | `components/GameOver.tsx`、`DuelGameOver.tsx` |
| 17 | 个人聚合统计（战绩层） | 个人页 StatCard：总局/前三/第一/总分/最高分/前三率/世一网次数；CTE 口径与成就评估**单一来源**（ROW_NUMBER 唯一名次、排除 training、judge 剔除裁判、`role IN (player,duel_p1,duel_p2)`） | `store/room_store.go:GetUserStats` |
| 18 | 历史对局（战绩层） | `GET /api/me/games?page&size(≤50)`：每局 mode/牌组名/名次/分数/人数/ended_at（旧局回退 created_at）；个人页「最近对局」区块（前 10） | `store/room_store.go:UserGames`；`pages/ProfilePage.tsx:RecentGamesSection` |
| 19 | 全站排行榜（战绩层） | `GET /api/rankings?kind=score\|wins\|world_first&limit(≤50)`：三榜同口径聚合（world_first 经 JOIN rooms 排除 training）；首页底部三 tab TOP10，前三金银着色 | `store/room_store.go:Rankings`；`pages/HomePage.tsx` |
| 20 | duel 战绩落库 | duel 结算胜者 score=1 + 末牌 `game_records` 流水（is_last 归胜者）——duel 从统计黑洞变一等公民，世一网/排行/连胜/成就全部覆盖 duel | `ws/duel_session.go:endGame` |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 历史零回填 | 成就从落地时刻起算，旧战绩不产生任何进度（Owner 明确丢弃现状数据）；首拉基线静默吞掉既有解锁 | 既定决策 |
| 2 | once 房间的 sweep/perfect 不可达 | once 模式剔除的未读回合计入 MissedRounds——judge_sweep/一击必杀在 once 房几乎无法达成（once 仅 duel 强制或自选，judge 房罕见） | 接受，代码已注释 |
| 3 | 同分边缘名次错位 | 展示名次（稳定排序）与 SQL 名次（user_id 决胜）在分数完全并列时可能差一位；只影响同分场景 | 记录不修 |
| 4 | 离线错过弹层 | 断线期间解锁照常落库，但下次登录基线建立后不再弹（记录不丢、仪式可丢）；个人页可见 | 设计取舍 |
| 5 | 游客无网格入口 | 游客在房间页有 AppLayout → 弹层正常；Profile 页被 RequireMember 拦截 → 网格对游客不可达 | 与「游客成就仅弹层可见」一致 |
| 6 | 邀请人成就静默解锁 | 邀请码被用时邀请人通常离线，解锁不推送，下次路由切换 diff 弹出 | 设计取舍 |
| 7 | 评估器 best-effort | 任何评估失败仅 slog，进度丢失该次事件——结算可用性优先于成就完整性 | 既定原则 |
| 8 | 弹层与聊天 FAB 同区 | 对局中解锁仅在结算时刻到达（战场 UI 已切换），内容型不在战场触发——实测无互撞场景 | 记录 |
| 9 | 战绩口径修复记录 | duel 曾整体漏计（席位 role 不在过滤集）；RANK() 平局全员第一灌水胜场；training 局混入；裁判拉低场均；world_first 榜曾漏 training 过滤——五项均已修复并回归钉死 | 已修复 |
| 10 | 排行榜无时间窗 | 现为全站历史累计榜（总分/胜场/世一网）；周榜/月榜需 ended_at 窗口聚合 | 候选待拍板 |
| 11 | 排行榜含游客 | 游客昵称本就对局公开，同榜展示；转正后身份连续 | 设计现状 |
| 12 | 历史无详情下钻 | 最近对局为摘要行（无单局回放/逐牌流水页）；game_records 数据在，回放是大功能 | 候选 |

## 验证记录（2026-09-21，两轮回顾后）

**后端（`go test ./...` 13 包全绿，`achievement` 包 8 条回归）**
- `TestGameEndUnlocksOnce`：首胜一次性解锁参与/胜利/技巧；第二局同结果不再解锁同键、进度正确累计 ✓
- `TestCumulativeThresholds`：手残王单局达标即时；铁壁之手第 10 次达标 ✓
- `TestTrainingIgnored`：练习局零解锁零进度 ✓
- `TestDuelEndSemantics`：胜者 duel_win_1/世一网/完胜、一骑讨独立计、败者 comeback ✓
- `TestContentEvents`：造牌者即时、量产家第 50 张达标 ✓
- `TestRegistryShape`：32 项、key 唯一、隐藏恰 3 项 ✓
- `TestWinStreakTop3`：三局第一即时解锁 ✓
- `TestDuelRolesCountedInStatsAndStreak`（第二轮回顾）：duel 席位计入统计（total/first=3）且不打断连胜 ✓

**战绩层（2026-09-21 增补）**：`GET /api/me/games`、`GET /api/rankings`（三榜同口径，world_first JOIN rooms 排除 training）端点接线；`TestDuelRolesCountedInStatsAndStreak` 同时覆盖 duel 计入统计与连胜不断。

**前端**：`tsc --noEmit` 零错误 · vitest 81/81 · `npm run build` 绿；主包 339.9KB（弹层独立 chunk，framer 0 进主包，产物 grep 验证）。

**回顾轮修复记录**：①弹层双弹竞态（WS/diff 互查重）②duel role 口径漏计（统计+连胜 CTE）③duel 快照 loser 方向反转（落地时即时修正）④world_first 榜/统计漏 training 过滤——四项均补回归。

**诚实边界**：浏览器级弹层视觉验收（真实打一局看右下角弹出）未做 Playwright 实测；弹层样式参数（金色浓度/5s 时长/滑入曲线）单文件可调；历史对局/排行榜渲染同为代码级验证。
