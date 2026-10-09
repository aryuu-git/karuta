# 架构与技术栈

> 面向开发者的技术文档。玩法说明见 [gameplay.md](gameplay.md)，环境变量见 [configuration.md](configuration.md)，部署见 [deployment.md](deployment.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go 1.21 · chi · gorilla/websocket · modernc.org/sqlite（无 CGO） |
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · ffmpeg.wasm |
| 数据库 | SQLite（单文件，WAL 模式） |
| 实时通信 | WebSocket（30 秒一次性 ticket 鉴权） |
| 媒体存储 | 腾讯云 COS（唯一后端，支持 CDN 域名直连） |

## 目录结构

```
karuta/
├── backend/                        # Go 后端（自包含 module：karuta/backend）
│   ├── go.mod / go.sum             # Go 依赖定义
│   ├── cmd/                        # server / admin 程序入口
│   ├── config/                     # 配置读取与启动校验
│   ├── handler/                    # HTTP 处理器
│   ├── mask/                       # 遮罩生成器
│   ├── media/                      # 媒体服务（内容寻址去重）
│   ├── middleware/                 # JWT 中间件 + 限流
│   ├── model/                      # 数据模型
│   ├── security/                   # WS ticket + Origin 校验
│   ├── storage/                    # COS 存储（唯一媒体后端）
│   ├── store/                      # SQLite 数据访问层
│   └── ws/                         # WebSocket Hub + 游戏引擎
├── frontend/                       # React 前端（Web，自包含 package.json）
│   ├── index.html / vite.config.ts / tsconfig*.json
│   ├── package.json / package-lock.json
│   └── src/
│       ├── api/                    # API 客户端 + 类型定义
│       ├── components/             # 公共组件
│       ├── hooks/                  # 自定义 Hook
│       ├── pages/                  # 页面组件
│       └── utils/                  # 工具（ffmpeg.wasm 音频处理）
├── deploy/                         # 部署资产 + 可执行脚本
│   ├── nginx.conf                  # Nginx 配置（发布时安装到服务器）
│   ├── systemd/                    # systemd 服务模板
│   ├── karuta.env.example          # 环境变量模板
│   ├── README.md                   # 部署与回滚手册
│   └── scripts/                    # deploy/rollback 服务端脚本 + dev.ps1 本地启动
├── docs/                           # 技术文档（本文档所在）
├── data/                           # 所有产物：前端 dist、后端二进制、SQLite（gitignore）
└── README.md
```

## 关键设计

### 前后端对称自包含

- `frontend/` 自包含（package.json 在内），`cd frontend && npm run build`
- `backend/` 自包含（go.mod 在内，module 名 `karuta/backend`），`cd backend && go build ./...`
- 根目录不承载任何构建逻辑

### 媒体链路（服务器网络差的前提下设计）

1. **上传**：浏览器端 ffmpeg.wasm 先压缩/裁剪 → `media.Service` 计算内容寻址 key（`covers/<sha256>.<ext>`）→ 直写 COS（同字节自动去重，`media_assets` 表登记）
2. **下载**：API 返回的媒体 URL 直接指向 COS/CDN（`storage.SetMediaBaseURL`），客户端不经服务器中转；`/uploads` 路由仅对旧引用做 302 兜底
3. **删除**：真实引用计数归零后物理删除 COS 对象并清理 `media_assets` 记录
4. **前提**：bucket 公有读；CORS 需允许桌面端 WebView 来源

### 实时对局

- WS 连接必须先 `POST /api/ws-ticket` 换取 30 秒一次性、路径绑定的 ticket，JWT 不进 URL
- 服务端权威判定：抢牌以消息到达时间为准；`audio_ended` 只接受房主且校验 `round_id`
- 关键状态转移使用条件更新/事务；`aborted`/`end` 终态房间拒绝重连

### 产物归位

所有生成物统一在 `data/`（gitignore）：`data/dist`（前端构建）、`data/karuta-server.exe`（本地后端二进制）、`data/karuta.db`（SQLite）。构建时 ffmpeg.wasm 由 vite 插件从 `@ffmpeg/core` 自动拷入 `public/ffmpeg/`，同样不入库。

## 安全基线

- 生产环境拒绝默认/过短 JWT secret（`config.Validate()` 启动即校验）
- 生产默认仅监听 `127.0.0.1`，预期由同机 Nginx 反代
- 认证、上传、WS ticket、外部代理接口均有限流
- CORS 与全部线上 WebSocket 校验 Origin
