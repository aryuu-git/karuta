# Karuta 设计系统（和风歌牌）

> ⚠️ **2026-09 更新：主题切换已移除，单主题（樱花）运行。** 下文涉及 shimapan/双主题的内容为历史记录；
> token 机制（RGB 三元组 + `rgb(var(--x) / alpha)`）不变，`[data-theme]` 覆盖块已删除，未来恢复多主题时按此模式扩展。

> 视觉宪法：和纸质感背景、樱花粉×金粉主色、金色光晕、Noto Serif JP 书卷气、KarutaCard 牌面质感。
> 本文档是前端美化的唯一依据：token 定义于 `frontend/src/index.css`，Tailwind 映射于 `frontend/tailwind.config.js`。
> 配色原则：**美化是把现有风格做精致，不是换风格。**

## 1. 设计 token

### 1.1 色彩（双主题）

所有颜色以 **RGB 三元组** CSS 变量存储，Tailwind 通过 `rgb(var(--x) / <alpha-value>)` 消费——任意透明度修饰符（`/50`）双主题自动生效。

#### 语义色（sakura 值 / shimapan 值）

| Token | 角色 | sakura | shimapan |
| --- | --- | --- | --- |
| `ink` | 主背景/重文字 | `51 22 42` #33162A（2026-09-30 明度分层） | `26 40 72` #1a2848 |
| `ink-deep` | 深背景/输入框底 | `38 15 31` #260F1F | `18 30 56` #121e38 |
| `gold` | **主强调（樱花粉）** | `248 176 200` #f8b0c8 | `88 152 224` #5898e0 |
| `gold-light` | 强调亮阶 | `253 216 232` #fdd8e8 | `144 192 248` #90c0f8 |
| `gold-dark` | 强调暗阶 | `240 144 176` #f090b0 | `56 120 192` #3878c0 |
| `crimson` | 强调红粉（警示/对抗） | `248 112 144` #f87090 | `224 96 128` #e06080 |
| `crimson-light` | 红粉亮阶 | `255 152 176` #ff98b0 | `240 128 152` #f08098 |
| `surface` | 卡面/面板底 | `95 48 73` #5F3049 | `32 48 80` #203050 |
| `surface-elevated` | 浮层面板 | `116 58 88` #743A58 | `40 56 96` #283860 |
| `border` | 描边 | `160 92 128` #A05C80 | `58 88 136` #3a5888 |
| `muted` | 次级文字 | `232 192 212` #e8c0d4 | `144 176 208` #90b0d0 |
| `body-bg` / `body-text` | 页面底/正文 | #33162A / #fef8fa | #1a2848 / #f0f4f8 |

> 明度分层基线（2026-09-30）：面板/背景对比 1.19 → 1.56，浮层/背景 1.38 → 1.93，
> 边框/面板 1.77 → 2.16；文字对比保持 ≥6:1。改动只调亮度、不动色相。

> ⚠️ 历史遗留：`gold` 系实际是**樱花粉**。保留类名不改（150+ 调用点），真金粉另有 token。

#### 点缀色（跨主题恒定）

| Token | 角色 | 值 |
| --- | --- | --- |
| `gold-foil` | **金粉**（真金，光晕/描金/徽记） | `212 167 106` #d4a76a |
| `success` | 成功 | `74 222 128` #4ade80 |
| `warning` | 警告 | `251 146 60` #fb923c |
| `danger` | 危险/扣分 | `248 113 113` #f87171 |
| `info` | 信息 | `96 165 250` #60a5fa |

#### 深景/光晕族（渐变底 token）

原散落 inline 渐变统一收敛为 `tailwind.config.js` backgroundImage token，由 `PanelSurface` 消费；组件内**禁止再写引用 CSS 变量的 inline 渐变**（design:lint R3 拦截）：

| Token | 值（角度/透明度原样保留） | 用途 |
| --- | --- | --- |
| `panel-ink` | 180deg `ink → ink-deep` | 卡片/面板默认底（入口卡、列表面板、牌组卡、邀请面板） |
| `panel-abyss` | 135deg `accent-bg .15 → accent-bg-mid .4` | 表单配置区块（建房页） |
| `panel-void` | 160deg `accent-bg-end .5 → accent-bg-mid .8` | 空态容器（可配 `dashed` 描边） |
| `panel-void-soft` | 160deg `accent-bg-end .4 → accent-bg-mid .6` | 统计卡 |
| `panel-hero` | 135deg 三段 `accent-bg → accent-bg-mid → accent-bg-end` | HeroHeader 页首 |
| `accent-line` | 90deg `transparent → glow-color .4 → accent-primary .4 → transparent` | 描金顶线（Panel/Login/Register） |
| `glow-radial` | radial `glow-color .8 → transparent` | 装饰光斑 |

`--accent-*` / `--glow-color` 变量同时映射为 Tailwind 色 `accent`（DEFAULT/secondary/bg/bg-mid/bg-end）与 `glow`，可走 `bg-accent/12`、`border-accent/20` 等类名消费。

#### 内置色迁移策略

Tailwind 内置 `pink-300` / `pink-500` 在 config 层**重映射**到语义变量（老类名自动适配主题），**新代码禁止使用一切 Tailwind 内置色名**；`green/orange` 系为历史状态色，等价于 `success/warning`，逐步迁移。`text-white` 系（128 处）保持——中性白跨主题恒定；正文优先 `text-body`。

### 1.2 字阶

字体族：标题/牌面/仪式性文字 = `font-serif`（**Noto Serif SC 思源宋体**，400/500/700 本地分片打包），界面/数据 = `font-sans`（system-ui）。
2026-09-30 字体换血：旧 Noto Serif JP 打包文件字重损坏（实为 ExtraLight）且简体字掉 SimSun 混排——
SC 为 Source Han Serif 同源设计语言、覆盖简体/假名/拉丁全量，混排与字重问题一并根除（墨迹实测 400/500/700 真实递增）。

**字体使用面收敛（2026-09-30）**：`font-serif` 仅用于标题/牌面/仪式性数字/引文四类内容；UI 副题、说明、提示、空态文案一律 sans（不再挂字族类即回落 `font-sans`）。**废除斜体腔**——旧「serif + italic 副题腔」整体移除，引文用 serif 常规体（如 CardDrawer 播放提示引文，保留 `font-serif`、不带 `italic`）。码位输入（邀请码等）值可保留 tracking 字距营造码感，但 placeholder 占位文案回归常规 sans（`.code-input::placeholder` 归正字距/字重/字族，见 `index.css`）。

| Token | Tailwind | size/line-height | 字体 | 用途 |
| --- | --- | --- | --- | --- |
| display | `text-display` | 40/48 | serif 700 | 页面主标题、结算名次 |
| title-xl | `text-title-xl` | 30/38 | serif 700 | 区块主标题 |
| title | `text-title` | 20/28 | serif 500 | 卡片/面板标题 |
| body-lg | `text-body-lg` | 17/26 | sans | 首要正文 |
| body | `text-body` | 16/24 | sans | 默认正文 |
| caption | `text-caption` | 14/20 | sans | 辅助说明 |
| tiny | `text-tiny` | 12/16 | sans | 角标/时间戳 |
| micro | `text-[10px]` | 10/14 | sans | 徽标/进度计数等 meta 信息（密度例外层）；深底最低 `text-muted/70`，禁止再低 |

#### 字阶别名（迁移期）

Tailwind 内置 `xs/sm/base/lg/xl` 已在 config 层重映射到 token 档位同值行高（`xs=tiny`、`sm=caption`、`base=body`、`lg=body-lg`、`xl=title`，只统一字号/行高，不注入字重/字族）；`2xl` 以上为仪式性大字（结算名次、Hero 数字），保留默认值。新代码优先用 token 名。

#### 色彩层级（焦点 > 标题 > 数据）

| 层级 | 色 | 适用 |
| --- | --- | --- |
| 焦点 | `gold` | 交互元素（按钮/链接/hover/选中/焦点态）、主 CTA、仪式瞬间（结算/成就/Logo/邀请码） |
| 标题 | `gold-light`（小号可用 `/90`） | 页面主标题、区块/面板标题 |
| 数据 | `body-text` | 数值、正文 |
| 次级 | `muted` | 说明文字、装饰图标 |

#### 交互/圆角/图标档位

| 原语 | 定档 |
| --- | --- |
| 交互三语言 | 卡片/缩略图 = lift（`hover:-translate-y-1 hover:shadow-lg`）；面板/CTA/选项 = glow（`hover:border-gold/40` 或 PanelSurface `interactive`）；图标钮 = press（IconButton 内建 `scale-105`）。同一元素只用一种 |
| 圆角 | 浮层/大面板 `rounded-2xl`(16)；卡片/面板 `rounded-xl`(12)；按钮/输入/行内控件 `rounded-lg`(8)；pill `rounded-full`。游戏表面（KarutaCard 牌面、DuelBoard 棋格内层细框）例外 |
| 图标尺寸 | 仅 12（tiny 行内）/ 16（默认）/ 20（强调）三档；随控件尺寸等比的组件内部图标（Button loader、Avatar 首字）除外 |
| 遮罩三档 | Scrim `modal`（ink-deep/70+blur）/ `overlay`（black/50）/ `hint`（black/30 不吃点击）；业务代码禁自绘 `fixed inset-0` 遮罩 |
| 阴影 | 只用 `shadow-panel/card/gold/gold-lg/crimson/foil/modal` 七档 token，禁 boxShadow 字面量 |

中文渲染：`html` 开启 `text-wrap: balance`（标题）；正文 `font-synthesis-weight: none` 防止伪粗体糊字；字间距标题 `tracking-wide`。

### 1.3 间距与圆角

间距沿用 Tailwind 4px 网格。**区块间距语义**：页内区块 `gap-6`，卡片内 `gap-3`，表单字段 `gap-4`，页面左右安全边距 `px-4 md:px-6`。

**节奏铁律（2026-09-30）：外松内紧。** 组件内部收紧（`px-5 py-4` 为上限），组件之间拉开：
卡内 8–12px / 卡间 20–24px（`gap-5`）/ 区块间 ≥24px（`gap-6`/`mb-6`）/ 页面上下 32px（`py-8`）。
禁止用视口拉伸（`viewport-h` + `flex-1`）制造「填满感」——内容定高、允许首屏滚动；
高列表面板用 `max-h` + 内滚收口（如首页战场/排行榜 `max-h-[420px]`）。

| Token | 值 | 用途 |
| --- | --- | --- |
| `rounded` | 4px | 输入框、小按钮 |
| `rounded-lg` | 8px | 卡面、面板（默认） |
| `rounded-xl` | 12px | 对话框、大面板 |
| `rounded-full` | | 头像、徽章、 pill |

#### 1.3.1 分隔线与边框

三类边界各司其职，不得混用：

| 场景 | 类/值 | 说明 |
| --- | --- | --- |
| 面板外框 | `border` + `rgb(var(--accent-primary)/ 0.12)` | 墨色渐变卡片的统一描边 |
| 面板内部分区线 | `border-gold/10` | 面板头部/底部的暖金细线（首页、计分板、聊天室一致） |
| 表单控件边界 | `border-white/5`、`bg-white/5` 同族 | 输入框/徽章底色同族的低调边界，仅限表单语境 |

### 1.4 阴影与光晕

| Token | 定义 | 用途 |
| --- | --- | --- |
| `shadow-panel` | `0 2px 8px rgb(0 0 0 / .25)` | 面板默认 |
| `shadow-card` | `0 4px 16px rgb(0 0 0 / .3)` | KarutaCard 牌面 |
| `shadow-gold` | `0 0 15px rgb(var(--accent-primary) / .4)` | hover 聚焦 |
| `shadow-gold-lg` | `0 0 30px rgb(var(--accent-primary) / .6)` | 主 CTA、仪式瞬间 |
| `shadow-foil` | `0 0 12px rgb(var(--gold-foil) / .45)` | 金粉描边元素 |

**克制原则**：同一元素同时最多一种光效（发光 or 渐变 or 缩放动画，不许叠加三种）。

### 1.5 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `duration-fast` | 150ms | hover/active 反馈 |
| `duration-base` | 250ms | 面板/浮层过渡 |
| `duration-slow` | 400ms | 页面级进入 |
| `ease-standard` | `cubic-bezier(.4,0,.2,1)` | 常规过渡 |
| `ease-entrance` | `cubic-bezier(.34,1.56,.64,1)` | 弹入（徽章/奖励） |

微交互基准：按钮 hover 亮度提升 + `scale(1.02)`，active `scale(.97)`；牌面 hover 抬升 `translateY(-2px)`；全部走 token 时长。

入场动画唯一实现 = `FadeIn` 组件（`fadeUp` keyframes，0.4s ease-entrance）：CSS 墙钟驱动，后台标签页/低帧率下也会走完，不会卡在 `opacity:0`（framer-motion rAF 驱动实测会卡死在初始态，2026-09-30 回归）；`prefers-reduced-motion` 直接跳过。业务层禁止手写 motion 初始态（design:lint R12）。

### 1.6 状态完备性（组件硬性要求）

交互元素五种状态齐全：**hover / active / focus-visible / disabled / loading**。
- focus-visible 统一：`outline-none` + `ring-2 ring-gold/60 ring-offset-0`（键盘可见，鼠标不闪）
- disabled：`opacity-50 pointer-events-none`（不改变色相）
- loading：按钮内替换为 Spinner + 保留宽度（`min-w` 锁定）

列表类页面三态齐全：**loading**（骨架屏/Spinner）、**empty**（EmptyState 组件）、**error**（错误文案 + 重试按钮）。

## 2. 组件规范（`components/ui/`）

命名与 API 遵循最小惊讶：受控/非受控并存，`className` 透传。全部五状态 + 中文注释。

| 组件 | API 摘要 | 说明 |
| --- | --- | --- |
| `Button` | `variant: gold\|outline\|ghost\|danger` × `size: sm\|md\|lg`，`loading` | 替换 `btn-gold/btn-outline` 逐个使用点 |
| `Input` / `Textarea` / `Select` | label、error、hint 插槽；`size: sm\|md`（sm=筛选条紧凑档）；`fit` 收缩容器（内联使用） | 替换 `.input-dark` 散用；禁止裸 `<input>/<select>` |
| `SearchInput` | 内置 lucide 搜索图标 + 可清除按钮；`onClear` 控制清除钮显隐；`className` 控制容器宽度 | 牌库/牌组/选牌弹窗搜索栏唯一实现，禁止手写 icon 叠加 |
| `Dialog` | `open`、`onClose`、`title`、尺寸 | 替换手写 fixed 遮罩 |
| `Panel` | `title`、`actions`、padding 变体 | 卡面容器统一 |
| `Toast` | `useToast()` hook：`toast.success/error/info(text)` | 替换 RoomPage 内嵌 178 行 toast |
| `Spinner` | `size` | 全局唯一加载态 |
| `Badge` | `tone: gold\|crimson\|success\|muted` | 计数/标签 |
| `EmptyState` | icon(emoji)、title、desc、action | 牌库/列表空态 |
| `PanelSurface` | `variant: ink\|abyss\|void\|void-soft`、`radius`、`dashed`、`interactive` | 深景渐变面板底唯一实现（替代一切 inline 渐变容器） |
| `StatCard` | icon、label、value、`tone: gold\|gold-light\|foil\|success`、`compact` | 统计卡（Home/Profile 共用） |
| `SegmentedTabs` | `variant: pill\|bar\|chip`、`size: sm\|md` | 页签/分段器/选项片唯一实现 |
| `Toggle` | `tone: gold\|crimson\|warning`、`size: sm\|lg` | 拨杆开关（flex 主轴切换，无位移魔法值） |
| `Stepper` | value、onDecrease/onIncrease、`display`/`suffix`、`editable` | 步进器（步进数学留调用方） |
| `RangeInput` | value、onChange、min/max/step | 滑杆（替代裸 `<input type="range">`） |
| `IconButton` | `tone: gold\|neutral\|danger`、`shape: circle\|rounded`、`size: sm\|md` | 图标小按钮唯一实现（press 交互） |
| `Checkbox` / `Radio` | checked、indeterminate?/纯指示点 | 勾选/单选指示器 |
| `OptionCard` | `selection: radio\|checkbox\|none`、icon/title/desc/badge | 选项卡片唯一实现 |
| `Scrim` | `tone: modal\|overlay\|hint` | 遮罩唯一实现 |
| `ModalSurface` | open、onClose、title、size、padding、closable | 模态壳（Scrim+面板+ESC+动画） |
| `Menu` | 受控 open、trigger、items（render 自定义行） | 锚定菜单唯一实现 |
| `ProgressBar` | `tone: gold\|success\|warning\|danger`、shimmer | 进度条唯一实现 |
| `ActionBar` | children | 吸底批量操作条 |
| `AchievementUnlocked` | unlocks[] | 结算成就解锁框（仪式视觉保留） |
| `ListPageShell` | hero、toolbar（stickyToolbar）、children、bottom | 列表页模板壳 |
| `Avatar` | username、avatarUrl、size | 头像（自 components/ 晋升） |
| `FadeIn` | children、delay、y、className | 入场原语（§1.5，CSS keyframes 墙钟驱动）；业务层入场唯一出口 |
| `BrandGlow` | className | 装饰光晕唯一出口（auth 品牌时刻专用；design:lint R10 拦截散用 `bg-glow-radial`） |

> 退役记录：`Panel`（能力并入 PanelSurface 的 `title/actions`）、`Section`（0 调用孤儿）。`Input` 增加 `variant: boxed|bare`（bare=行内可编辑文本）。`ProgressBar` 增加 `danger` 档（读牌紧急红）。

图标体系：**`lucide-react`（唯一新增依赖）**。功能按钮 emoji → SVG 图标；emoji 仅保留庆祝/空状态/品牌瞬间（结算奖牌、空态插画、Logo）。

## 3. 页面改造清单（A3 顺序）

| # | 页面 | 重点 |
| --- | --- | --- |
| 1 | Home / Login / Register / Guest | 定调：display 字阶 + 金粉描边 + 输入组件化 |
| 2 | CardLibrary / Decks / DeckDetail | 卡片网格统一 shadow-card；列表三态；筛选栏组件化 |
| 3 | CardCreate（882 行） | 拆 `features/card-create/`：表单 hooks + 上传区组件；分步视觉 |
| 4 | NewRoom / JoinRoom / Profile | 表单分区面板化；Profile 统计卡 |
| 5 | **RoomPage（1420 行，37 useState）** | 拆 `features/room/` + `useRoomConnection/useGamePhase/usePreload/useChat`；战场信息层级：当前回合 > 牌面 > 比分；聊天降权重 |
| 6 | B1 同轮 | 服务端回合时钟接入（`start_at/ends_at` 倒计时以服务端为准） |

## 4. 实施约束

1. 新增依赖仅 `lucide-react`
2. 迁移期兼容：旧类名（`.btn-gold` 等）在 A2 完成替换后删除
3. 每个 Phase 收口：build 全绿 + 冒烟清单 + 前后截图对比
4. 触碰的文件函数级注释一律中文
5. **防回流**：`npm run design:lint`（`frontend/scripts/design-lint.mjs`，CI 见 release.yml）八条硬规则——R1 禁内置彩色类（白/黑中性豁免）、R2 禁离字阶任意字号（micro = `text-[10px]` 例外）、R3 禁 inline 渐变引用 CSS 变量、R4 禁十六进制色、R5 禁彩色 rgba()/rgb()/hsl() 字面量（黑白中性豁免；framer 动画色值走 `rgb(var(--…))`）、R6 禁业务层自绘遮罩（ui/ 原语豁免）、R7 禁 boxShadow 字面量、R8 禁 ui/ 外裸表单元素（`type="file"` 豁免；行内可编辑文本用 `Input variant="bare"`）
6. **布局契约**：全高内容页统一 `viewport-h`（= 视口 − `--header-h`，原 `battle-viewport` 已泛化更名），禁止 `calc(100vh-…)` 任意值
