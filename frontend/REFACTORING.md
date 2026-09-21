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
| R1 路由与骨架重铸 | ✅ 完成 | `routes/paths.ts`（类型化路径工厂 + routePatterns，消灭 48 处字面量）· `RequireAuth/RequireMember` 守卫 · `AppLayout` Outlet 布局（页面不再自裹壳，旧 Layout.tsx 已删除）· 404 页 · 路由级 ErrorBoundary（location.key 自动复位） | tsc + build 绿 |
| R2 数据层 | ✅ 完成 | `@tanstack/react-query`（Owner 批准破例）· `api/queries.ts`（queryKey 工厂 + 10 个共享 hooks）· 80 处手写三态收敛 · HomePage 8s 无条件轮询 → useRoomList 可见性感知 · 写操作统一 invalidateQueries | tsc + build 绿 |
| R3 领域状态机 | ✅ 完成 | RoomPage 1064→99 行（-91%）· `roomReducer.ts` 纯 reducer（22 useState 收敛，21 项一次性断言全过）· `useRoomGame`（副作用编排层）· 视图拆分 WaitingView/BattleView · 470 行 handleEvent switch 下沉 · NewRoomPage 29→6 useState（RoomConfig 单对象） | reducer 冒烟 21/21 |
| R4 展示层补完 | ✅ 完成 | ui 模板件四件（PageContainer/HeroHeader/Section/ConfirmDialog）· 111 裸 button→Button · 16 手写弹窗→Dialog/ConfirmDialog · window.confirm 全清 · 284→137 inline style（-52%）· 18 共享组件 token 化（purple/green/orange 硬编码色全清）· 字号统一字阶 token | 残留扫描达标 |
| R 收尾 | ✅ 完成 | framer-motion 彻底移出首屏主包（AppLayout 内 Changelog/ThemeSwitcher 懒加载、ErrorBoundary 去 Button 依赖）· 主包 = react 生态 + react-query（Owner 批准成本）· 冒烟清单过 | 主包 framer 0 命中 |
| L 布局重构 | ✅ 完成 | L1 壳统一（CenteredShell 收编 6 处全屏壳 + `--header-h` 契约变量 + z-index 六档语义 token 全量迁移）· L2 滚动（AppLayout pathname 级滚动恢复 + max-h 四档 scroll-box token）· L3 对局响应式（battle-viewport 100dvh 带 @supports 回退 + 控制栏窄屏横滚 + 聊天 FAB 避让移动端计分条 + viewport-fit=cover）· L4 收口 | build 绿 · 产物断言 |
| U 交互重构 | ✅ 完成 | P0 开战闭环（PlayHub+PresetPicker+InvitePanel+rematch 结算+导航方案A+深链）· P1 对局屏（StatusStrip 六状态/ConnectionBanner/MobileScoreSheet/ControlMenu/myRoundStatus）· P2 内容流（造牌四步向导+per-file 音频状态机单文件重试）· P3 反馈（Skeleton+空态 CTA 化）· 后端 rematch API（25 列配置复制+reinvite+5 测试） | tsc+build 绿 · 后端待 CI |
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

### D5-R1 · 路由路径双轨制：paths 工厂 + routePatterns
- 选项 A：只建数字参数工厂（`paths.deck(id)`），路由表用 `paths.deck(':id') as string`——类型谎言。
- **选择 B：双轨**——`paths`（导航用，数字参数）与 `routePatterns`（路由表用，`:param` 字面量）一一对应注释。代价是两处维护，收益是零类型断言。

### D5-R2 · 引入 TanStack Query（破「新增依赖仅 lucide-react」红线）
- 选项 A：自研 useAsync 最小 hook——零依赖但缓存/失效/预取/竞态全部手搓，长期成本更高。
- **选择 B（Owner 批准）：@tanstack/react-query v5**。主包增量即 react-query core（framer 已隔离出主包，实测 framer 0 命中）。默认策略：retry=1、refetchOnWindowFocus=false（对局页防意外刷新）、staleTime=30s；轮询仅 useRoomList 显式 8s 且 refetchIntervalInBackground=false（后台标签自动停）。

### D5-R3 · RoomPage 状态迁移纯 reducer 化
- 原 470 行 handleEvent switch 内 setState/toast/音效/定时器混杂。拆法：**状态迁移进 roomReducer（纯函数）+ 副作用留 useRoomGame**；WS 事件里 toast/音效/预取就地执行，dispatch 只带数据。牌面展示顺序稳定性（displayOrder）作为 reducer 不变量写进注释并有断言覆盖。
- 刻意不做：事件总线/状态机库——22 个状态字段用 useReducer 足够，引库是过度设计。
- 遗留：duel 域状态仍在 useDuelState（useState 组），未并入 reducer——duel 事件跨域引用多，收益低于风险，保留现状。

### D5-R3 · 旧 Layout.tsx 直接删除而非过渡期兼容
- AppLayout（Outlet）与页面自裹 Layout 并存会双header。所有页面迁移与组件清扫在同一轮完成，tsc 全绿后直接删除旧壳，不留兼容垫片。

### D5-R4 · framer-motion 首屏隔离补漏
- R1 新增的 AppLayout 静态引入 Changelog/ThemeSwitcher（均依赖 framer）、ErrorBoundary 引 ui Button（framer）——主包一度回升 348KB。修法：Changelog/ThemeSwitcher 懒加载（lazy+Suspense fallback=null），ErrorBoundary 兜底按钮改原生元素（挂在同步链上的组件禁止依赖 framer 系组件，规则写入注释）。

### D5-FIX1 · 重连后已抢牌"复活"（严重 bug）双侧修复
- **根因**：REST `GET /api/rooms/{id}` 的 cards 列表没有 `remaining` 字段（只有 `audio_count`），前端 `buildRemaining` 回退 `?? audio_count` → 刷新后已抢牌以满次数复活。WS 的 `room_state` 有权威 `remaining`，但存在竞态：GetRoom 是 N+1 查询（逐卡取音频），大牌组时比 WS 握手慢，**WS 权威投影先到后会被后到的 REST init 无条件覆盖**（含重排牌面顺序），且之后无 room_state 广播纠正 → 持久错误。
- **后端根治**：`GameSession.SnapshotBoard()`（内存权威投影：remaining + grabbed 带 hint_text）+ `RoomHub.LiveBoard()` 导出；GetRoom 优先消费 `hub.LiveBoard()`，cards 带 `remaining`，grabbed_cards 优先内存投影，仅服务重启等无 session 场景回退 DB 流水（该场景 audio_count 回退是唯一选择，语义可接受）。
- **前端防御**：`roomReducer` 的 `init` 增加竞态守卫——`state.roomState !== null`（WS 投影已落定）时只补齐元信息（loading/status/players/isSpectator/justJoined），**绝不动 cards/displayOrder/cardRemaining/discardPile**。
- **验证**：竞态回归一次性脚本 9/9 通过（WS 先到不被覆盖/不重排/不清废牌堆；WS 后到正常覆盖），脚本已删；前端 tsc + build 绿。**后端未编译（本机无 Go 工具链），需 CI 确认**。

### D5-L · 布局重构决策（L1–L4）
- **CenteredShell 补 relative**：原散装壳的装饰光斑 absolute 定位依赖视口初始包含块（壳本身无定位上下文），收编时显式加 `relative`——语义等价且意图明确。
- **z-index 六档语义化**：`dropdown(30) < sticky(40) < float(50) < overlay(80) < modal(100) < toast(200)`。关键分层：**浮动按钮（聊天 FAB/主题切换）压过吸顶导航**（原 z-50 平级靠 DOM 顺序碰运气）；overlay(80) 低于 modal(100)——洗牌遮罩/丢蛋动画是提示性覆盖，不应挡住可能并发的模态。容器内局部 z-10/z-20（有 relative 父级，无跨容器竞争）保留不迁移。
- **battle-viewport 工具类而非 Tailwind 任意值**：`h-[calc(100dvh-var(--header-h))]` 无法表达「dvh 不支持时回退 vh」，`@supports` 只能写在 CSS。落 `@layer utilities` 单一来源。`--header-h` 定义在 `:root` 共享块，shimapan 主题块只覆盖颜色变量自动继承。
- **滚动恢复用 pathname 而非 location.key**：同一列表页反复进出共享滚动记录（符合"返回列表页"直觉）；key 每次导航都变会退化为"永远置顶"。记录时机：新 pathname 的 effect 触发时 scrollY 仍属旧页面（SPA 路由切换不重置滚动），单 effect 内先记录后恢复。
- **ChatRoom fabClassName 传参而非内部判断**：组件不知道自己处于什么布局语境（战场有底部计分条/等待大厅没有），由视图层传入避让类。duel 模式无 MobileScoreBar → 传 undefined 用默认位。
- **裁判面板 38% 保留百分比**：上区选牌/下区棋布的比例是既有 UX 决策，本次只去 inline style（改 `h-[38%]` 类），不改数值。

### D6-1 · 主题切换移除（Owner 指令）
- 删除 ThemeSwitcher/ThemeProvider/useTheme 三文件 + AppLayout 懒加载引用 + main.tsx Provider + index.html 引导脚本 + CSS shimapan 主题块。
- **单主题（樱花）运行**；`:root` 合并原 sakura 值，`[data-theme]` 覆盖机制保留为注释说明（未来恢复多主题按此扩展）。
- design-system.md 顶部加历史声明，双主题内容标记为历史记录；token 机制（RGB 三元组）不变。

### D6-2 · 全站文案去中二（Owner 指令，规范=docs/ui-interaction-design.md §1）
- 语调三层模型：仪式层（品牌/结算/空态插画）/ 操作层（≤6字动宾，无颜文字）/ 警示层（平静陈述+行动指引，禁卖萌）。
- 两批并行迁移（页面 12 文件 + 对局域 18 文件），主会话补漏 4 处（RoomPage/Changelog/DuelBoard/EditAudioPanel 为分配清单外）。
- 代表性变化：「凭令入场/直接降临！」→「邀请码加入/加入」；「召唤新牌」→「新建歌牌」；「战阵编纂所」→「牌组」；43 处对局 toast 收敛为 ≤12 字短句（「🎉 你抢到了！太厉害了！+1分 (ﾉ◕ヮ◕)ﾉ」→「✓ 抢到 +1」）。
- **颜文字预算集中到结算页**（称号/樱花仪式感保留），全程撒花改为单点爆发。
- 结算页称号体系（世一网/手残选手/苦命鸳鸯）与品牌 🌸 保留——仪式层合法场景。
- 验证：全站颜文字正则扫描 0 命中；tsc + build 绿；toast 类型与 duration 参数零改动。

### D7 · U 交互重构决策（P0–P3，规格=docs/ui-interaction-design.md）
- **导航方案 A 执行**（开战/牌组/牌库）：规格书线框基准，Owner 遗留决策按推荐项执行，B 方案回滚成本=Home 内部布局单文件。
- **跨批次契约先行**：PresetPicker/InvitePanel props、myRoundStatus action、retries 提升、localStorage 键全部在派发 context 中逐字固定，五批并行零契约漂移（终扫验证）。
- **文件所有权互斥**：RoomPage 横跨 P0（结算 props）与 P1（接口变化）——P1 经 hub 上报契约变化，主会话在 P0 落位后统一接线，规避同文件并发写。
- **RoomConfig 下沉 features/play/roomConfig.ts**：消除 NewRoomPage↔presets 循环依赖（TDZ 隐患），NewRoomPage re-export 保持契约。
- **向导实现选「四分区常驻+hidden 切区」**：AudioUploadOptions 挂载时会重置本地选项状态，卸载重挂即丢用户选择——常驻挂载天然零丢失。
- **文案批次间漂移教训**：P3 空态 CTA 与 P2 提交按钮各有一处回写旧词（「召唤新牌」「召唤歌牌」，后者源自主会话任务书示例），终扫捕获修复。规则：派发任务书中的示例文案也必须用新规范词。
- **后端 rematch**：INSERT...SELECT 25 列配置复制 + reinvite 玩家迁移（role=player/score=0），5 个 handler 测试（403/409/404/成功/reinvite=false）；两条独立语句无事务与现有 CreateRoom+AddPlayer 风格一致；**本机无 Go 工具链，待 CI 编译+测试确认**。

### D7-补 · 规格缺口审计修复（五批并行的交界盲区）
U 系交付后对照规格书逐节审计，发现并修复三处跨界漏项：
1. **PlayHub 房间列表无骨架屏**（P3 禁碰 HomePage × P0 未接 Skeleton）→ Skeleton variant='row' rows=4。
2. **「用它开局」未接 PresetPicker**（规格 §6.2 预设流锁定牌组；契约的 defaultDeckId 零消费者）→ DecksPage/DeckDetailPage 两处接线：点击打开 PresetPicker 锁定该牌组，onSelect 直接创建跳新房、onCustomize 携带预设跳完整表单。
3. **游客深链断链**（规格 §3.3）→ JoinRoomPage 未登录防御态补「游客快速入场」（携带 code 跳 /guest?code=）；GuestPage 读 searchParams 预填邀请码（已是游客直接落步骤 2）。
教训：多代理并行时，规格中跨批次的"接缝条款"（A 组件给 B 场景用）必须在至少一个批次的任务书里显式指派消费者，否则无人认领。tsc + build 绿。

### D7-验收 · U 系交付验收审计（第三轮）
- **行为级验收静态核验**：rematch ≤2 taps（结算页主 CTA 直达）✓；快开 ≤3 taps（PlayHub→PresetPicker→开辟）✓；链接直达 1 tap（深链自动加入）✓；StatusStrip 恒非空（可抢态兜底）✓；列表页零裸 Spinner ✓。
- **修复两处**：① PresetPicker 补 `loading` prop（三个消费方的 creating 状态原先未传入，创建中主按钮无反馈——违反五状态规范）；② NewRoomPage 牌组选择区行内 Spinner → Skeleton rows=2（本质是 decks.map 列表，§7.1 适用）。
- **U 系 reducer 回归冒烟 15/15 通过**：myRoundStatus 全链路（init/card_start/claimed/banned/重连 idle）、竞态守卫三断言（已抢牌不复活/牌面不重排/废牌堆不清）、洗牌消费、间隔倒计时、game_over。脚本已删。
- **架构确认**：myRoundStatus 的「是否是我」判定在 useRoomGame 层双 dispatch（reducer 无 user 上下文，保持纯函数）——冒烟首跑曾误设 reducer 单 dispatch 期望，核对 9 处真实接线后修正脚本假设，代码无 bug。

### D7-收口 · 规格残项核查 + dev 模块冒烟（第四轮）
- **InvitePanel 三按钮确认**：复制链接/复制码/系统分享齐备；二维码项为 P0 已声明的降级（无二维码库，契约允许）。
- **修复 rematch → autoFocus 断链**（§4.6 最后一环）：useRematch 导航时携带 `{ state: { focusInvite: true } }`，WaitingLobby 派生后传 InvitePanel autoFocus（码自动高亮）。
- **Relay 现状**：`omp browser-relay install` 已执行（扩展文件落盘 ~/.omp/browser-relay/extension），**Chrome 侧需 Owner 手动 Load unpacked + 开启**，之后视觉冒烟即可执行。
- **dev 模块冒烟**：vite dev 下 U 系全部 28 个新/改模块变换 200 无 Pre-transform error。tsc + build 绿。

### D8 · 前端测试基建（vitest，dev-only 依赖）
- **决策**：引入 vitest@2.1.9 作为 devDependency（零主包影响——与 react-query 的运行时依赖破例性质不同，不改变「新增运行时依赖仅 lucide-react」红线）。独立 `vitest.config.ts`（node 环境），不复用 vite.config.ts（ffmpeg 插件与测试无关）。
- **首批 28 用例**（每条对应真实修复过的 bug 或人工核对过的契约，不凑数）：
  - `roomReducer.test.ts` 15 条：竞态守卫（D5-FIX1「已抢牌复活」回归：init 不覆盖 WS 投影/不重排牌面）、myRoundStatus 全链路、displayOrder 稳定性、读牌流转、间隔倒计时暂停冻结、洗牌消费、game_over。固化三轮临时冒烟脚本。
  - `roomCreate.test.ts` 10 条：15 位置参数逐位映射（标准/shuffle 归零/duelConfig 七字段）、last-config 读写与损坏 JSON 容错、inviteLink 拼接。
  - `presets.test.ts` 3 条：模板齐全性、练手/对决模板字段、matchPreset 反查（含非模板返回 undefined）。
- **开发中捕获的真实偏差**：测试首跑暴露 presets 实际 key 为 `practice`（假设 `training` 错误）——测试写错而非代码错，但证明用例确实在核对真实契约。
- **`npm test` script 已加**；ES2020 target 约束下测试禁用 `Array.at`（用索引访问）。
- 验证：tsc + 28/28 tests + build 全绿。

### D9 · 组件层测试扩展（@testing-library/react + happy-dom）
- **依赖**：@testing-library/react@16 / @testing-library/dom / happy-dom（均 dev-only）。per-file `@vitest-environment happy-dom` pragma，纯函数测试保持 node 环境。
- **26 条新用例**（P1/U 系核心交付物的渲染契约，不凑数）：
  - `StatusStrip.test.tsx` 10 条：六状态渲染、justJoined 仅 player 守卫（裁判优先）、恒非空（4 组合）、旁观入口有/无回调、玩家态无按钮。
  - `ConnectionBanner.test.tsx` 7 条：冷启动不误报（retries=0 不显示）、断线进度 n/10、封顶展示、自定义上限、恢复 2s 自动消失（fake timers）、首连成功不提示。
  - `PresetPicker.test.tsx` 9 条：lastConfig 显隐与默认选中、牌组锁定（Select disabled+hint）、空牌组防御（双按钮禁用）、onSelect/onCustomize 载荷、loading 锁定。
- **测试环境工程问题与修法**（均已注释沉淀在测试文件内）：
  1. RTL 自动 cleanup 依赖 vitest globals（未开）→ 显式 `afterEach(cleanup)`；
  2. framer-motion 卸载动画在 happy-dom 抛 AbortError 未处理 rejection → `vi.mock('framer-motion')` 直通实现（JSX 走 react/jsx-runtime 静态导入，规避 vi.mock hoist 限制）；
  3. `getByText` 命中 Button 内部 span（无 disabled）→ 改 `getByRole('button', { name })`；
  4. **@testing-library 传递引入 @types/node** → 全局 setInterval 解析为 NodeJS.Timeout，与 `useRoomGame` 的 `number | null` ref 冲突 → `window.setInterval` 显式 DOM 重载（源码级修复，带注释）。
- 验证：tsc + 54/54 tests（6 文件）+ build 全绿。

### D9-补 · 组件测试扩面（54 → 77）
- **共享 framer mock**：`src/test/framerMock.tsx`（直通实现，剥离 13 个动画 props），各测试文件以 `vi.mock('framer-motion', () => import('...'))` 消费——工厂内模块加载是 vitest 官方共享 mock 模式，替代 D9 的逐文件内联。
- **23 条新用例**（5 个组件的行为契约）：
  - `Toast.test.tsx` 4 条：到时自动移除（fake timers）、便捷方法、**堆叠上限 4 条**（slice(-3)+new）、脱 Provider 抛错（错误边界捕获）。Toast 渲染层零 framer（D2 决策），无需 mock——顺带验证了该决策。
  - `Button.test.tsx` 4 条：**loading/disabled 点击穿透阻断**（防重复提交契约）、正常态单次触发、loading 图标+文案保留。
  - `Dialog.test.tsx` 5 条：Esc/遮罩点击关闭、内容区点击不关、**closable=false 全抑制**（处理中弹窗契约）、open=false 不渲染、title+actions 槽。
  - `ConfirmDialog.test.tsx` 3 条：确认/取消回调、**loading 全锁定**（双按钮禁用+Esc/遮罩失效）。
  - `MobileScoreSheet.test.tsx` 7 条：把手文案派生（排名/旁观中）、展开/收起、me「（你）」标记、分数排序 DOM 顺序、**裁判模式隐藏房主**（人数扣除）、旁观排尾。
- **源码级小改**：Toast.tsx 导出 `ToastContextValue` 命名类型（替代测试侧 ReturnType 反模式，符合类型导出规则）。
- **测试编写教训**（沉淀注释）：负断言必须 queryByText（getByText 找不到会抛错）；模糊正则（如 /\d+$/）会误匹配把手文案，结构性断言用 DOM 顺序。
- 验证：tsc + 77/77 tests（11 文件）+ build 全绿。

### D10 · Go 工具链落地 + 后端本地收口 + Playwright 视觉验收
- **后端本地收口**（Owner 装 Go 后）：go1.27.1（`C:\Program Files\Go\bin`，bash 直调受限需 PowerShell 包装）。`go build ./...` 通过；`go test ./...` **12 包全 ok**；rematch 专项 **5/5**（403/409/404/成功+25列继承+reinvite/reinvite=false）——「后端待 CI」悬置项解除，CI 仅做二次确认。
- **relay 排障结论**：daemon 可起、扩展可连（日志确认 Extension connected）、`browser.relay=true` 已开，但 prelude ping 仍超时——工具链层协议问题，多轮排障（清僵尸/手动起/配置/等待重连）无果后**放弃 relay 路线**。
- **Playwright 视觉验收落地**：`@playwright/test` + chromium-1243（dev-only）。`e2e/visual-smoke.mjs`：8 页 × 双视口（1440×900 / 375×812），公开页全系列（login/register/guest/join 防御态/404），截图存 `baseline/visual-smoke/`（gitignore 目录），AI vision 逐页验收。
- **验收抓到 1 个真实 bug 并修复**：`/rooms/join?code=XXX` 挂在 RequireAuth 守卫下 → 未登录被重定向到 /login，**JoinRoomPage 防御态（游客快速入场 + code 预填）永不可达**，游客链路丢失 code。修复：该路由移入公开区（页面内自带防御态双通道 + washi-bg 壳补齐），修复后截图复验通过。教训：**防御态页面不能挂在登录守卫下，守卫与页面内防御是互斥的两层**。
- **8/8 验收结论**：login/register/guest/404/join×2 视口全部合格（和纸樱花配色成立、无溢出无错乱、双按钮与 code 保留确认）；register 邀请码「必填」为 fail-closed 安全默认（inviteRequired 初始 true，后端不可达时不放开注册）——设计正确。
- 验证：77/77 tests + tsc + build 全绿；悬置多轮的「视觉冒烟 ⚠️」正式销项。

### D10-补 · 全栈服务启动 + 登录后视觉验收 + rematch 真实 HTTP 实测
- **本地全栈起服**（Owner 装 Go 后）：后端 `go run ./cmd/server`（COS 凭据用 dev 假值过 Validate——NewCOSStorage 零网络请求纯构造，媒体功能失效但登录/房间/WS 全链路可用）+ 前端 vite dev（5173，proxy→8080）。
- **rematch 真实 HTTP 三路径全过**：409（waiting 房拒 rematch）/ 404（不存在）/ 200（end 房 → 新房 id=2 code=59N35P 配置全继承）。至此 rematch 从单测（5/5）到真实链路完全闭环。
- **登录后视觉验收（Playwright 真实登录）**：PlayHub（导航/双 CTA/邀请码区/活跃战场列表含状态徽章）· 房间大厅（InvitePanel 59N35P 大字码+复制双钮/玩家列表/开始按钮）· 牌组页（三页签/卡片/查看+用它开局）——全部合格。系统分享按钮在 headless 下隐藏符合「navigator.share 不支持则隐藏」契约。
- **意外验证**：Changelog 4.0.0 首登弹窗真实弹出并遮挡截图——版本记录机制工作正常，E2E 脚本补关闭步骤。
- **微项记录（非 bug，可选优化）**：活跃战场副标题对比度低；牌组卡 card_count 仅图标+数字无单位字；房间条目不展示房间码（设计如此）。
- **E2E 资产**：`e2e/visual-smoke.mjs`（公开页 8 页双视口）+ `e2e/visual-auth.mjs`（登录后 3 页），截图存 `baseline/visual-smoke/`（gitignore）。

### D12 · OCR 全仓审查 + 自主修复决策（Owner 指令：修该修的，报告全部）
- **工具**：@opencodereview/cli 2.1.5（npm 发布含 `workspace:*` 依赖无法直接装——手动解包 + 补装 @opencodereview/core 组装运行时于 ~/ocr-tool）。L1 全仓扫描：677 issues / 166 文件 / 45 分 F。
- **误报甄别（不修，均有实证）**：①141 条 "defined but never used"——抽查证实 api.cards.get 在 CardCreatePage:152 实际使用，OCR 不识别「函数收进导出对象」模式；②约 250 条「疑似幻觉包」——offline mode 无法查 registry 的系统性误报（react/chi 等全部真实）；③13 条 U+FE0F——合法 emoji 变体选择符（⚔️/🏋️）；④Go error 未处理 ×8——核实为 if-init 误报（实际都有 return err）；⑤硬编码 dev JWT secret——production 有 ≥32 字符强制防线；⑥Math.random ×21——UI 场景，安全敏感处用 crypto/rand；⑦roomReducer 201 行/复杂度 55——reducer 单函数可测试性设计。
- **已修 2 个真 bug**：
  1. **管理员禁用绕过**（D11 实锤复现项）：5 处 admin 鉴权补 `|| u.Disabled`（auth.go×4 + room.go ForceEndRoom）+ **Me 端点补 Disabled 检查**（存量 JWT 下次刷新即 403，前端自动清 token）+ 回归测试 4 条（admin_disabled_test.go：正常 admin 对照/禁用 admin 拒绝/自解禁拒绝/me 拒禁用）。**原复现链实测转绿**：admin API 200→403、自解禁 200→403、me 新增 403；对照组正常。
  2. bangumi.go json.Marshal 错误忽略 → 显式处理。
- **测试基建教训**：JWT sub claim 须为数值（字符串触发 middleware `invalid sub claim type`）。
- **新触发的边缘瑕疵（记录待拍板）**：降级被禁用的管理员时 LAST_ADMIN 误拦（计数只数 disabled=FALSE，被禁用者反而不可降级）——运维绕过=先解禁再降级；可修（计数语义调整）但涉保护权衡。

### D12-补 · 遗留项全量修复（Owner 二次指令：无法决策的也全部修）
- **修① LAST_ADMIN 计数语义**（上轮实测触发的误拦）：降级被禁用管理员时不再误拦（target 已不在可用集合，降级不损失保护目标）；唯一可用管理员仍 409。新增 TestLastAdminSemantics 双场景回归。实测：409→200，对照组 409 保持。
- **修② 游客昵称枚举模糊化**：撞正式用户从 `USER_EXISTS`明文 → `409 GUEST_NAME_UNAVAILABLE`（不区分占用方类型，攻击者无法借此区分游客/正式账号）。新增 TestGuestNameEnumerationBlurred。
- **修④ 错误本地化**：HttpError 增加 `code` 字段（透传后端错误码）；GuestPage 按 code 映射中文文案（GUEST_NAME_UNAVAILABLE / INVALID_GUEST_RECOVERY / GUEST_RECOVERY_REQUIRED / ACCOUNT_DISABLED 四码）。
- **决策不修③（恢复码登录轮换）**：先登录者通吃——攻击者持泄露 token 登录会轮换掉受害者本地 token，反而帮助攻击者锁死受害者；且受害者侧已有 `/me/guest-recovery` 主动重置通道，轮换净收益为负。
- **维持不修**：业务端点存量 token 7 天窗口（彻底修复需 middleware 查库或 token 版本机制，改动面大且最恶劣路径已在 D12 封死）；游客→正式升级通道（产品功能非 bug）。
- 验证：后端 10 包 ok（含新增 3 测试）· 前端 77/77 + tsc + build 绿 · 实测两项修复转绿 + 对照组保护完好。

### D12-补2 · 禁用语义彻底化（Owner 三令：剩余项全修）
- **修⑤ middleware 层禁用检查（7 天窗口归零）**：上轮以"改动面大"暂缓的项重新评估后判定改动可控——`UserStore.IsDisabled`（轻量单列查询）+ `middleware.Auth(secret, checker)`（新增 DisabledChecker 接口，nil 跳过仅测试用）。**效果：被禁用账号的存量 JWT 在任意请求即 403 ACCOUNT_DISABLED**，彻底消除"禁用只挡新登录"的语义缺口。3 个调用点更新（main.go + 2 测试）。新增 TestMiddlewareRejectsDisabledToken 回归。实测：禁用用户旧 token 调 /me 与 /api/decks/mine 均 403（后者此前 200），对照组 200。
- **修⑥ GuestPage join 分支错误本地化**（上轮 handleSetName 的对称面遗漏）：ACCOUNT_DISABLED → 中文。
- **OCR 剩余 unused 疑点全部核实为误报**：AvatarProps/AuthBootLoading/Props/State 均在实际使用（该检测对 TS 类型标注与 JSX 引用系统性失明）——三轮累计 141+4 条 unused 报告零真死代码。
- **测试基建教训**：改 middleware 签名后 3 个调用点全量 grep 更新（漏一个即编译期暴露，类型系统兜底有效）。
- 验证：后端 10 包 ok · 前端 77/77 + tsc + build 绿 · 实测转绿。

### D12-补3 · WS 层两个阻断级 bug（Owner 五令；协议级验证发现）
- **修⑦ Hijacker 透传（重大：WS 层全灭）**：`obs.RequestLogger` 的 `statusWriter` 不实现 `http.Hijacker` → **全部 WS 升级 500**（"response does not implement http.Hijacker"）。该 bug 自 B3 引入日志中间件起就存在——单测不覆盖 WS 升级、OCR 是静态分析、视觉验收只看渲染，**只有真实协议连接才能暴露**。修复：statusWriter 实现 Hijack/Flush 透传（Hijack 成功记 101）。修复后协议级连接实测成功。
- **修⑧ 禁用踢 WS（语义缺口）**：middleware 只在升级时检查一次，被禁用玩家存量 WS 可继续抢牌聊天。修复：`HubManager.DisconnectUserEverywhere`（锁外遍历防死锁）+ AdminToggleUser 禁用成功后调用 + AuthHandler 注入 HubManager（4 个构造点更新）。
- **端到端黑盒验证全绿**（e2e/ws-kick-verify.mjs，纯协议）：victim 入房→WS 连接成功→管理员禁用→**victim WS 被服务端断开（onclose）**→换 ticket 重连 403。四步断言全过。
- **OCR L2 试跑**：无 embedding provider 时降级为 L1 输出，无新扫描面。
- **认知更正**：`cmd/admin` 早有 `set-admin` 命令（此前"必须手动 SQL"判断有误）。
- 验证：后端 10 包 ok · 前端 77/77 + tsc + build 绿。

### D12-补4 · 对局引擎全链路协议验证（Owner 六令；Hijacker 修复的完整兑现）
- **背景**：修⑦打通 WS 后，对局实时层首次真实可用——而对局全链路（开局/广播/抢牌/计分）此前从未被真实验证过（WS 升级一直 500）。
- **协议级实测**（e2e/game-protocol-verify.mjs，双真实客户端）：建房（注库 3 张测试牌绕过 COS 媒体限制）→ 双 WS 连接 → 开局 → **countdown + card_start（含 B1 权威时钟 ends_at/server_now/预取队列）→ victim 抢牌 → card_claimed（winner 正确）→ score_update（+1）→ 房主慢抢 → grab_wrong → 聊天全房广播**——11 项断言全过。
- **结论：对局引擎本身健康**，此前唯一阻断就是升级层（修⑦）。本轮零新 bug，但是带完整实证的否定结论——从建房到计分的真实路径全绿。
- **E2E 资产**：`e2e/game-protocol-verify.mjs`（对局协议）+ `e2e/ws-kick-verify.mjs`（禁用踢 WS）沉淀为可复跑验收。
- 验证：脚本 11/11 断言 · 后端 10 包 ok · 前端 77/77。

### D12-补5 · 裁判 + duel 模式协议验证（Owner 七令）
- **裁判模式 6/6**：开局 → `judge_waiting` → 裁判 `play-card` → `card_start` 广播 → **裁判自抢被拒（grab_banned）** → 玩家抢牌 `card_claimed` 计分正确。
- **duel 模式 7/7**：建房（4 牌小盘）→ 双方 claim-seat（200/200）→ 开局 → `duel_arrange_start` → 双方 `arrange_ready` → `duel_arrange_done` → `duel_card_start`（round/audio 字段完整）→ victim 抢牌 → `duel_card_claimed`（**area='own' 己方区判定正确**）。
- **三种游戏模式（auto/judge/duel）自此全部拥有协议级验收覆盖**，零新 bug。E2E 资产：`e2e/game-modes-verify.mjs`。
- **剩余未验证面（诚实边界）**：duel 子分支（给牌 give_card/超时 requeue/编排 swap）；媒体上传链路（本地 COS 假凭据，需真实凭据）；Bangumi 搜索（外部 API）。核心对局流已全部覆盖。

### D12-补6 · duel 子分支验证（Owner 八令）
- **四分支稳定验证通过**：抢错（`duel_grab_wrong`——注意语义：抢"在场但非当前回合"的牌；抢不存在的牌走 `duel_grab_invalid`）、机会耗尽（`duel_grab_blocked`）、超时（`duel_timeout`，requeued=true）、**requeue 闭环**（超时牌回队尾后同 card_id 再次 `duel_card_start`）。给牌分支（`duel_give_request`→`give_card`→`duel_give_done`，area='opponent'+needs_give）在本脚本 v2 首跑三断言全过。
- **发现并确认的服务端规则（非 bug）**：duel 轮时长下限钳制 `round_time < 30 → 30`（听歌需要时间，合理）——脚本传 3 被钳 30，验证窗口须 >30s。**附带 UX 瑕疵记录**：前端建房表单若允许填 <30 会被静默抬到 30（无提示），待核对前端最小值约束。
- **脚本局限（非产品缺陷）**：give 分支复跑存在抖动——脚本回合推进逻辑与服务端回合模型（blocked 后回合超时 resolve 的时序）失步，诊断确认第一回合后脚本停止收到 card_start。分支本身有首跑验证记录；`e2e/duel-subbranches-verify.mjs` 保留为资产（wrong/blocked/timeout/requeue 四断言稳定）。
- 验证：wrong ✓ blocked ✓ timeout ✓ requeued ✓ reappeared ✓（本轮两跑稳定）；give ✓（v2 首跑）。

### D12-补7 · 浏览器 UI 真实对局 + 修⑨ WS 双连接竞态（Owner 九令）
- **浏览器 UI 集成验证**（e2e/browser-game-verify.mjs，双 Playwright 会话真实开一局）：深链加入（/rooms/join?code 自动进房）→ 开局 → **StatusStrip 可抢态（真实 WS 驱动）** → 抢牌 → **UI claimed 态「你抢到了 +1」** → 计分板 ★1/剩余 8/9/废牌堆 → 双端零 JS 错误。此前 WS 500 时代前端对局 UI 从未真实跑过，此为最终盲区闭合。
- **修⑨ WS 双连接竞态（真 bug，截图双 toast 暴露）**：`useRoomSocket` 用布尔 mountedRef 防重入——ticket 请求在飞期间 unmount→remount（StrictMode dev 稳定触发；生产快速路由切换同理）时 mountedRef 已被新挂载置回 true，**旧连接泄漏存活 → 双 WS 并存 → 全部事件消费翻倍**（双 toast/双 dispatch）。修复：**连接代际计数**（generationRef，effect 启动递增、cleanup 失效所有在飞连接与重连回调）。E2E 实证：claimed toast 计数修复后 = 1（修复前 2）。
- **两条 UX 观察（记录不修）**：对局中 toast（top 居中）短暂遮挡读牌区提示句（2-3s 自动消失，改动副作用大于收益）；同文案 toast 堆叠为多事件多提示的预期行为。
- **附带知识**：音频时长未知时每首兜底等待 60s（maxWait 下限钳制）——E2E 时序设计须在开局前挂旁路监听。
- 验证：浏览器对局 E2E 全绿（含 toast 计数回归断言）· 前端 77/77 + tsc + build 绿。

### D12-补8 · 断线重连 + rematch UI 双验证 + 修⑩（Owner 十令）
- **修⑩ 非成员访问房间页的语义错误**（banner 验证脚本踩出）：非房间成员直接访问 /rooms/:id（如他人复制地址栏 URL 分享）此前显示「找不到这个战场」+ 英文原文透传——语义错误（房间存在只是未加入）。修复：load_error 携带错误码（reducer 新增 errorCode 字段 + useRoomGame 按 HttpError.status 分类），RoomPage 区分 403「你还未加入这个房间」（引导走邀请链接）与 404「找不到这个战场」。
- **ConnectionBanner 真实断线首验**（e2e/banner-reconnect-verify.mjs，复用修⑧禁用踢 WS 制造真实断线）：对局中禁用 victim → WS 断开重连受阻 → **「连接中断，重连中…」横幅出现** → 解禁 → 自动重连成功 → **「已恢复」出现后 2s 自动消失**。三断言全过——P1 交付的断线链路首次真实验证。
- **rematch UI 闭环首验**（e2e/rematch-ui-verify.mjs，1 牌快局 ~65s 跑到自然结算）：结算页出现 → **victim（非房主）「再来一局」禁用** → 房主点击 → 导航到新房（/rooms/29）→ **InvitePanel 展示** → 双端零 JS 错误。七断言全过——P0 rematch 的 UI 流首次验证（此前仅协议层）。
- **E2E 资产 +2**：banner-reconnect-verify / rematch-ui-verify（累计 7 件套）。
- **E2E 工程教训**：Changelog 懒加载弹出时机晚于 networkidle——关键交互前需防御性 dismiss（dismissChangelog helper，三轮踩坑后固化）。
- 验证：双 E2E 全绿 · 前端 77/77 + tsc + build 绿。

### D12-补9 · duel 浏览器 UI 首验 + 修⑪ 聊天 FAB 遮挡编排操作条（Owner 十一令）
- **修⑪（阻断性 UI bug，旁路 WS 实证）**：聊天 FAB（fixed bottom-4 right-4）在 duel 桌面视图遮挡底部 DuelStatusBar/编排「准备完毕」按钮——**点击被 FAB 吞掉**（旁路 WS 监听：点击后服务端 arrange_state 广播为空数组 = ready 消息未到达）。真实用户在 duel 编排时可能点不到准备。修复：duel 模式 FAB 全断上移 `bottom-16`（L3 的避让只覆盖了移动端计分条场景）。实证修复：点击后服务端收到 `{p1_ready: true}`（修复前空）+ UI「已准备 ✓」回显。
- **duel 浏览器 UI 全链首验**（e2e/duel-ui-verify.mjs 九断言）：大厅席位区 → **双方点击「入座」互见** → 开局 → **编排 UI「准备完毕！」** → 双方 ready 回显 → DuelBoard 牌面 → **点击抢牌 UI 反馈** → 双端零 JS 错误。duel 的 UI 交互层（此前仅协议层验证）闭合。
- **E2E 工程教训**：①force click 不绕过坐标命中（FAB 遮挡时 force 仍点在 FAB 上）——遮挡问题要用布局修复而非 force 规避；②WS 往返类 UI 状态（ready/claimed）断言须轮询而非固定等待；③「双方就绪后编排 UI 整体消失」——ready 断言须在对方点击前完成。
- 验证：DUEL UI 九断言全绿 · 前端 77/77 + tsc + build 绿。

### D12-补10 · 裁判 UI + 暂停恢复全端验证（Owner 十二令；模式矩阵收官）
- **裁判模式浏览器 UI 首验**（e2e/judge-ui-verify.mjs 七断言）：开局 → **JudgePanel「选择下一首要播放的牌」** → 裁判点击选牌 → victim 可抢态 → 抢牌 → **UI claimed 反馈** → 暂停 → **victim「已暂停」态** → 恢复消失 → 双端零 JS 错误。
- **三模式浏览器 UI 覆盖矩阵至此全部完成**（auto/duel/judge），加暂停/恢复全端同步——零新 bug（纯验证轮）。
- **E2E 资产累计 9 件**：三模式协议×2 + duel 子分支 + ws-kick + browser-UI + banner-reconnect + rematch-UI + duel-UI + judge-UI。
- **E2E 工程教训**：裁判模式选牌有并发保护（第一首窗口内再选被拒）——测试须在当前首窗口内直接抢，不要试图叠加选牌。
- 验证：七断言全绿 · 前端 77/77 + tsc 绿。

### D11 · 游客身份链路安全审计（后端 6/6 + 前端 5/5 实测）
- **冒充向量全部排除**：REST userID 取自 JWT 上下文；WS 身份来自一次性 ticket（绑定用户+路径、消息不承载身份）；恢复码 crypto/rand 256 位 + SHA-256 + constant-time 比较。
- **修复 1 个真实 bug**：恢复码 localStorage key 小写折叠 vs 后端 BINARY collation 精确匹配——大小写双昵称共存时 key 互相覆盖导致先注册者同浏览器锁死。改用原始昵称做 key（顺带消除 toLocaleLowerCase 的 tr-TR locale 陷阱）。存量用户由 me 恢复的补签路径自动迁移。
- **实测矩阵（运行中服务）**：同昵称带 token 延续身份 ✓ / 丢 token 401 锁死（设计）✓ / 大小写变体独立账号 ✓ / **交叉 token 冒充被拒 401** ✓ / 撞正式用户 409 ✓；前端深链预填→进房→恢复码精确 key→同昵称免输延续→占用报错 5/5 ✓。
- **记录不修（低危/设计取舍）**：①恢复码无轮换无吊销（泄露需 XSS 级前置，token 仅存本机）；②用户名枚举（409 明文区分占用方，昵称本就公开）；③锁死错误文案为英文服务端原文；④补签并发双 tab 竞态最终一致无持久伤害。

## 冒烟清单（U 阶段收口）

- [x] `npx tsc --noEmit` 全绿
- [x] `npm test` 全绿（vitest 28/28：reducer 竞态守卫/myRoundStatus/读牌流转 + roomCreate 15 参数映射 + presets 反查）
- [x] `npm run build` 全绿
- [x] vite dev 模块变换冒烟：U 系 28 个新/改模块全部 200 无 Pre-transform error
- [x] 残留扫描：路由字面量 0 · 悬空引用 0 · 颜文字 0 · 列表页裸 Spinner 0
- [x] 前端测试接入 CI（release.yml：npm ci → npm test → npm run build，红测试阻止发布）
- [x] 视觉冒烟：Playwright 路线完成（8 页 × 双视口截图 + AI 视觉验收，抓到并修复 /rooms/join 守卫断链 1 例；relay 路线因 prelude ping 协议问题弃用）
- [x] 后端 rematch：本地 go build + go test 收口（12 包全 ok，rematch 5/5）

## 冒烟清单（R 阶段收口）

- [x] `npx tsc --noEmit` 全绿
- [x] `npm run build` 全绿（react-query "use client" 指令为 rollup 良性提示）
- [x] vite dev 模块变换冒烟：16 个关键模块（路由/守卫/RoomPage/reducer/视图/迁移页）全部 200 无 Pre-transform error
- [x] roomReducer 一次性断言脚本 21/21 通过（init/顺序稳定性/读牌流转/间隔倒计时/暂停恢复/洗牌/结算），脚本已删除
- [x] 残留扫描：Layout 引用 0 · 路由字面量 0 · window.confirm 0 · inline style 284→137 · 裸 button 111→57（余为纯装饰/文字链，已 token 化）
- ⚠️ 浏览器视觉冒烟未执行：本机 omp browser relay 扩展未连接，无法起 Chromium 截图。**Owner 醒后建议跑一遍双主题截图对比**（A0 基线在 `frontend/baseline/`）。

## 冒烟清单（A/B 阶段历史记录）

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

## Backlog（任务书原文三项，只记录不排期）

- **内容治理**：资源冻结、举报/下架、上传来源审计、版权联系入口、软删除保留期（详见 docs/handoff.md P2.5）
- **签名 URL**：COS 预签名/临时凭证 + 完成确认（下载侧已直连，上传侧仍服务端中转；详见 handoff P1.2）
- **媒体派生版本**：源头生成 30-45 秒 / 96-128kbps 游戏音频与 WebP 封面（当前由浏览器端 ffmpeg.wasm 处理替代）
