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
| A3.2 牌库三件套 | ✅ 完成 | 72 处 emoji → lucide 图标 · 三态补全（错误态+重试为新增）· EmptyState/PageSpinner/Badge 组件化 · 行为零改动 | `a32-*` |
| A3.3 CardCreate | ✅ 完成 | 861→435 行（-49.5%）· 拆出 `features/card-create/` 11 文件 725 行 · 35 处 emoji → lucide · 双模式行为逐字保留 | `a33-*` |
| A3.4 NewRoom+JoinRoom+Profile | ✅ 完成 | 70 处图标化 · 三态补全（Spinner/EmptyState）· StatCard 类型化 LucideIcon | `a34-*` |
| A3.5 RoomPage 拆分 + B1 回合时钟 | ✅ 完成 | RoomPage 1388→1064 行（-23%）· `features/room/` 9 文件（useSound/useAudioPreload/useChat/useDuelState + 4 展示组件）· B1 前端接线（cmd_id/audio_ended 停发/buffer_fail/时钟偏移）· B1 后端（`duration_sec` + `ends_at` 权威切首 + 抢牌幂等 + 暂停补偿）· 测试绿 | `a35-*` · 后端 run #9 绿 |
| A4 类型与清扫 | ✅ 完成 | `any` 21→0（根因修类型）· WS 类型集中 `api/ws-events.ts`（types.ts re-export 零破坏）· Noto Serif JP 本地打包（124 分片 /fonts 同源）· console.warn 保留为 ffmpeg 降级诊断出口（注释说明） | 字体加载断言通过 |
| B2 媒体资产生命周期 | ✅ 完成 | 状态机（pending_delete/deleted）· `karuta-admin media gc`（-dry-run 默认、真实引用查孤儿、COS 物理删）· 用户配额（总容量/单日次数 → 413 QUOTA_EXCEEDED）· 测试绿 | gc dry-run 实测 |
| 收尾总结 | ✅ 完成 | 总结报告（下方）· CI 全绿 · 冒烟全过 | — |

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


### D3-B3 · 可观测性最小切面
- 结构化日志：`obs.Setup()` 将 slog 默认 logger 切为 JSON（snake_case 字段：user_id/room_id/duration_ms/err），chi 文本 Logger 替换为 `obs.RequestLogger`（method/path/status/duration_ms/remote_addr）；ws 包 5 处 log.Printf → slog。
- `/metrics` 免鉴权（与 healthz 同级）：rooms 按状态分布、WS 在线连接数（HubManager.Stats 遍历 hub 计数）、media_assets 总量/字节、进程 uptime/goroutines/heap。
- 刻意不做：Prometheus/直方图/标签维度——消费方是日志文件与人眼检查的 JSON 端点，符合"简单计数端点"规格。
- 心智负担控制：卡牌上传过程性日志（handler/card.go）保留原 log.Printf，B3 只统一基础设施与核心链路（WS/请求），迁移全量日志留给后续按需推进。

### D4-B1 · 服务端权威回合时钟设计（B1 核心）
- **时长来源**：服务端无法解析音频时长，改为上传链路测量——浏览器端 `getAudioDuration`（处理链完成后测量，trim30 语义天然正确），FormData `audio_duration` 上行，存 `card_audios.duration_sec`（向前兼容新列，旧数据 0）。
- **权威时钟**：`roundEndsAt = playStart + duration + settle`（末首 tail=2s 对齐原行为）；`card_start` 广播 `start_at/ends_at/server_now`（UnixMilli）；到期服务端自动切首。
- **兼容策略**：`audio_ended` 消息保留解析但降级为日志（NotifyAudioEnded no-op），旧客户端不炸、不再能触发切首；时长未知回退原 maxWait 兜底（interval×10 / 60s）。
- **暂停补偿**：暂停时记录时刻，恢复时 `roundEndsAt += pausedDuration`——顺带修复了原实现"暂停后 maxTimer 重置全时长"的计时器重置 bug。
- **幂等**：grab 消息带客户端单调 `cmd_id`，服务端按 `(user_id)` 记录 lastCmdID，重放（≤上次）直接忽略——防止网络重试双扣分。cmd_id=0 视为旧客户端直接处理。
- **media_event**：客户端 buffer_fail（音频重试耗尽）上报，服务端提前切首防全场卡死。

## 冒烟清单（每 Phase 收口前过一遍）

- [x] `cd frontend && npm run build`（含 tsc）全绿——每 Phase 均验证，主包稳定 179.83KB（gzip 58.79）
- [x] 登录 → 首页战场大厅可见房间列表（DOM 断言 + 截图）
- [x] 牌库/牌组页可打开，牌面图正常加载（DOM 断言 + 截图）
- [x] 创建房间 → 房间等待页 → WS 连接成功（房间 413 实测，在线列表出现）
- [x] 主题切换（sakura / shimapan）无样式错乱（计算样式断言：body/按钮/muted 双主题自动切换）
- [x] 碰后端时：`cd backend && go test ./...` 全绿（10 包，含 obs/ws/media 新测试）

## 总结报告（2026-09-21 · 无人值守自治改造收官）

### 成果总览（16 commits，ecdcb9b → 0546a08+）

| 维度 | 前 | 后 |
| --- | --- | --- |
| 巨石文件 | RoomPage 1420 行 / CardCreate 882 行 | RoomPage 1064 / CardCreate 435，拆出 features/ 20 文件 |
| 设计系统 | 无（颜色硬编码 + shimapan 靠 72 行 `!important`） | `docs/design-system.md` + RGB 三元组 token 全落地，双主题纯 CSS 变量驱动 |
| 基础组件 | 无 | `components/ui/` 十件（五状态完备），替换全部 66 调用点 |
| 图标体系 | 功能按钮 emoji 泛滥 | lucide-react（唯一新依赖），~180 处功能性 emoji 换 SVG |
| 类型 | 21 处 any、WS 类型分散 | any=0、`api/ws-events.ts` 集中 |
| 字体 | Google Fonts CDN（国内不可达） | 本地 124 分片同源分发 |
| B1 回合时钟 | 房主客户端 audio_ended 可伪造结束 | 服务端权威（上传链测时长 → ends_at → 到期自动切首），抢牌 cmd_id 幂等，暂停时钟补偿 |
| B2 媒体生命周期 | 引用归零直接物理删 | 状态机 + `media gc --dry-run` + 用户配额（413 QUOTA_EXCEEDED） |
| B3 可观测性 | chi 文本日志 | slog JSON 统一字段 + `/metrics`（房间/WS/媒体/进程） |
| CI | — | 每次 push 均绿（run #3-#10 全 success） |

### 决策日志摘要（详见上方逐条）

D0 截图基线 webp/测试账号 aibase/dev 启动包装器 · D1 颜色 token 三元组化/pink 重映射/gold-foil 恒定/vite JIT 缓存陷阱 · D2 Toast 禁 framer 保主包 178KB/替换切分 · D3 图标映射约定/死链清理/B3 最小切面 · D4-B1 时钟设计（时长来源/兼容/暂停补偿/幂等）

### 遗留问题（不阻塞，建议 Owner 排期）

1. **RoomPage 主 switch 仍 ~470 行**：duel/judge 事件 case 跨域引用页面状态，下放需 prop 爆炸权衡——已记录于看板，后续可事件总线或 reducer 化。
2. **handler/card.go 过程日志未 slog 化**：B3 只统一了基础设施与 WS 链路，卡牌上传的密集 log.Printf 保留（不影响结构化框架，可渐进迁移）。
3. **配额默认关闭**（QUOTA_USER_BYTES/QUOTA_DAILY_UPLOADS=0）：生产开启前建议先在测试环境压测 413 交互路径。
4. **`card_audios.duration_sec` 旧数据为 0**：新上传才有时长；老牌组回退 maxWait 兜底。可写一次性脚本用 ffmpeg 批量回填。
5. **截图基线未入库**（gitignore）：跨机视觉对比需重新生成。

## 截图基线索引（A0，2026-09-21）

`home` `/` · `cards` `/cards` · `cards-new` `/cards/new` · `decks-list` `/decks` · `deck-detail` `/decks/42` · `rooms-new` `/rooms/new` · `join` `/rooms/join` · `profile` `/profile` · `room-waiting` `/rooms/413` · `login` `/login` · `register` `/register` · `guest` `/guest`
（视口 1440×900，Chromium headless）

（已并入上方总结报告的"遗留问题"小节）
