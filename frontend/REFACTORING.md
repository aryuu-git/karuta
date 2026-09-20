# 前端重塑看板（REFACTORING）

> 无人值守自治改造的进度看板与决策日志。Owner 醒后按本文件审阅，可否决、可回滚任何决策。
> 视觉宪法：和纸质感、樱花粉×金粉、金色光晕、Noto Serif JP 书卷气、KarutaCard 牌面质感——美化是"把这套风格做精致"，不是换风格。

## 看板

| Phase | 状态 | 产出 | 验收截图 |
| --- | --- | --- | --- |
| A0 安全网 | ✅ 完成 | build 基线 ✅ · 截图基线 ✅（14 页，`frontend/baseline/`）· 本看板 ✅ · CI 绿（run #3） | — |
| A1 设计系统 | ✅ 完成 | `docs/design-system.md` ✅ · token 落地（index.css + tailwind.config）✅ · `!important` 段删除 ✅ · 双主题截图 6 张 ✅ | `a1-sakura-*` / `a1-shimapan-*` |
| A2 组件库 | ✅ 完成 | `components/ui/` 十件（Button/Input/Textarea/Select/Dialog/Panel/Spinner/Badge/EmptyState/Toast+useToast）· 全部调用点替换（17 文件 40 按钮 + 25 输入 + RoomPage toast 43 处迁移）· 主包保住 178.85KB | 冒烟 3 页无 JS 错误 |
| A3.1 Home+Login+Register | ✅ 完成 | 导航/首页/认证页图标化（lucide）· 房间状态 Badge 化 · 空态 EmptyState · 删除桌面版死链横幅 | `a31-*` |
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

### D1-A1 · 颜色 token 全面 RGB 三元组化
- 选项 A：保留 hex 变量 + Tailwind 静态引用 → 失去 `/alpha` 修饰符支持（现有代码大量 `gold/10`、`crimson/30`）
- 选项 B：Tailwind 与 inline style 双轨变量 → 两份定义需人工同步，坏味道
- **选择：全量三元组**（变量存 `R G B`，消费方一律 `rgb(var(--x) / a)`）。28 文件 420+ 处用点机械转换（rgba 模式 330 处 → 现代语法；独立直用 90 处 → `rgb()` 包装）。
- 验证：build 全绿；双主题计算样式断言（body/按钮渐变/muted 文字色自动切换）；CSS 体积 45.85→44.19KB（`!important` 段 72 行删除）。

### D1-A1 · Tailwind 内置 `pink-300/500` 重映射而非改调用点
- 现状：`text-pink-300` 59 处 + 渐变/阴影 14 处直接使用 Tailwind 内置粉，shimapan 主题靠 `!important` 强改（原 index.css 56-126 行整段）。
- 选项 A：ast_edit 全局替换为语义类 → 59 处语义判断各不相同（有的该是 muted、有的该是 gold-light），逐处判断风险高
- 选项 B：config 层把 `pink-300`/`pink-500` 的值重映射到语义变量 → 类名零改动，主题自动适配
- **选择 B**（影响面最小）。代价：内置色名留有"隐式魔法"，已在 config 注释与设计系统声明：**新代码禁用一切内置色类**；A3 页面重塑时顺手迁移。

### D1-A1 · `gold-foil`（真金粉）跨主题恒定
- shimapan 是蓝紫主题，原 `glow-color` 在该主题为蓝色。金粉点缀（描金、徽记、金粉光晕）保持 #d4a76a 不随主题变化——深蓝底描金同样成立，且避免"金色随主题变蓝"的语义混乱。

### D1-A1 · 开发陷阱记录：vite dev 的 Tailwind JIT 缓存
- 修改 `tailwind.config.js` 后 vite dev 不会自动重载 config（产物仍用旧值）→ 必须**重启 dev server**。build 不受影响。

### D2-A2 · Toast 渲染层禁用 framer-motion（主包体积红线）
- framer-motion 原为路由级共享 chunk（111KB），`ToastProvider` 挂在 `main.tsx` 同步链上，一旦引 framer 会整体并入首屏主包：实测主包 177.84→293.63KB（gzip 58→96）。
- **选择：ToastProvider 及其渲染层零 framer 依赖**，入场动画用 CSS keyframes（`toast-in`）。修后主包 178.85KB（+1KB，即 ui 组件本体）。
- 规则沉淀：`main.tsx` 同步依赖树里禁止引入重量级库；Button/Dialog 等页面级组件可安全用 framer（随路由 chunk）。

### D2-A2 · 组件抽取的替换切分
- Button/Input/Toast（全局高频、无布局耦合）→ A2 一次性替换全部调用点（含漏网兜底：NewRoomPage 不在三任务清单内，由主会话补齐）。
- Dialog/Panel/EmptyState/Spinner/Badge → A2 建组件，调用点替换并入 A3 各页重塑（避免同页改两遍、截图两遍）。
- lucide-react 引入，`Loader2/X/ChevronDown` 等按需具名导入，确认 tree-shaking 生效（未用图标名 0 命中于产物）。

### D3-A1/A3.1 · 删除"桌面版下载"横幅
- HomePage 的 `Karuta.exe` 下载横幅指向已废弃的桌面版（handoff 六轮：Tauri/Capacitor 已整体删除），属于死链残留，直接删除（GitHub 仓库横幅保留）。

### D3-A3.1 · 图标映射约定（lucide-react）
- 导航：牌库=`Images`、牌组=`Layers`、用户=`CircleUserRound`、下线=`LogOut`
- 首页：令牌=`KeyRound`、开战=`Swords`、房主=`Crown`、刷新=`RefreshCw`、管理员强停=`Zap`、搜索=`Search`、大厅=`Castle`
- 表单：昵称=`UserRound`、密码=`Lock`、邀请码=`Sparkles`
- emoji 保留范围：品牌 Logo 🌸、空状态插画、结算/氛围语气符号——符合设计系统 §2 图标体系原则

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
