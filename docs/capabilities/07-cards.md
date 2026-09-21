# 07 · 牌库与牌组（内容中枢与阵容管理）

## 能力概览

牌库是内容中枢，2026-09-21 完成「管理器 → 收藏馆」重塑：3:4 网格牌面（`CardTile`，
复制对局牌面的和纸×金粉质感基因、独立实现零回归风险）、右侧详情抽屉（音频逐条
试听 + 波形）、底部批量浮条（加入牌组/设共享/加标签/删除/导出）、库内试听、点赞、
牌包导入导出。数据面：双页签（我的/万牌共享）**全部服务端分页 + 三排序**（最新/
名称/使用次数）+ 关键词/标签服务端筛选（标签精确 token，见边界 #1 修复记录）；
列表带音频总时长聚合。造牌为四步向导（音频状态机 → 信息 → 提示/共享 → 提交），
音频经浏览器端 ffmpeg.wasm 可选压缩/裁剪，时长实测上行为 B1 权威回合时钟数据源。

## 能力清单

| # | 能力点 | 行为说明 | 实现位置 |
|---|---|---|---|
| 1 | 网格牌面 | 3:4 卡片网格（2/3/4/5 列响应式）；无封面卡按 id 种子确定性渐变占位（首字压中，`—` 消灭）；卡角「N 首 · 时长」+ 共享级别语义色徽标；金边 hover | `components/CardTile.tsx` |
| 2 | 详情抽屉 | 右侧滑出：大封面、**音频逐条试听**（单实例 audio + 进度）、**波形条**（Web Audio 解码峰值，失败静默降级）、播放提示预览、标签 chips、「被 N 个牌组使用」、点赞、操作组（加入牌组/导出/编辑/复制/删除按 owner 身份显隐） | `components/CardDrawer.tsx` |
| 3 | 库内试听 | 卡片 hover ▶ 播第一首（首音频 URL 缓存，全局单响）；打开抽屉时停播 | `CardLibraryPage.tsx:togglePreview` |
| 4 | 双页签服务端分页 | 我的/万牌共享均 `page/size(≤100)` 服务端分页（60/页），`keepPreviousData` 防闪烁；**我的收藏筛选同为服务端**（search LIKE + tag 精确） | `store/card_store.go:ListByOwner/ListPublic`；`api/queries.ts` |
| 5 | 排序 | latest（默认）/ name / plays（`game_records` 聚合被抢次数）；白名单回退 latest | `store/card_store.go:cardOrderBy` |
| 6 | 标签精确过滤 | 公共片段 `appendCardTagFilter` 两路共用：逗号包围 + 去空格规范化 + `%/_` 转义 ESCAPE（修复过子串误中与通配符注入两重缺陷） | `card_store.go`；回归 `TestListPublicTagExactMatch` |
| 7 | 点赞 | `POST /api/cards/{id}/like`：INSERT OR IGNORE 命中=赞、冲突=取消；列表带 likes + liked_by_me（viewer 参数化 EXISTS）；牌面心形 + 抽屉心形双入口（in-flight 守卫防连击） | `store/card_store.go:LikeToggle`；`CardTile/CardDrawer` |
| 8 | 批量操作浮条 | 多选态底部浮条：全选/已选 N/加入牌组/设共享三档/加标签/删除/完成；批量删除逐张成败统计（失败保留选中可重试）；批量加标签 owner 逐卡校验尽力而为 | `CardLibraryPage.tsx`；`handler/card.go:BatchUpdateTags` |
| 9 | 加入牌组 | 单卡（抽屉）+ 批量（浮条）→ 牌组选择弹窗 → `AddCardsToDeck`（含 S2 可见性校验：他人 private 卡不可塞入） | `CardLibraryPage.tsx`；`handler/deck.go` |
| 10 | 牌包导出/导入 | 导出：选中卡/抽屉单卡 → `manifest.json` + 封面/音频二进制 zip；导入：解析后走 create/addAudio 重建，**一律默认私有**，无封面占位图兜底，成败计数 toast；jszip 动态加载不进主包 | `utils/cardPack.ts` |
| 11 | 波形 | `extractPeaks`（fetch+decodeAudioData → 28 峰值）；抽屉内联条形波形已播金色高亮；解码失败缓存 null 不重试（CORS/格式静默降级） | `utils/waveform.ts`；`components/Waveform.tsx` |
| 12 | 造牌四步向导 | 音频（多选状态机 queued→transcoding→uploading→done/failed，单文件重试）→ 信息（牌名/作品名/封面/标签）→ 提示/共享 → 提交（失败音频单独补传）；编辑模式同构 | `pages/CardCreatePage.tsx`；`features/card-create/*` |
| 13 | 媒体安全 | 上传走内容寻址去重（sha256+kind）；删除按真实引用计数，克隆共享物理对象防误删；配额超限 413；DeleteCard 四表单事务 | `media/service.go`；`handler/card.go`；`store/card_store.go` |
| 14 | 权限门 | GetCard 可见性门（owner 或非 private，无权 404 不暴露存在性）；写操作 owner-only；UpdateAudio 归属校验（IDOR 修复）；share_level 值域白名单三处 | `handler/card.go`（回归 `card_deck_security_test.go`） |
| 15 | 牌组三页签与创建（牌组层） | 我的/协作/公共三页签；创建弹窗含共享级别 + 编辑权限（editable 时显 add_only/full）；关键词本地筛选、公共页创建人服务端筛选 | `pages/DecksPage.tsx`；`handler/deck.go` |
| 16 | 牌组封面拼贴（v8） | 列表 SQL 聚合每组前 4 张成员卡封面（嵌套相关子查询 GROUP_CONCAT，运行时回归钉死）→ 牌组卡 2×2 拼贴；无封面回退确定性渐变 + 首字 | `store/deck_store.go`；`handler/deck.go:populateDeckCovers`；`DecksPage.tsx` |
| 17 | 牌组点赞（v8） | `deck_likes` 表（迁移 v8）；toggle 与 card_likes 同构；三列表带 likes/liked_by_me；列表卡右上心形 + 详情页头部心形（in-flight 守卫） | `store/deck_store.go:LikeToggle`；`DecksPage.tsx`、`DeckDetailPage.tsx` |
| 18 | 牌组包导入/导出（v8） | manifest（牌组元数据 + 全卡元数据与媒体）zip：详情页「导出」升级自旧封面 zip；列表页「导入」→ 建私有牌组 + 逐卡重建 + 批量入组，成败计数 toast | `utils/deckPack.ts` |
| 19 | 牌组内排序（v8） | 排序模式：网格序号角标 + ↑↓ 本地交换 + 「保存顺序」→ `POST /api/decks/{id}/reorder`（单事务；owner 或 editable+full）；对局按此序入场 | `store/deck_card_store.go:Reorder`；`DeckDetailPage.tsx` |
| 20 | 详情页牌面网格 | 牌组卡区复用 `CardTile` 网格 + `CardDrawer`（与牌库同一视觉语言；抽屉牌组语境不提供「加入牌组」）；试听、多选移除沿用 | `DeckDetailPage.tsx` |
| 21 | 牌组权限门 | 前端 isOwner/canAdd/canRemove 与后端 canPlayDeck/canAddCardToDeck/canRemoveCardFromDeck 一一对齐；GetDeck 无权 **404 防枚举**（v8 与 GetCard 统一）；share/edit 值域白名单 | `handler/deck.go`（回归 `card_deck_security_test.go`、`deck_enhance_test.go`） |

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 标签历史修复记录 | 曾存在子串误中（游戏⊂小游戏）与 `%/_` 通配符注入（tag=% 匹配全部）；前端「我的收藏」同病——双端已修并回归钉死 | 已修复 |
| 2 | 波形依赖媒体桶 CORS | fetch 音频二进制需桶配 CORS；未配则波形静默消失、试听不受影响 | 运维项 |
| 3 | 可给自己点赞 | 后端未禁本人点赞（计数含本人） | 产品可接受，记录 |
| 4 | 导入无 zip 炸弹防护 | 客户端不解压大小限制；后端上传上限逐卡拦截（20MB 音频/5MB 封面），失败计数不拖垮整包 | 记录 |
| 5 | CreateCard 死参数 | `isShared` 形参被 SQL 硬编码覆盖（建卡固定 playable 后续 Update 改） | 代码异味，记录 |
| 6 | 自定义标签芯片不持久化 | 造牌页 customTags 为页内 state，刷新丢芯片（标签值仍存卡上） | 候选优化 |
| 7 | 名称搜索为子串 LIKE | display_text/series 模糊匹配是合理语义（与标签精确语义并存） | 设计现状 |
| 8 | 牌组页静默失败修复记录 | 详情页曾有 7 处 `catch{ignore}`（共享×2/加卡/移除/克隆/导出/批量移除）——全部补 toast，共享失败回滚乐观态为服务端值（2026-09-21） | 已修复 |
| 9 | 旧「牌组封面 zip」升级为牌组包 | 旧导出仅封面无元数据不可导入；v8 导出为 manifest 牌组包（可跨机重建），旧格式无需兼容导入 | 升级语义 |
| 10 | 排序权限 | 重排需 owner 或 editable+full（与删卡同权）；add_only 协作者只能加卡不能定序 | 设计现状 |
| 11 | 导入牌组为私有 | 导入一律建私有牌组 + 卡片私有（安全默认），导入后自行公开 | 设计现状 |

## 验证记录（2026-09-21）

**后端**：`go test ./...` 13 包全绿——`TestListPublicTagExactMatch`（精确命中/注入空集/排序稳定）、`TestGetCardVisibilityGate`（private 404/owner 200/playable 200）、`TestShareLevelValueDomain`（四类垃圾值 400）、`TestUpdateAudioRejectsCrossCardAudio`、`TestAddCardsToDeckRejectsInvisibleCards`。
**前端**：tsc 零错误 · vitest 81/81（含 roomCreate 17 位置参数映射回归、LoginPage 回跳 4 条）· build 绿；主包 341.0KB（CardTile/Drawer/波形/牌包均在路由 chunk，framer 零进主包）。
**牌组层（v8，2026-09-21）**：迁移 v8 `deck_likes`；`TestDeckListCoversAndLikes` 运行时实证——拼贴嵌套子查询执行、点赞 toggle 往返、liked_by_me 按视角区分、`Reorder` 后拼贴序同步；`TestListActivePrivateVisibility`（大厅可见性）同轮新增。前端 tsc 零错误 · 81/81 · build 绿。

**诚实边界**：牌库视觉与试听/波形/导入导出、牌组拼贴/排序/牌组包为代码级验证，浏览器级实测建议 dev 过一轮（波形效果取决于媒体桶 CORS 配置）。
