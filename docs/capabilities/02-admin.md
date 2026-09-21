# 02 · 管理员（高权限身份与治理能力）

## 能力概览

管理员是**显式授权的高权限身份**（`users.is_admin`），注册与游客登录永远不会自动授予。
权限模型**平坦**：没有 owner 超级身份，任意管理员权限等价；因此管理员之间必须互信（见边界 #1）。
全部管理写操作落审计表 `admin_audit_logs`；被禁用的账号即时失去一切管理权（含存量 JWT 与在线 WS）。
管理员在对局中**没有**玩法特权——抢牌判定与计分完全不看 `is_admin`。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | CLI 授予/取消管理员 | `karuta-admin set-admin -database PATH -username NAME [-enabled=false]`：按用户名精确匹配（区分大小写），写审计（`user.admin_changed_cli`，source=`cli-local`，actor=target）。定位：初始引导与最后恢复手段，**有意绕过 LAST_ADMIN 保护** | `cmd/admin/main.go:setAdmin` |
| 2 | API 授予/取消管理员 | `POST /api/admin/users/{id}/admin` `{"is_admin":bool}`；事务内变更 + 审计（`user.admin_changed`） | `handler/auth.go:AdminSetAdmin`；`store/system_store.go:SetUserAdmin` |
| 3 | 最后管理员保护 | 降级「最后一个**可用**管理员」（`is_admin AND NOT disabled`）→ `409 LAST_ADMIN`。计数在事务内完成；target 已被禁用时不在可用集合，降级它不被拦（D12 语义修正） | `system_store.go:SetUserAdmin` |
| 4 | 游客不可授予管理员 | 游客是恢复码续命的临时身份，持高权限不安全：API `400 GUEST_NOT_ALLOWED`；CLI 直接报错拒绝。双通道同语义（2026-09-21 修复 #3） | `auth.go:AdminSetAdmin`；`cmd/admin/main.go:setAdmin` |
| 5 | 查看全部用户 | `GET /api/admin/users`：全量用户含 `disabled/is_admin/is_guest/invited_by/created_at`；密码与 `guest_token_hash` 为 `json:"-"` 不出 | `auth.go:AdminListUsers` |
| 6 | 禁用/启用用户 | `POST /api/admin/users/{id}/disable` `{"disabled":bool}`；事务内变更 + 审计（`user.disabled_changed`） | `auth.go:AdminToggleUser`；`system_store.go:SetUserDisabled` |
| 7 | 禁用即时三重生效 | ① middleware 逐请求 `IsDisabled` 复检 → 存量 JWT 任意请求即 403 `ACCOUNT_DISABLED`（无 7 天窗口）；② `/api/me` 403 → 前端自动清 token；③ `DisconnectUserEverywhere` 踢断该用户全部 WS 连接（锁外遍历 hub 防死锁） | `middleware/auth.go`；`auth.go:Me`；`ws/hub.go:DisconnectUserEverywhere` |
| 8 | 禁用同僚管理员需先降级 | 直接禁用另一管理员 → `409 TARGET_IS_ADMIN`。封堵「A 禁用 B（绕过保护）→ 降级 B（target 已禁用故放行）」的同僚清除链；正确路径是先降级（受 #3 保护）再禁用，两步各自审计（2026-09-21 修复 #1） | `auth.go:AdminToggleUser` |
| 9 | 不可自禁用 | `400 cannot disable your own account`——防止管理员把自己锁死；自降级允许（受 #3 保护） | `auth.go:AdminToggleUser` |
| 10 | 被禁用的管理员立即失权 | 调任何 `/api/admin/*` 端点 403，不能自解禁；对局内强停/跳结算按钮同时消失（前端按 `user.is_admin` 渲染，用户对象已 403） | `auth.go` 各 admin 端点门禁；D11 回归测试钉死 |
| 11 | 邀请码注册开关 | `POST /api/admin/invite-toggle` `{"enabled":bool}`：写 `app_settings`（持久化，重启不丢）+ 进程内 `atomic.Bool` 即时生效 + 审计（`registration.invite_required_changed`） | `auth.go:AdminToggleInvite`；`system_store.go:SetInviteRequired` |
| 12 | 读取邀请码开关 | `GET /api/admin/invite-status`（管理员门禁，2026-09-21 补齐）；公开只读端点 `GET /api/auth/invite-status` 返回同数据，无信息增量 | `auth.go:AdminInviteStatus` / `InviteStatus` |
| 13 | 强制结束任意房间 | `POST /api/rooms/{id}/force-end`：不要求是房主。顺序为**先落库 `status=end`，再广播 `room_closed` + 断 hub**（状态写失败时房间保持可服务）；审计 `room.force_end`，审计失败降级为日志不回滚强停 | `handler/room.go:ForceEndRoom` |
| 14 | 对局内干预入口 | 前端「强制结束」仅 `user.is_admin` 可见；「跳到结算」（debugEnd）为**房主或管理员**共享——admin 与房主唯一的权限交集 | `features/room/ControlMenu.tsx`、`RoomControlBar.tsx` |
| 15 | 全量审计 | 所有管理写操作（API 4 类 + CLI 1 类 + 强停）写 `admin_audit_logs`：actor/action/target/details/source_ip。API 路径 source_ip 取自反代头（`X-Real-IP` → `X-Forwarded-For` 首跳 → `RemoteAddr`，生产经 nginx 注入，2026-09-21 修复 #4） | `handler/helpers.go:clientIP`；`system_store.go:Audit` |
| 16 | 权限门 fail-closed | 6 个管理端点内联同一门禁 `u == nil || !u.IsAdmin || u.Disabled → 403`：DB 查询错误同样 403（宁可拒绝不可漏放）；middleware 逐请求禁用复检构成双保险 | `auth.go`×5 + `room.go:ForceEndRoom` |
| 17 | 前端管理面板 | ProfilePage：用户统计（游客/正式）、邀请码开关、逐用户「设管理/禁用」。**以服务端为唯一真相**：成功后整表刷新，失败 toast 中文提示（错误码映射 TARGET_IS_ADMIN / LAST_ADMIN / GUEST_NOT_ALLOWED），`busyId` 防双击（2026-09-21 修复静默失败 + 乐观更新不回滚） | `pages/ProfilePage.tsx:AdminUserList` |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 平坦模型，同僚可互贬 | 两个及以上可用管理员时，任意一方可降级另一方（LAST_ADMIN 只保护最后一人）→ 随后贬人者成为不可降级的唯一管理员。管理员之间必须互信；给不熟的社区用需引入 owner 超级身份 | 设计取舍，待产品拍板 |
| 2 | CLI 绕过 LAST_ADMIN | 有意保留（锁死时的恢复手段），以审计落痕换取可恢复性 | 设计取舍 |
| 3 | 被禁用房主的房间残留 | 房主被禁用后其 waiting 房间不主动关，靠「空房 10 分钟 / 对局中 30 秒自动关」兜底 | 低危，量大时列表短暂脏 |
| 4 | 审计表无保留期 | `admin_audit_logs` 只增不删，无归档/清理策略 | 小规模可忽略，规模上来需归档 |
| 5 | DB 抖动表现为 403 | 管理端点吞掉 `GetByID` 错误按「无权限」处理——fail-closed 正确，但排障时 403 与 500 语义混淆 | 记录不修 |
| 6 | 审计 IP 依赖反代头可伪造 | 直连暴露 Go 端口时客户端可伪造 `X-Real-IP` 污染审计；生产为环回监听 + nginx 反代，无此路径。审计 IP 不参与任何鉴权判定 | 部署形态约束 |
| 7 | 管理端点无限流 | 认证/上传等有限流，`/api/admin/*` 无——均需有效 JWT，增量风险低 | 记录不修 |

## 验证记录（2026-09-21，含当日六项修复回归）

**后端（`go test ./...` 12 包全绿）**
- `TestCannotDisablePeerAdminBeforeDemote`：禁用同僚 409 `TARGET_IS_ADMIN` → 降级 200 → 禁用 200（两步语义）✓
- `TestGuestCannotBeGrantedAdmin`：游客提拔 400 且 `is_admin` 未变 ✓
- `TestLastAdminSemantics`：唯一可用管理员降级 409；被禁用管理员降级 200 ✓
- `TestDisabledAdminRejectedFromAdminAPI` / `TestDisabledAdminCannotSelfReenable` / `TestMeRejectsDisabledUser` / `TestMiddlewareRejectsDisabledToken`：禁用失权四连 ✓
- `TestAuditRecordsProxyClientIP`：带 `X-Real-IP: 203.0.113.9` 的禁用操作，审计行 `source_ip=203.0.113.9` ✓
- `TestRegisterWithInviteSingleTransaction`（注册能力交叉验证）：邀请码消费与建用户原子，失败无幽灵用户 ✓
- CLI `TestSetAdmin`：正常授予 + 审计行落库（`user.admin_changed_cli` / `cli-local`）+ 游客拒绝 ✓

**前端**：`tsc --noEmit` 零错误 · vitest 77/77 · `npm run build` 绿（ProfilePage 管理面板改造后）。

**诚实边界**：管理面板的浏览器级 UI 验收（真实点击 + toast 呈现）未做 Playwright 实测，仅静态类型与构建验证；后端全部行为有测试或代码实证。
