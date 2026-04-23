# 🌸 歌牌 Karuta

一个在线多人歌牌（かるた）游戏。玩家自建牌组，上传音频和封面，创建房间一起抢牌。

---

## 功能特性

- 👤 账号系统（注册/登录，JWT 鉴权）
- 🃏 自建牌组（上传音频 + 封面图，支持 mp3/wav/m4a/flac/ogg/aac）
- 🏯 实时多人对战（WebSocket，10人+房间）
- 🎮 两种游戏模式：
  - **自动模式**：按设定间隔自动放歌，倒计时进入下一首
  - **裁判模式**：房主充当裁判，手动选择并播放每一首
- ⚡ 服务端权威抢牌判定（防作弊）
- 🔊 抢对/抢错实时音效 + 全房公告
- 📱 响应式设计，支持桌面和手机

---

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Go · chi · gorilla/websocket · modernc.org/sqlite |
| 前端 | React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion |
| 数据库 | SQLite（单文件，WAL 模式） |
| 实时通信 | WebSocket |
| 文件存储 | 本地文件系统（./uploads/） |

---

## 本地开发启动

### 需要准备

- **Go 1.21+**（[下载](https://golang.org/dl/)）
- **Node.js 18+** + npm（[下载](https://nodejs.org/)）
- **Git**

### 启动步骤

**方式一：双击启动脚本（Windows）**

```
双击 dev.bat
```

脚本会自动：
1. 关闭占用 8080/5173 端口的进程
2. 编译后端
3. 编译前端
4. 启动后端（:8080）和前端开发服务器（:5173）

**方式二：手动启动**

```bash
# 终端1 — 后端
cd karuta
go run ./cmd/server

# 终端2 — 前端
cd karuta/frontend
npm install    # 首次需要
npm run dev
```

打开浏览器访问 **http://localhost:5173**

### 环境变量（可选，有默认值）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8080 | 后端监听端口 |
| JWT_SECRET | karuta-secret-key | JWT 签名密钥，生产环境务必修改 |
| DB_PATH | ./karuta.db | SQLite 数据库文件路径 |
| UPLOAD_DIR | ./uploads | 音频/封面文件存储目录 |

---

## 服务器部署

### 方式一：直接部署（推荐）

**1. 编译**

```bash
# 编译前端
cd karuta/frontend
npm install
npm run build

# 编译后端（生成单二进制）
cd karuta
go build -o karuta-server ./cmd/server
```

**2. 上传文件**

将以下文件上传到服务器：
```
karuta-server          # 后端二进制
frontend/dist/         # 前端静态文件
nginx.conf             # Nginx 配置（可选）
```

**3. 启动后端**

```bash
# 设置生产环境变量
export JWT_SECRET=你的密钥
export DB_PATH=/data/karuta.db
export UPLOAD_DIR=/data/uploads
export PORT=8080

# 后台运行
nohup ./karuta-server > karuta.log 2>&1 &

# 或使用 systemd（推荐）
```

**4. 配置 Nginx**

```nginx
server {
    listen 80;
    server_name 你的域名;

    # 前端静态文件
    root /var/www/karuta/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }

    # WebSocket（重要：需要 upgrade）
    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # 上传文件
    location /uploads/ {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

**5. HTTPS（强烈推荐）**

```bash
# 使用 certbot
certbot --nginx -d 你的域名
```

### 方式二：Docker

```dockerfile
# Dockerfile（参考）
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN cd frontend && npm install && npm run build
RUN go build -o karuta-server ./cmd/server

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/karuta-server .
COPY --from=builder /app/frontend/dist ./frontend/dist
EXPOSE 8080
CMD ["./karuta-server"]
```

---

## 目录结构

```
karuta/
├── cmd/server/main.go          # 程序入口
├── internal/
│   ├── config/                 # 配置读取
│   ├── handler/                # HTTP 处理器
│   ├── middleware/             # JWT 中间件
│   ├── model/                  # 数据模型
│   ├── store/                  # SQLite 数据访问层
│   └── ws/                     # WebSocket Hub + 游戏引擎
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── api/                # API 客户端 + 类型定义
│   │   ├── components/         # 公共组件
│   │   ├── hooks/              # 自定义 Hook
│   │   └── pages/              # 页面组件
│   └── dist/                   # 构建产物（git 忽略）
├── uploads/                    # 上传文件（运行时生成）
├── karuta.db                   # SQLite 数据库（运行时生成）
├── dev.bat                     # Windows 一键启动脚本
├── nginx.conf                  # Nginx 配置参考
└── README.md
```

---

## 游戏玩法

1. **注册账号** → 创建牌组 → 上传牌（封面图 + 音频）
2. **创建房间**：选择牌组、设置间隔时长（3-30秒）、选择模式
3. **分享邀请码**给朋友，或让朋友在大厅直接加入
4. **房主开始游戏**：音乐响起，谁先点对应的牌谁得分
5. 点错牌扣1分，全部牌抢完后结算排名

---

## 注意事项

- 上传的音频文件最大 **20MB**，封面图最大 **5MB**
- 支持音频格式：mp3、wav、m4a、flac、ogg、aac
- 生产环境请修改 `JWT_SECRET` 环境变量
- `uploads/` 和 `karuta.db` 需要持久化存储（云服务器挂载数据盘）
- WebSocket 需要 Nginx 配置正确的 `Upgrade` 头，否则实时功能失效
