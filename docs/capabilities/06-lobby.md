# 06 · 大厅（战场大厅与房间等待厅）

## 能力概览

大厅是两层结构：**首页战场大厅**（PlayHub，`HomePage`）负责「发现与进入」——
双 CTA 开局、邀请码加入、活跃战场列表（8 秒可见性轮询）；**房间等待大厅**
（`RoomWaitingView` + `WaitingLobby`）负责「开局前集结」——邀请码分发、duel
席位、玩家管理、资源预加载、房主开局。列表无隐私过滤（全部房间公开，LIMIT 50，
waiting/reading/paused 三态）；加入语义由后端状态决定：waiting→玩家，其余→旁观。
开局走 CAS（waiting→reading）防并发，UI 由 WS `room_state` 权威驱动切换。
管理员在大厅的能力是**强制收束**（force-end）：2026-09-21 修复其不终止对局
会话的生命周期缝隙——强停/解散/空房回收现在会同步 `Stop()` 会话 goroutine，
杜绝无人房间继续写流水、发成就。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 活跃战场列表 | `ListActive`：waiting/reading/paused，created_at DESC，LIMIT 50，**无隐私过滤**；前端 8s 可见性感知轮询（后台标签自动停、失败保留旧数据 + 顶部提示、手动刷新按钮） | `store/room_store.go:ListActive`；`api/queries.ts:useRoomList`；`pages/HomePage.tsx` |
| 2 | 双主 CTA | 快速开局（PresetPicker：四预设 +「上次配置」行 + 牌组锁定）/ 自定义建房 → `/rooms/new`；预设直建成功写 lastConfig 并跳新房，失败 toast 保留弹层 | `HomePage.tsx`；`features/play/PresetPicker.tsx` |
| 3 | 邀请码加入 | 逐字符大写、**满 6 位自动提交**（`joining` 守卫防重）、失败保留输入；`POST /api/rooms/join` → 跳房间页 | `HomePage.tsx:doJoin/handleJoinCodeChange` |
| 4 | 加入语义 | 后端按房间状态定身份：waiting→`role=player`，reading/paused→`spectator`；end/aborted→`409 ROOM_ENDED`；码不存在→`404`；INSERT OR IGNORE（重复加入幂等，无人数上限） | `handler/room.go:JoinRoom` |
| 5 | 加入错误本地化 | 按错误码中文提示：`ROOM_ENDED`→「这个战场已结束」、`NOT_FOUND`→「房间不存在，请检查邀请码」、兜底「加入失败，请检查邀请码」（2026-09-21 修复：原透传后端英文 message） | `HomePage.tsx:doJoin` |
| 6 | 列表行 CTA 语义 | 只看状态：waiting→「加入 →」（玩家），其余→「旁观 →」；training 仅保留警示配色不影响文案（2026-09-21 修复：training+waiting 曾误标「旁观」实际加入为玩家） | `HomePage.tsx` 活跃战场行尾 |
| 7 | 列表三态 | 加载=行骨架屏；空态带 CTA「开辟第一个 →」；轮询失败保留旧数据并置顶细提示 | `HomePage.tsx` |
| 8 | 等待大厅邀请区 | InvitePanel 大字房间码 + 复制链接/复制码 + 系统分享；rematch 落地携带 `focusInvite` state → 码自动高亮 | `WaitingLobby.tsx`；`features/play/InvitePanel.tsx` |
| 9 | duel 席位 | 双席卡片：空席「入座」（后端条件 UPDATE **原子占座**，冲突 `409 SEAT_TAKEN`）、己席「离开」、房主可「踢下席」；双席未满时开局按钮禁用 | `WaitingLobby.tsx`；`handler/room.go:ClaimSeat/LeaveSeat/KickFromSeat`；`store/room_store.go:ClaimSeat` |
| 10 | 玩家列表与踢人 | 房主 👑 / 旁观 👁 标记 / 我方行金色高亮；房主可踢任意非本人成员（后端校验 host）；WS 广播成员变动 | `WaitingLobby.tsx`；`handler/room.go:KickPlayer` |
| 11 | 旁观切换 | 任意时刻可切旁观↔玩家（Owner 裁定 2026-09-21：**中途下场是合法玩法**，waiting-only 限制已撤）；duel 走席位制不适用；training 局外人只能旁观（前端隐藏入口）；战场 StatusStrip 亦提供「加入战斗」（下一首起生效） | `handler/room.go:SetSpectate`；`RoomBattleView.tsx`（回归 `TestSetSpectateAllowedMidGame`） |
| 12 | 资源预加载 | 大厅期预取牌组封面全量 + 前 3 首音频，进度条实时展示（`loaded/total` + 完成态 ✓） | `features/room/useAudioPreload.ts`；`WaitingLobby.tsx` |
| 13 | 房主开局 | 点击先解锁 AudioContext（Safari 自动播放策略）→ `POST /start`（后端 **CAS waiting→reading** 防并发双开，失败回滚）→ UI 不直接切，等 WS `room_state` 权威驱动；duel 需双席满 | `WaitingLobby.tsx:handleStart`；`handler/room.go:StartRoom`；`store/room_store.go:TransitionStatus` |
| 14 | 空房回收 | 全员离线：waiting 10min / 对局中 30s 后自动关闭 hub；**2026-09-21 起同步 `Stop()` 对局会话**（原行为无人房间继续跑完整副牌写流水发成就） | `ws/hub.go`（unregister 空房分支 + stopCh 分支） |
| 15 | 管理员强制收束 | 列表行「结束」（仅 admin 渲染）→ 确认弹窗 → `force-end`：**先落库 status=end 再广播 `room_closed` + 断连**，审计 `room.force_end`（失败降级日志不回滚）→ 失效列表缓存 | `HomePage.tsx:handleForceEnd`；`handler/room.go:ForceEndRoom`；`ws/hub.go` |
| 16 | 对局会话生命周期 | hub 停止（强停/解散/空房回收）时先 `session.Stop()/duelSession.Stop()` 再断连清房；`Stop()` 幂等（select-default close），自然结算路径自调无害 | `ws/hub.go` Run stopCh 分支（2026-09-21 修复） |
| 17 | 私密房间（2026-09-21 v7 增补） | 建房可选私密：`rooms.is_private`，**列表隐藏**（`ListActive` 过滤）凭邀请码可进（加入语义不变）；rematch 复制私密标记；管理员列表**可见**私密房并带「私密」徽章（普通用户不可见） | `store/room_store.go:ListActive(viewerAdmin)`；`handler/room.go:ListRooms/CreateRoom`；`pages/NewRoomPage.tsx`、`HomePage.tsx` |
| 18 | 人数上限（2026-09-21 v7 增补） | `rooms.max_players`（2-32，默认 16）：waiting 以玩家身份加入且非在房成员时校验，满员 `409 ROOM_FULL`；旁观不限、重连不占名额；建房表单可配 | `handler/room.go:JoinRoom`；`NewRoomPage.tsx` |
| 19 | 建房配置·渐进披露（A 轮） | 表单两层：常用区（模式/间隔/模糊/惩罚，duel 换对阵参数）+ **高级设置折叠区**（打乱/多音频/最短播放/随机片段/测试/私密/人数上限，默认收起带「N 项已调」角标）；底部常驻**配置摘要条**（模式·间隔·惩罚·模糊·私密 chips，提交前零意外） | `pages/NewRoomPage.tsx` |
| 20 | 建房配置·我的预设（B 轮） | 任意配置可「保存为我的预设」（命名 ≤20 字，localStorage 上限 12 个）；PresetPicker 三层：上次配置 / ★我的预设（可删）/ 内置四预设 | `features/play/presets.ts`；`PresetPicker.tsx` |
| 21 | 建房配置·智能提示（C 轮） | 选中牌组后拉取详情画像：平均时长 → 间隔建议、多音频占比 → once/all 建议（`useDeckDetail` enabled 守卫按需拉取） | `NewRoomPage.tsx`；`api/queries.ts:useDeckDetail` |
| 22 | 建房提交对象参数化（D 轮） | `api.rooms.create(CreateRoomBody)` 对象直传——消除 17 位置参数串位风险；duel 七字段经 body.duel 下沉展开；回归测试改对象断言 | `api/client.ts`；`features/play/roomCreate.ts`（17→对象测试） |
| 23 | 参数有效性矩阵对齐（2026-09-21） | 全字段消费点实证后修正 duel 展示：**间隔滑条**（duel 用轮时长）与**惩罚规则块**（duel 用抢牌机会数）在 duel 下无效隐藏；multiAudioMode 在 duel 被服务端强制 once（前端本就隐藏）；shuffleRemaining 实证为纯前端动画参数（后端仅广播） | `pages/NewRoomPage.tsx`（矩阵见边界 #9） |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 列表完全公开 | ~~任何房间（含 training）对全站可见~~ **私密房已落地（2026-09-21）**：建房可选私密、列表隐藏凭码可进；管理员可见并带徽章 | 已解决（见能力 #17） |
| 2 | judge/auto 可 1 人开局 | 开局门槛只查 duel 双席——judge 房 0 真实玩家可开（裁判试音边缘用法）；加最低人数限制会误伤，判定记录不修 | 记录不修 |
| 3 | 列表行点击无 joining 防抖 | 快速双击两行发两次 join，无害（均幂等，导航一次） | 记录不修 |
| 4 | 无人数上限 | ~~JoinRoom `INSERT OR IGNORE` 无房间人数上限~~ **已落地人数上限（2026-09-21）**：默认 16、2-32 可配，满员 409 ROOM_FULL | 已解决（见能力 #18） |
| 5 | 强停会话终止无专项单测 | 需完整 hub+session fixture；既有 9 件 E2E 协议资产覆盖自然结算路径。建议测试环境实测：开局中 force-end，确认日志无该房间回合推进 | 诚实边界 |
| 6 | isSpectator 本地态 | 等待大厅旁观按钮文案由本地 state 驱动，与 WS 权威 role 在极端时序下可能瞬时不同步（下一事件即收敛） | 记录不修 |
| 7 | 我的预设存本机 | localStorage（上限 12），换设备/清存储即失；落库跨设备为候选 | 候选 |
| 8 | 高级区收起时仍生效 | 折叠只是视觉收纳，配置值始终提交；摘要条保证提交前可见 | 设计现状 |
| 9 | 参数有效性矩阵（实证） | duel 无效项：intervalSec/penaltyWrong/penaltySlow/penaltyLast/minPlayTime（前端已全部隐藏）；multiAudioMode duel 下被强制 once；shuffleRemaining 为纯前端动画参数（后端仅透传广播）。**按模式隐藏而非删参数**——auto/judge 全参数有效无缺口 | 已对齐 |
| 10 | isPrivate 与 training 合并 | Owner 裁定两者语义重复：auto/judge 下**测试局开关自动联动私密**（开测试=不进大厅），撤独立私密开关；duel 无测试局概念保留独立私密开关；后端字段与 API 能力不变（rematch/管理员徽章/列表过滤照旧） | 已落地 |

## 验证记录（2026-09-21）

**本轮修复验证**：training CTA 文案与 join 错误本地化（前端 tsc 零错误 · vitest 81/81 · build 绿）；会话生命周期修复（`go build` + `vet` 干净 · `go test ./...` 13 包全绿，既有 ws/handler/achievement 测试无回归——自然结算与 rematch 路径不受 `Stop()` 幂等影响）。

**同场景管理员路径复核**：强停无 hub 的 waiting 房（跳过广播直接落库+审计）✓；end 房不入列表防误触 ✓；禁用玩家踢 WS 即时生效、room_players 行保留灰显 ✓；先落库再断连顺序 ✓；非房主 admin 可强停 ✓。

**诚实边界**：大厅浏览器级实测（真实双端入座/开局/强停时序）未做本轮验证；强停终止会话建议以测试环境日志实测收尾（边界 #5）。
