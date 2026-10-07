# 03 · 注册（账号建立与邀请码门）

## 能力概览

注册是正式账号的唯一建立通道：昵称 + 密码（+ 开态邀请码）→ 一次性建号并签发 7 天 JWT。
邀请码门为**双态**（Owner 决策 2026-09-30，取代 2026-09-21 固定码方案）：开关关（默认）
为开放注册，`invite_code` 字段忽略；开关开只认数据库一次性码（事务内消费）。
开关来源三层：数据库持久值（管理员面板切换，即时生效 + 审计）→ env `INVITE_REQUIRED`
回退（仅库无记录时）→ 默认关。开态的邀请码消费与建用户在**同一事务**内完成，
失败整体回滚——不烧码、不产幽灵用户。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 注册页校验（前端） | 昵称 trim 后 2–20；邀请码仅开态必填；密码 ≥6 且两次一致。任一失败页内报错，不发请求 | `pages/RegisterPage.tsx:handleSubmit` |
| 2 | 邀请码框随开态出现 | 挂载读 `GET /api/auth/invite-status`（`inviteRequired: boolean\|null`，null=未知不渲染）；开态渲染输入框并必填；fetch 失败 fail-closed 置 true（要码） | `pages/RegisterPage.tsx`（useEffect + 条件渲染 Input） |
| 3 | 服务端昵称标准 | `TrimSpace` + 2–20 字符，与 GuestLogin 同标准（2026-09-21 修复：此前只查非空，`" spaced "`/1 字符/64 字符可绕过前端直调 API 创建） | `handler/auth.go:Register` |
| 4 | 双态邀请码门 | 开态：空码 → `400 INVITE_REQUIRED`，非数据库码 → `400 INVALID_INVITE`；关态：开放注册，`invite_code` 字段忽略（固定码常量已删） | `handler/auth.go:Register` |
| 5 | 邀请码单事务消费 | `CreateUserWithInvite`：查未消费码 → INSERT user（带 `invited_by`）→ 条件 UPDATE 消费（`WHERE used_by IS NULL` + RowsAffected=1，防并发双花）→ commit；任一步失败整体回滚。原三步独立写 + `DeleteByID` 补偿会被 `invites.used_by` 外键阻断（2026-09-21 修复 #2） | `store/user_store.go:CreateUserWithInvite` |
| 6 | 派生默认邮箱 | email 缺省 = `昵称@karuta.local`（游客为 `@guest.karuta`，两后缀为常量）；用户自带 email 尊重原值 | `handler/auth.go:Register` |
| 7 | 昵称释放与邮箱迁移 | 改名（`PATCH /api/me`）时若 email 为派生默认值则同步重派生（单语句原子写 username+email）——否则旧昵称被幽灵邮箱占用、永久无法再注册（2026-09-21 修复 #1，实测复现过 409） | `handler/auth.go:UpdateMe`；`store/user_store.go:UpdateUsername` |
| 8 | 密码强度 | 服务端强制 ≥6 位，bcrypt cost 12 哈希；密码 `json:"-"` 永不出 API | `handler/auth.go:Register`；`model/models.go` |
| 9 | 唯一性与冲突语义 | `users.username` / `users.email` 均 UNIQUE；冲突统一 `409 USER_EXISTS`（"username or email already taken"） | `store/db.go`（schema）；`Register` |
| 10 | 成功响应与会话 | 201 `{token, user}`；JWT HS256、`sub`=数值用户 id、7 天有效；前端 token 落 `localStorage['karuta_token']` 并入 AuthProvider | `handler/auth.go:issueToken`；`hooks/useAuth.ts` |
| 11 | 深链回跳 | 注册成功后回跳守卫/JoinRoomPage 记录的 `state.from`（仅站内相对路径，拒绝 `//host` 与绝对 URL 防开放重定向），无则首页（2026-09-21 修复：此前有写无读） | `pages/LoginPage.tsx:postAuthDestination`（RegisterPage 复用） |
| 12 | 邀请关系落库 | 开态消费成功记录 `users.invited_by` = 邀请码创建者；管理面板可见「← 邀请人」链条 | `CreateUserWithInvite`；`pages/ProfilePage.tsx:AdminUserList` |
| 13 | 邀请码发放 | 任意正式用户 `POST /api/me/invites` 生成一次性码（crypto/rand 8 位 hex）；`GET /api/me/invites` 列表；ProfilePage 有「生成邀请码」按钮。游客不可发 | `store/invite_store.go:Generate`；`handler/auth.go:GenerateInvite` |
| 14 | 注册限流 | 20 次/分钟/IP（认证类接口共享限流桶） | `cmd/server/main.go`（authRateLimit） |
| 15 | 已登录改密（2026-09-21 增补） | `POST /api/me/password`：bcrypt 校验旧密 + 新密（≥6，cost12）写入；游客拒绝（无密码体系，走转正）；个人页「账号安全」弹窗错误码本地化 | `handler/auth.go:ChangePassword`；`pages/ProfilePage.tsx` |
| 16 | 忘记密码通道（2026-09-21 增补） | `karuta-admin reset-password -database -username -password`：机主/管理员本地重置，拒绝游客，审计 `user.password_reset_cli`（cli-local） | `cmd/admin/main.go:resetPassword` |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 关态无访问门槛 | 开关关=开放注册，任何人可建号；真门是开态一次性码（2026-09-30 拆除固定码剧场，此前的 `33989` 仪式码作废） | 既定语义 |
| 2 | 开关三层来源的覆盖语义 | 库有持久值后 env `INVITE_REQUIRED` 永久失效；多实例批量部署时需以库为准或清 `app_settings` 该行 | 单实例形态无影响，部署形态约束 |
| 3 | 用户名可枚举 | 409 明文区分占用来源；昵称在对局中本就公开，增量为零 | 低危，记录不修 |
| 4 | 登录时序侧信道 | 不存在的用户不走 bcrypt 提前返回；同上，昵称公开 | 低危，记录不修 |
| 5 | 行为变化提醒 | 2026-09-30 起关态不填码即可注册；历史脚本里的 `invite_code:"33989"` 会被忽略（无害，无需回滚） | 契约变更，已在测试钉死 |
| 6 | 无邮箱验证 | email 仅作唯一性占位（默认派生值），无验证流程；**忘记密码走 CLI 重置**（2026-09-21 落地，见能力 #16；依赖机主 SSH 权限，无邮箱通道系有意取舍——项目无邮件服务凭据） | 有意取舍 |
| 7 | 改密不吊销存量 JWT | 改密后旧 token 在 7 天窗口内仍有效（彻底吊销需 token 版本机制，与既往「存量 token 窗口」决策一致） | 记录 |

## 验证记录

**2026-09-30 契约更新（拆除固定码）**
- `TestRegisterInviteGateModes` 五断言矩阵：关态 无码 201 / 任意码忽略 201；开态 非数据库码 400 `INVALID_INVITE` / 一次性码 201 / 空码 400 `INVITE_REQUIRED` ✓
- `TestRegisterInviteModes`：关态无码注册 201 + 开态须数据库码、非数据库码被拒 ✓

**2026-09-21（`go test ./...` 12 包全绿）**
- `TestRegisterWithInviteSingleTransaction`：消费原子性——成功路径 `invited_by`/`used_by` 断言；复用与无效码整体回滚、无幽灵用户 ✓
- `TestRegisterValidatesUsername`：trim 后 1 字符 400 / 64 字符 400 / 前后空格入库为 trim 值且无双胞胎账号 ✓
- `TestRenameReleasesOldUsername` / `TestRenameKeepsCustomEmail`：昵称释放与派生邮箱迁移 ✓

**前端**：`tsc --noEmit` 零错误 · vitest 全绿 · `npm run build` 绿。

**诚实边界**：注册页浏览器级实测（真实点击 + 双态提示呈现）未做 Playwright 验证；后端全部行为有测试或修复前实测复现记录。
