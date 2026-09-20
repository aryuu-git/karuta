# Karuta 上线改造 — 决策与交接记录（2026-09）

> 2026-09-19 架构审查发现九类根因问题，2026-09-20 分轮落地。本文合并原《架构改造方案》与 AI 交接清单：记录决策依据、执行过程与当前状态，供接手者与后续 AI 协作使用。

## 一、总原则

保持**模块化单体**：不拆微服务、不上 Kubernetes/Redis/PostgreSQL。要解决的是六个根因——发布不可回滚、媒体数据面经过弱网络源站、业务卡牌与媒体文件生命周期混杂、SQLite 与内存对局两套真相、前端缺设计系统、缺生产级安全/备份/监控基线。

## 二、九个问题的决策与落地状态

### 1. 远程部署麻烦且风险高

**问题**：`deploy.ps1` 本地编译 + scp 覆盖 + 重启，不可重复、不原子、无健康检查与备份，弱网直传不稳定。
**决策**：云端构建 + 服务器主动拉取 + 版本目录原子切换（`/opt/karuta/releases/<sha>` → `current` 软链），失败自动回滚；发布前 `karuta-admin backup-db` 一致性备份。
**状态**：✅ 已落地（`release.yml`、`deploy/scripts/`、systemd、nginx 模板）。待办：服务器 drain 命令（发布前拒绝新开局）。

### 2. 对象存储成本高、源站网络差

**问题**：媒体下载经弱网源站 302/代理，客户端全量预加载放大流量；COS 启动全桶扫描拖慢重启。
**决策**：数据面绕过源站——媒体只存 COS、API 直接返回 COS/CDN 绝对 URL；浏览器端 ffmpeg.wasm 先压缩/裁剪再上传；加载策略为"大厅预取前 3 段、游戏中滚动预取下 2 段"；停止启动时扫描 COS（改为显式开关）。
**状态**：✅ 直连已落地（含 32MB wasm 出库、构建自动生成）；⏳ 未做：上传侧预签名/临时凭证 + 完成确认、CDN 防盗链、签名 URL、媒体标准化（30-45s/128kbps 派生版本，当前由浏览器端处理替代）。

### 3. 前端"小作坊感"，缺产品一致性

**问题**：功能增长快于设计系统，主包 653KB（gzip 183KB）。
**决策**：路由懒加载 + 滚动媒体预取；设计 token 与基础组件分阶段落地，不全站重写；视觉方向"日式编辑感 + 竞技感"，emoji 只用于品牌瞬间。
**状态**：✅ 分包落地（主包 178KB / gzip 58KB）；⏳ token/基础组件未开始。

### 4. 媒体资产模型会破坏共享数据

**问题**：卡牌直接持有物理文件路径，删除副本可能删坏共享媒体。
**决策**：`media_assets` 表做内容寻址登记（`sha256 + kind` 唯一），删除前按数据库真实引用计数判断，GC 不依赖可竞争的 `ref_count`。
**状态**：✅ 已落地（`backend/media/` + 上传接线 + 引用测试）；⏳ 待办：资产状态机（pending_upload → ready → pending_delete）与 `media gc` 管理命令。

### 5. 实时对局一致性与公平性不足

**问题**：客户端 `audio_ended` 可伪造结束；多步状态更新非原子。
**决策**：服务端权威判定（消息到达时间定胜负），`audio_ended` 限房主且校验 `round_id`；关键状态转移用条件更新/事务；终态房间拒绝重连。
**状态**：✅ 已落地；⏳ 待办：服务端权威回合时钟（`start_at`/`ends_at`/幂等 command ID），当前仍由房主触发结束。

### 6. 模块边界与重复基础设施

**问题**：三套游戏各自维护 store/hub/会话，基础设施重复。
**决策**：Owner 裁定**产品收敛为网页端 + 歌牌单玩法**——CCP、Quadrant 模块整体删除（前端、后端、路由），数据库表保留不迁移。原"统一三套 WS"的方案随之失效，只剩一套。
**状态**：✅ 已落地。

### 7. 数据库与迁移

**决策**：SQLite 保持单文件 + WAL + 外键 + 单连接池 + `busy_timeout`；向前兼容迁移（`CREATE IF NOT EXISTS`/`ALTER`），`schema_migrations` 记录版本；破坏性迁移必须维护窗口，回滚二进制不等于回滚数据库。
**状态**：✅ 已落地。

### 8. 安全与身份基线

**问题**：固定邀请码、用户名隐式授管理员、JWT 暴露在 WS URL、无 CORS/限流基线。
**决策**：邀请码事务内一次性消费；管理员显式授权并审计（`set-admin`）；WS 改 30 秒一次性 ticket；生产拒绝默认 secret；认证/上传/代理接口限流；游客登录发放恢复凭据（丢失不可找回，不回退"用户名即可接管"）。
**状态**：✅ 已落地。

### 9. 进程生命周期、可观测性与数据增长

**决策**：`/healthz`、`/readyz`、`/version`、信号优雅停机、启动时把无法恢复的房间标记 `aborted`。
**状态**：✅ 已落地；⏳ 待办：指标暴露、费用/异常流量告警、CDN 命中率统计、WAL checkpoint 观测。

### 明确不做的事（当时裁定，仍然有效）

- 不拆微服务、不上 K8s/Redis/PostgreSQL。
- 不做全站 UI 重写；设计系统按组件渐进。
- 不做客户端全量预加载优化以外的"准点加载"黑科技。
- 不用裸 `ref_count` 做删除依据。

## 三、落地全记录（2026-09-20 分轮执行）

**首轮**：CI 原子发布体系、健康检查、SQLite 加固、安全基线、WS ticket、前端分包、三套游戏规则收紧、媒体删除安全——详见下方"已完成并验证"。

**二轮精简（Owner 决策：产品 = 网页端 + 歌牌，媒体只存 COS）**：删除 CCP（CG猜谜）与 Quadrant（猜象限）模块前后端与路由；删除 Tauri/Capacitor 原生 App 支持（`mediaCache`、`IS_NATIVE`、`useCachedUrl`、`CachedImg`、`SettingsPage`、capacitor/tauri 配置与依赖）；删除服务器本地存储（`backend/storage/local.go`、`UPLOAD_DIR`/`COS_ENABLED`/`COS_MIGRATE_ON_START`、`migrateLocalToCOS`、`cmd/test-cos`、`/uploads` 本地 fallback）。数据库表保留不迁移，数据无损。

**三轮清理（目录收敛）**：删除 `DEPLOY.md`、`deploy.ps1`、`cmd/migrate-library`、过时设计文档、空 `uploads/`、`server.exe`、`Makefile`。根目录收敛为 2 个散文件 + 6 个目录。

**frontend 盘点（"纯前端"化）**：删除 `.env.capacitor`/`.env.tauri`、空 `uploads/`、误生成的数据库副本；**32MB `ffmpeg-core.wasm` 出库**（vite 插件从 `@ffmpeg/core` 构建时生成）；`npm ci` 清理依赖残留。

**四轮（产物归位 + 死代码终审）**：所有产物统一 `data/`——vite `outDir → ../data/dist`、dev.ps1 二进制 → `data/karuta-server.exe`、CI 打包路径同步。扫描 `backend/` 235 个导出函数，删除 4 个零引用方法（`CountCards`/`SetPublic`/`DeleteByCardID`/`SetDisabled`，均被新实现取代）。

**五轮（backend 自包含 module）**：`go.mod`/`go.sum` 与 `cmd/` 移入 `backend/`，module 改名 `karuta/backend`，import 路径零改动。Go 命令约定在 `backend/` 内执行；CI `working-directory: backend`、Go 缓存指向 `backend/go.sum`。

**六轮（文档体系）**：README 410→76 行只留门面；游戏规则迁 `docs/gameplay.md`；新建 `docs/architecture.md` 与 `docs/configuration.md`；运维手册迁 `docs/deployment.md`；本文件合并原《架构改造方案》与 AI 交接清单。

## 四、当前已完成并验证（首轮总表）

| 方向 | 已落地内容 | 主要位置 |
| --- | --- | --- |
| 发布与回滚 | GitHub Actions 产物构建、校验、服务器拉取、版本目录和 `current` 原子切换；部署前 SQLite 备份、回滚脚本、systemd/Nginx/环境模板 | `.github/workflows/release.yml`、`deploy/` |
| 运行基线 | `/healthz`、`/readyz`、`/version`、构建版本、HTTP 超时、信号优雅停机、启动时中止无法恢复的进行中房间 | `backend/cmd/server/main.go` |
| SQLite | WAL、外键、5 秒忙等待、单连接池；迁移失败不再静默忽略；`schema_migrations` 与 schema 版本就绪检查 | `backend/store/db.go` |
| 媒体安全 | 共享封面/音频/头像仅在真实引用归零后删除；上传统一走 `media.Service`（内容寻址去重） | `backend/handler/card.go`、`backend/handler/auth.go`、`backend/media/` |
| 媒体直连 | COS 模式下 `FileURL`/`MediaURL` 直接输出 COS/CDN 绝对 URL；`/uploads` 302 仅作旧引用兜底 | `backend/storage/storage.go`、`cmd/server/main.go` |
| COS 运行成本 | 启动时不再默认扫描整个 COS 或修复缓存头；相应任务改为显式开关；COS 请求增加超时 | `backend/config/config.go`、`backend/storage/cos.go` |
| 网络与安全 | 生产环境拒绝默认/过短 JWT secret；默认仅环回监听；HTTP CORS 与 WebSocket 校验 Origin；认证、上传、WebSocket ticket 等接口限流 | `backend/config/`、`backend/security/`、`backend/middleware/` |
| WebSocket | JWT 不再出现在房间 WS URL；改为路径绑定、30 秒、一次性 ticket | `backend/security/ws_ticket.go`、`backend/handler/ws.go` |
| 用户与管理 | 取消用户名自动管理员和固定邀请码；邀请码开关持久化；管理变更审计；防止撤销最后一个启用管理员；游客恢复凭据 | `backend/store/system_store.go`、`backend/handler/auth.go`、`backend/cmd/admin/` |
| 实时规则 | `audio_ended` 只接受房主且必须匹配 `round_id`；`card_start` 附带后续音频 URL；关键状态转移使用条件更新或事务；终态房间拒绝重连 | `backend/ws/`、`backend/handler/` |
| 客户端传输 | 路由懒加载；主包从约 653KB / gzip 183KB 降至约 178KB / gzip 58KB；大厅预取首 3 段音频、游戏滚动预取 | `frontend/src/App.tsx`、`frontend/src/pages/RoomPage.tsx` |
| 外部代理 | Bangumi 仅允许指定 HTTPS 主机、限制响应大小、有界缓存 | `backend/handler/bangumi.go` |

已通过的验收：`go build ./...`、`go test ./...`（backend/ 内 8 包）、`npm run build`（含 tsc）、Linux 交叉编译两二进制、`git diff --check`。

## 五、兼容性与上线边界

- **COS 是唯一媒体后端**（凭据必填，`Validate()` 启动即校验）：既有 UUID 资源与旧引用经 `/uploads` 302 到 COS 继续可访问，前提是对象已在 COS 上。新哈希 key 只从接线后的新上传产生。
- 数据库迁移向前兼容；二进制回滚不等于数据库回滚，破坏性迁移必须维护窗口。
- 生产默认监听 `127.0.0.1`，由 Nginx 反代；新 WS ticket 要求前端先调 `/api/ws-ticket`，反代放行该 API 与 WS Upgrade。
- 游客恢复凭据丢失后无法找回同名身份——这是设计结果，不回退。
- 尚未执行远程发布：缺域名/TLS/服务器 SSH/COS 生产凭据。

## 六、尚未完成（P1/P2）

**P1**
1. 服务端权威回合时钟：`start_at`、`ends_at`、`round_id`、幂等 command ID；客户端只报告缓冲/失败。
2. 上传侧 COS 预签名/临时凭据 + 完成确认（下载侧已完成）；未配 CDN 域名时直连 bucket，单价高于 CDN，申请后仅需配置 `COS_CDN_DOMAIN`。
3. 资产生命周期：`pending_upload → ready → pending_delete → deleted/failed`，`media gc --dry-run` 按真实引用清理孤儿。
4. 用户配额、单日上传额度、可观测指标；从源头生成 30-45 秒、96-128kbps 游戏音频与 WebP 封面。

**P2**
1. 设计 token 与 Button/Input/Dialog/Panel/Toast 基础组件；先拆 `RoomPage.tsx` 和 `CardCreatePage.tsx`。
2. 移除核心路径 `any`，WS 协议集中成 TypeScript 类型/Schema；Web 端截图基线。
3. 管理 `drain`：拒绝新开局、广播维护、等待活跃对局或超时再发布。
4. 备份恢复演练、WAL checkpoint 观测、费用告警、CDN 命中率统计。
5. 内容治理：资源冻结、举报/下架、上传来源审计、版权联系入口、软删除保留期。

## 七、交付运维需要的非代码信息

服务器 SSH 用户与地址、部署根目录、正式域名与证书策略、COS bucket/region/CDN 域名、GitHub Actions 产物可访问方式、数据库备份目标（媒体不在服务器上，无需备份上传目录）。到位后按 `docs/deployment.md` 填 `deploy/karuta.env.example` 副本，先在测试机做一次发布和一次回滚演练。

生产发布顺序：备份 → 获取制品 → SHA-256 校验 → 解压新 release → `/readyz` 检查 → 原子切换 `current` → reload/restart → 保留上一 release。失败保留当前线上版本并使用 `rollback-server.sh`。

## 八、建议提交切分（9 组）

1. `feat(deploy): atomic releases, health checks, rollback`
2. `fix(storage): safe media lifecycle and local upload hardening`
3. `fix(security): origins, rate limit, ws tickets, guest recovery, admin audit`
4. `fix(realtime): transactional transitions and restart abort handling`
5. `perf(frontend): route splitting and rolling media prefetch`
6. `feat(media): content-addressed assets`
7. `refactor: drop server-local storage; COS is the only media backend`
8. `refactor: remove CCP, Quadrant and native client modules`
9. `docs: architecture remediation and AI handoff`

提交前逐组复核 `git diff -- <files>`。
