# 前端重塑看板（REFACTORING）

> 无人值守自治改造的进度看板与决策日志。Owner 醒后按本文件审阅，可否决、可回滚任何决策。
> 视觉宪法：和纸质感、樱花粉×金粉、金色光晕、Noto Serif JP 书卷气、KarutaCard 牌面质感——美化是"把这套风格做精致"，不是换风格。

## 看板

| Phase | 状态 | 产出 | 验收截图 |
| --- | --- | --- | --- |
| A0 安全网 | 🔄 进行中 | build 基线 ✅ · 截图基线 ✅（`frontend/baseline/`，gitignore）· 本看板 ✅ | — |
| A1 设计系统 | ⬜ 待办 | `docs/design-system.md` + token 落地 | 双主题对比 |
| A2 组件库 | ⬜ 待办 | `components/ui/` 九件套 | 组件前后对比 |
| A3.1 Home+Login+Register | ⬜ 待办 | | |
| A3.2 牌库三件套 | ⬜ 待办 | | |
| A3.3 CardCreate | ⬜ 待办 | | |
| A3.4 NewRoom+JoinRoom+Profile | ⬜ 待办 | | |
| A3.5 RoomPage 拆分 + B1 回合时钟 | ⬜ 待办 | | |
| A4 类型与清扫 | ⬜ 待办 | | |
| B2 媒体资产生命周期 | ⬜ 待办 | | |
| B3 可观测性基线 | ⬜ 待办 | | |
| 收尾总结 | ⬜ 待办 | | |

状态图例：⬜ 待办 · 🔄 进行中 · ✅ 完成 · 🚫 blocked（附原因）· ↩️ 已回滚

## 决策日志

> 记录所有非显然决策：选项、选择、理由。Owner 可逐条否决。

### D0-A0 · 截图基线用 webp 存 `frontend/baseline/`
- 选项 A：PNG 存 `frontend/baseline/`（任务书原文路径）
- 选项 B：webp 存同目录（浏览器 screenshot 原生输出）
- **选择 A'（折中）**：目录按任务书 `frontend/baseline/`，格式沿用浏览器原生 webp（体积小 ~70%，对比用途无损视觉保真），目录整体 gitignore，不入库。
- 后果：基线文件仅本地存在；若需跨机对比需重新生成。

### D0-A0 · 测试账号 `aibase`
- 无 UI 自动化注册通道时，通过 API 注册 `aibase` / `aibase123`（开发库开放注册）。仅用于截图与冒烟，不入库任何凭据。

### D0-A0 · 开发服务启动方式
- 后端：临时 PowerShell 包装器从 `deploy/scripts/dev.ps1` 运行时解析 COS 凭据注入子进程环境（凭据不落上下文、不写任何文件）；二进制 `data/karuta-server.exe`。
- 前端：`vite dev`（hub 托管，端口 5173，IPv6 localhost）。

## 冒烟清单（每 Phase 收口前过一遍）

- [ ] `cd frontend && npm run build`（含 tsc）全绿
- [ ] 登录 → 首页战场大厅可见房间列表
- [ ] 牌库/牌组页可打开，牌面图正常加载
- [ ] 创建房间 → 房间等待页 → WS 连接成功（在线列表出现）
- [ ] 主题切换（sakura / shimapan）无样式错乱
- [ ] 碰后端时：`cd backend && go test ./...` 全绿

## 截图基线索引（A0，2026-09-21）

`home` `/` · `cards` `/cards` · `cards-new` `/cards/new` · `decks-list` `/decks` · `deck-detail` `/decks/42` · `rooms-new` `/rooms/new` · `join` `/rooms/join` · `profile` `/profile` · `room-waiting` `/rooms/413` · `login` `/login` · `register` `/register` · `guest` `/guest`
（视口 1440×900，Chromium headless）

## 遗留问题

（暂无）
