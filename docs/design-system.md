# Karuta 设计系统（和风歌牌）

> 视觉宪法：和纸质感背景、樱花粉×金粉主色、金色光晕、Noto Serif JP 书卷气、KarutaCard 牌面质感。
> 本文档是前端美化的唯一依据：token 定义于 `frontend/src/index.css`，Tailwind 映射于 `frontend/tailwind.config.js`。
> 配色原则：**美化是把现有风格做精致，不是换风格。**

## 1. 设计 token

### 1.1 色彩（樱花粉主题）

所有颜色以 **RGB 三元组** CSS 变量存储，Tailwind 通过 `rgb(var(--x) / <alpha-value>)` 消费——任意透明度修饰符（`/50`）自动生效。

#### 语义色（唯一主题：樱花粉）

| Token | 角色 | 值 |
| --- | --- | --- |
| `ink` | 主背景/重文字 | `68 32 56` #442038 |
| `ink-deep` | 深背景/输入框底 | `56 24 48` #381830 |
| `gold` | **主强调（樱花粉）** | `248 176 200` #f8b0c8 |
| `gold-light` | 强调亮阶 | `253 216 232` #fdd8e8 |
| `gold-dark` | 强调暗阶 | `240 144 176` #f090b0 |
| `crimson` | 强调红粉（警示/对抗） | `248 112 144` #f87090 |
| `crimson-light` | 红粉亮阶 | `255 152 176` #ff98b0 |
| `surface` | 卡面/面板底 | `85 42 64` #552a40 |
| `surface-elevated` | 浮层面板 | `102 48 74` #66304a |
| `border` | 描边 | `136 72 104` #884868 |
| `muted` | 次级文字 | `232 192 212` #e8c0d4 |
| `body-bg` / `body-text` | 页面底/正文 | #442038 / #fef8fa |

> ⚠️ 历史遗留：`gold` 系实际是**樱花粉**。保留类名不改（150+ 调用点），真金粉另有 token。

#### 点缀色（跨主题恒定）

| Token | 角色 | 值 |
| --- | --- | --- |
| `gold-foil` | **金粉**（真金，光晕/描金/徽记） | `212 167 106` #d4a76a |
| `success` | 成功 | `74 222 128` #4ade80 |
| `warning` | 警告 | `251 146 60` #fb923c |
| `danger` | 危险/扣分 | `248 113 113` #f87171 |
| `info` | 信息 | `96 165 250` #60a5fa |

#### 内置色迁移策略

Tailwind 内置 `pink-300` / `pink-500` 在 config 层**重映射**到语义变量（老类名自动适配主题），**新代码禁止使用一切 Tailwind 内置色名**；`green/orange` 系为历史状态色，等价于 `success/warning`，逐步迁移。`text-white` 系（128 处）保持——中性白跨主题恒定；正文优先 `text-body`。

### 1.2 字阶

字体族：标题/牌面/仪式性文字 = `font-serif`（Noto Serif JP），界面/数据 = `font-sans`（system-ui）。

| Token | Tailwind | size/line-height | 字体 | 用途 |
| --- | --- | --- | --- | --- |
| display | `text-display` | 40/48 | serif 700 | 页面主标题、结算名次 |
| title-xl | `text-title-xl` | 30/38 | serif 700 | 区块主标题 |
| title | `text-title` | 20/28 | serif 500 | 卡片/面板标题 |
| body-lg | `text-body-lg` | 17/26 | sans | 首要正文 |
| body | `text-body` | 16/24 | sans | 默认正文 |
| caption | `text-caption` | 14/20 | sans | 辅助说明 |
| tiny | `text-tiny` | 12/16 | sans | 角标/时间戳 |

中文渲染：`html` 开启 `text-wrap: balance`（标题）；正文 `font-synthesis-weight: none` 防止伪粗体糊字；字间距标题 `tracking-wide`。

### 1.3 间距与圆角

间距沿用 Tailwind 4px 网格。**区块间距语义**：页内区块 `gap-6`，卡片内 `gap-3`，表单字段 `gap-4`，页面左右安全边距 `px-4 md:px-6`。

| Token | 值 | 用途 |
| --- | --- | --- |
| `rounded` | 4px | 输入框、小按钮 |
| `rounded-lg` | 8px | 卡面、面板（默认） |
| `rounded-xl` | 12px | 对话框、大面板 |
| `rounded-full` | | 头像、徽章、 pill |

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
| `Input` / `Textarea` / `Select` | label、error、hint 插槽 | 替换 `.input-dark` 散用 |
| `Dialog` | `open`、`onClose`、`title`、尺寸 | 替换手写 fixed 遮罩 |
| `Panel` | `title`、`actions`、padding 变体 | 卡面容器统一 |
| `Toast` | `useToast()` hook：`toast.success/error/info(text)` | 替换 RoomPage 内嵌 178 行 toast |
| `Spinner` | `size` | 全局唯一加载态 |
| `Badge` | `tone: gold\|crimson\|success\|muted` | 计数/标签 |
| `EmptyState` | icon(emoji)、title、desc、action | 牌库/列表空态 |

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
