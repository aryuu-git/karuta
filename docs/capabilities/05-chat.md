# 05 · 聊天（房间内即时沟通与丢蛋）

## 能力概览

聊天是**房间会话的一部分，不是全局社交浮窗**：只在房间页 `/rooms/:id` 存在
（等待大厅与对局战场两个视图），结算页随战场 UI 一起卸载——「房间即世界」。
消息经 WS 广播、身份取自连接（客户端不可伪造），**纯内存无持久化**：换房/刷新
即清空。附属玩法「丢鸡蛋」走同一通道，插入聊天流系统消息 + 全屏 2.5s 打蛋动画。
安全基线（2026-09-21）：单条 100 rune 上限、连接级 300ms 限流（聊天与丢蛋共享）。
旁观者可发言（UI 明示）；被禁用账号随 WS 踢线同步失去发言能力。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 出现时机 | 仅房间页：等待大厅（RoomWaitingView）与对局战场（RoomBattleView）右下角 FAB 常驻；结算页/其余页面不渲染；游客与正式用户同等可用 | `views/RoomWaitingView.tsx`、`views/RoomBattleView.tsx` |
| 2 | FAB 定位避让 | 默认 `bottom-4 right-4`；duel 模式上移 `bottom-16`（修⑪：曾吞掉编排「准备」按钮点击）；移动端战场由视图层传 `fabClassName` 避让底部计分条 | `ChatRoom.tsx`（fabClassName prop）；RoomBattleView |
| 3 | 发送链路 | trim 后 Enter/按钮发送 → WS `{type:'chat', text}` → 服务端广播 `chat_message{user_id,username,role,text}`（身份取自连接，不可伪造）→ 全房回显含发送者（无乐观 UI，实打实 RTT） | `useRoomGame.ts:handleChatSend`；`ws/client.go` readPump |
| 4 | 单条长度上限 | 前端 input `maxLength=100`；**后端按 rune 截断至 100**（2026-09-21 修复：直调 WS 可绕过前端限制；rune 计数防多字节切半）；气泡 `break-words` 兜底长串布局 | `ws/client.go`（chatMaxRunes）；`ChatRoom.tsx` |
| 5 | 连接级限流 | 聊天与丢蛋共享 300ms 最小间隔，超频**静默丢弃**（不回错误，防利用回显放大）；grab/pause 等游戏消息不受限 | `ws/client.go`（chatMinInterval/lastChat） |
| 6 | 消息渲染 | 自己右侧金底气泡/他人左侧；发送者名 + 旁观者 👁 标记（role 来自服务端）；面板打开自动滚底；React 文本插值天然防 XSS | `ChatRoom.tsx` |
| 7 | 未读角标 | 面板关闭期间新消息计数（含丢蛋系统消息），FAB 红色角标 9+ 封顶，点击/打开清零 | `ChatRoom.tsx`（unread/prevLen） |
| 8 | 丢鸡蛋 | 目标菜单=在线玩家排除自己 → WS `{type:'egg_throw', target_id}` → 广播 → 聊天流插系统消息 + 全屏打蛋动画（命中本人 `isMe` 特效，2.5s 自清） | `useRoomGame.ts:handleEgg`；`useChat.ts:onEggThrow`；`components/EggAnimation.tsx` |
| 9 | 丢蛋动画定时器 | 句柄留存 `eggTimerRef`：覆盖前 clearTimeout + 卸载清理（2026-09-21 修复：连丢两蛋时旧定时器会提前清掉新动画 + 卸载后 setState 泄漏） | `useChat.ts` |
| 10 | 旁观者发言 | 旁观者可正常收发，输入框占位文案明示「旁观者也可以发言」；`isSpectator` 仅影响占位文案，不限制发言 | `RoomBattleView.tsx`（isSpectator 传参） |
| 11 | 状态隔离 | 聊天状态在 `useChat`（内存 useState）：换房/刷新清空；禁用账号被踢 WS 后无法续聊（修⑧联动）；房间 end 后 hub 停止，聊天随结算物理终止 | `useChat.ts`；`ws/hub.go` |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 无持久化 | 消息不落库，刷新/重连/换房即清空——与临时房间语义一致，历史留存视为伪需求 | 设计取舍 |
| 2 | 结算页无聊天 | 结算停留期（可达 1-2 分钟）聊天随战场 UI 卸载；根因是后端 `game_over` 后 3-4s `hub.Stop()` 物理断开。若要支持需延长 hub 生命周期——艾佩理雅评估为不值得，「结算即散场」自洽；折中可加静态提示文案 | 维持现状（已向 Owner 说明） |
| 3 | 300ms 静默丢弃 | 极快连发的第二条会被静默丢弃（正常手速不可达）；反馈「消息偶发消失」时改 `chatMinInterval` 常量 | 既定权衡 |
| 4 | 无限流错误回执 | 超频消息无错误提示（有意：避免被利用做回显放大） | 安全取舍 |
| 5 | 面板遮挡右下牌面 | 展开的 360px 面板可能盖住右下角牌——用户主动打开才发生，与 toast 遮挡读牌区同级记录 | 记录不修 |
| 6 | 单房间单聊天室 | 无私聊、无跨房间、无多频道——产品不需要 | 范围裁剪 |

## 验证记录（2026-09-21）

**修复验证**：后端 `go build` + `ws`/`handler` 测试绿（限流仅挂 chat/egg 两 case，既有对局协议 E2E 的抓牌/暂停路径不受影响）；前端 `tsc` 零错误 · vitest 81/81 · build 绿。

**设计合理性判定**（Owner 问询后交付）：房间即世界的聊天模型与产品形态自洽；FAB 收纳+未读角标不打断抢牌节奏；旁观可发言合理。唯一斟榷点=结算页无聊天，判定维持现状（后端 hub 生命周期约束，方案与折中已书面记录于边界 #2）。

**诚实边界**：聊天的浏览器级实测（真实双端收发/丢蛋动画/未读角标）未做 Playwright 验证；限流与截断为代码级验证（编译+既有测试不受影响），无专项单测（readPump 依赖真实 WS 连接，现有 E2E 资产未覆盖聊天路径）。
