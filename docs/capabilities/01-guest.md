# 01 · 游客（免注册入场身份）

## 能力概览

游客是**免注册的临时对局身份**：取一个昵称即可入场，一切动线收敛为「昵称 → 邀请码 → 房间」。
在房间内与正式用户完全平等（抢牌/计分/聊天/排名），但没有内容生产能力（牌库/牌组/建房）。
身份延续依赖**恢复码**（一次性 token，本机 localStorage + 服务端 hash），核心设计目标是**防昵称冒用**。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 免注册建立身份 | 昵称 2–20 字符 → `POST /api/auth/guest` → 返回 JWT（7 天）+ 游客用户（`is_guest=true`，邮箱占位 `{昵称}@guest.karuta`） | 后端 `handler/auth.go:GuestLogin`；前端 `hooks/useAuth.ts:guestLogin` |
| 2 | 两步入场流 | 步骤 1 确定昵称 → 步骤 2 输入邀请码加入房间；已是游客的访问者直接落步骤 2 | `pages/GuestPage.tsx`（step state） |
| 3 | 深链预填 | `/guest?code=XXXXXX` 自动预填步骤 2 的邀请码（不自动提交，用户确认后进房） | `GuestPage.tsx`（useSearchParams → setCode） |
| 4 | 邀请链接游客通道 | `/rooms/join?code=X` 未登录时展示防御态：「登录/注册」+「游客快速入场」（带码跳 `/guest?code=`），code 全程保留 | `pages/JoinRoomPage.tsx`（防御态分支）；路由公开区 `App.tsx` |
| 5 | 恢复码身份延续 | 首次创建时后端生成 256 位随机 token：hash 落库（`guest_token_hash`）、明文存本机 `localStorage['karuta_guest_recovery:<昵称原样>']`。同设备同昵称再登录时自动附带，延续同一身份（同 uid） | 后端 `GuestLogin`（签发）/`newGuestRecoveryToken`；前端 `useAuth.ts:guestLogin`（读 key 自动附带） |
| 6 | 恢复码防冒用（换设备锁死） | 同昵称在无恢复码的环境登录 → `401 INVALID_GUEST_RECOVERY`（昵称锁死在原设备）。**有意设计**：宁可锁死不让冒用 | 后端 `GuestLogin` existing 分支（`validGuestRecoveryToken` 校验失败即拒） |
| 7 | 交叉 token 冒充拒绝 | 拿 A 昵称的恢复码登录 B 昵称 → 校验 B 的 hash 不匹配 → 401。恢复码与账号 hash 绑定，跨账号无效（实测验证） | `validGuestRecoveryToken`（`subtle.ConstantTimeCompare`） |
| 8 | legacy 自动补签 | 老游客（`guest_token_hash` 为空）在已登录会话内刷新时，前端静默调 `POST /me/guest-recovery` 换发新恢复码并落本地 | 前端 `useAuth.ts`（me 恢复分支）；后端 `IssueGuestRecovery` |
| 9 | 房间内平等参与 | 以普通 `role=player` 进入：抢牌、计分、排名、聊天、丢蛋与正式用户无差别；前端限制只看旁观/裁判身份，不看 `is_guest` | `pages/RoomPage.tsx`/`features/room/*`（无 is_guest 分支） |
| 10 | rematch 玩家迁入 | 房主发起 rematch 且 `reinvite=true` 时，源房间全部玩家（含游客）以 `role=player, score=0` 迁入新房 | 后端 `store/room_store.go:RematchCopyPlayers` |
| 11 | 昵称唯一性 | 撞正式用户 → `409 USER_EXISTS`（"username already taken by a registered user"）；撞已锁死游客 → 401；**大小写变体为独立账号**（后端 BINARY collation，区分大小写） | 后端 `GuestLogin`；`store/db.go`（username UNIQUE） |
| 12 | 退出当前身份 | 「退出当前身份」→ logout（清 JWT），**恢复码保留在本机**——下次同昵称可续身份 | `GuestPage.tsx`（logout 按钮）；`useAuth.ts:logout`（不清 recovery key） |
| 13 | 路由边界 | 可达：`/guest`、`/rooms/:id`、全部公开页；不可达：正式用户区（开战/牌组/牌库/我的/建房），访问被重定向回 `/guest` | `routes/guards.tsx:RequireMember`；`App.tsx` 路由树 |
| 14 | 恢复码存取键语义 | localStorage key 用**昵称原样**（trim 后），与后端精确匹配语义对齐——大小写双昵称各用各的 key，互不覆盖 | `useAuth.ts:guestRecoveryKey`（2026-09-21 修复，原 toLocaleLowerCase 折叠会造成串号锁死） |
| 15 | 游客转正（2026-09-21 增补） | `POST /api/me/upgrade`：单事务换昵称/派生邮箱/密码并清除 is_guest 与恢复码；JWT 不变（同 uid），**战绩与成就零迁移**；GuestPage 提供升级卡片（昵称撞车 409 本地化、成功后重载解锁成员区） | `store/user_store.go:UpgradeGuest`；`handler/auth.go:UpgradeGuest`；`pages/GuestPage.tsx` |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 无自助解锁 | 恢复码丢失（换设备/清存储）后同昵称永久不可用，无找回/解绑入口 | 设计取舍（防冒用优先） |
| 2 | 无游客→正式升级 | ~~想转正式账号只能换昵称注册，历史战绩带不走~~ **已落地转正通道（2026-09-21）**：保留 uid，战绩成就零迁移；转正后原昵称与恢复码作废 | 已解决（见能力 #15） |
| 3 | 恢复码无轮换无吊销 | 一旦签发终身有效；泄露后无吊销通道（缓解：token 仅存本机，窃取需 XSS/本机访问级前置） | 低危，记录不修 |
| 4 | 用户名枚举 | 409 明文区分"被正式用户占用"，可探测昵称注册状态（昵称在对局中本就公开，增量有限） | 低危，记录不修 |
| 5 | 锁死错误文案为英文 | "guest nickname is already in use on another session" 未本地化 | 文案债，待排期 |
| 6 | 补签并发竞态 | 双标签页同时刷新可能双发 `/me/guest-recovery`，hash 重置两次——同源 localStorage 后写胜，最终一致 | 无持久伤害，不修 |
| 7 | 大小写双账号并存 | "QAGuest" 与 "qaguest" 是两个独立游客（后端区分大小写）——用户视角可能困惑"同名" | 设计现状（与恢复码 key 语义一致） |

## 验证记录（2026-09-21，运行中服务实测）

- **后端身份矩阵 6/6**（curl）：注册签发 ✓ / 同昵称带 token 延续同 uid ✓ / 丢 token 401 ✓ / 大小写变体独立 uid ✓ / **交叉 token 冒充 401** ✓ / 撞正式用户 409 ✓
- **前端游客流 5/5**（`e2e/guest-flow.mjs`，Playwright）：深链 code 预填（59N35P）✓ / 加入对局进房 ✓ / 恢复码 key 精确大小写 ✓ / 退出后同昵称免输恢复码延续身份 ✓ / 占用昵称报错 ✓；零 JS 错误
- **进房渲染截图**：`baseline/visual-smoke/guest-in-room-clean.png`（3 人玩家列表/邀请面板/房主标识正常）
- **回归测试**：前端 77/77（含 guestRecoveryKey 修复）· 后端 go test 12 包全 ok
