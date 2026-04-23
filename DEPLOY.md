# 🚀 部署与更新指南

## 服务器信息（填写你的）

```
服务器 IP：_______________
SSH 用户：root
域名（可选）：_______________
JWT 密钥：_______________（自己设一个，至少32位随机字符串，不要丢！）
```

---

## 一、首次部署

### 1. 本地编译（Windows PowerShell）

```powershell
cd D:\aryuu_workspace\karuta

# 交叉编译后端为 Linux 二进制
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -o karuta-server-linux ./cmd/server

# 编译前端
cd frontend
npm run build
cd ..
```

编译完成后，本地会有这些文件需要上传：

```
D:\aryuu_workspace\karuta\
├── karuta-server-linux       ← 后端二进制
├── frontend\dist\            ← 前端静态文件（整个目录）
└── nginx.conf                ← Nginx 配置（可选，首次用）
```

---

### 2. 手动上传文件到服务器

用 **SFTP 工具**（如 FileZilla、WinSCP、MobaXterm）连接服务器，上传以下内容：

| 本地路径 | 上传到服务器路径 |
|----------|----------------|
| `karuta-server-linux` | `/opt/karuta/karuta-server` |
| `frontend\dist\` 整个目录 | `/opt/karuta/frontend/dist/` |
| `nginx.conf`（首次） | `/etc/nginx/conf.d/karuta.conf` |

> **FileZilla 操作步骤**：
> 1. 文件 → 站点管理器 → 新建站点
> 2. 协议选 SFTP，主机填服务器 IP，用户名 root，密码登录
> 3. 连接后，左边找到本地文件，右边切换到目标目录，直接拖拽上传

---

### 3. 服务器上配置（SSH 进入后执行）

SSH 连接服务器（用 PuTTY 或 PowerShell）：

```bash
# 创建必要目录
mkdir -p /opt/karuta/frontend/dist
mkdir -p /data/uploads/audio /data/uploads/covers

# 给后端二进制加执行权限（每次更新后端都要执行）
chmod +x /opt/karuta/karuta-server

# 测试能否启动（看到 "listening on :8080" 就正常，Ctrl+C 退出）
JWT_SECRET=你的密钥 DB_PATH=/data/karuta.db UPLOAD_DIR=/data/uploads /opt/karuta/karuta-server
```

---

### 4. 配置 systemd（开机自启 + 崩溃自动重启）

```bash
# 创建 service 文件（把 JWT_SECRET 换成你的密钥！）
cat > /etc/systemd/system/karuta.service << 'EOF'
[Unit]
Description=Karuta Game Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/karuta
Environment=PORT=8080
Environment=JWT_SECRET=替换成你的密钥
Environment=DB_PATH=/data/karuta.db
Environment=UPLOAD_DIR=/data/uploads
ExecStart=/opt/karuta/karuta-server
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 启用并启动
systemctl daemon-reload
systemctl enable karuta
systemctl start karuta

# 确认运行状态
systemctl status karuta
```

---

### 5. 配置 Nginx

```bash
# 安装 nginx（如果没有）
apt install nginx -y

# 测试配置语法
nginx -t

# 启动 nginx
systemctl enable nginx
systemctl start nginx
```

Nginx 配置内容（上传的 `/etc/nginx/conf.d/karuta.conf`）：

```nginx
server {
    listen 80;
    server_name 你的IP或域名;

    # 允许上传最大 30MB（音频 20MB + 封面 5MB + 余量）
    client_max_body_size 30M;

    root /opt/karuta/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

配置完成后：
```bash
nginx -t && systemctl reload nginx
```

访问 `http://你的IP` 即可使用！

---

## 二、更新代码（每次改完代码后）

### 步骤一：本地重新编译

```powershell
cd D:\aryuu_workspace\karuta

# 编译后端（Linux 二进制）
$env:GOOS="linux"; $env:GOARCH="amd64"
go build -o karuta-server-linux ./cmd/server

# 编译前端
cd frontend
npm run build
cd ..
```

### 步骤二：手动上传更新的文件

| 改了什么 | 需要上传的文件 |
|----------|--------------|
| 只改了后端代码 | `karuta-server-linux` → `/opt/karuta/karuta-server` |
| 只改了前端代码 | `frontend\dist\` 整个目录 → `/opt/karuta/frontend/dist/` |
| 前后端都改了 | 两个都上传 |

### 步骤三：服务器上重启

```bash
# 如果更新了后端（必须执行）
chmod +x /opt/karuta/karuta-server
systemctl restart karuta

# 如果只更新了前端（不需要重启后端，nginx 自动生效）
# 无需操作
```

---

## 三、常用运维命令

在服务器上（SSH 进入后）：

```bash
# 查看后端实时日志
journalctl -u karuta -f

# 查看最近100行日志
journalctl -u karuta -n 100

# 手动重启后端
systemctl restart karuta

# 查看运行状态
systemctl status karuta

# 查看端口是否在监听
ss -tlnp | grep 8080

# 查看 nginx 错误日志
tail -f /var/log/nginx/error.log

# 查看磁盘空间（上传文件多了要注意）
df -h /data
```

---

## 四、HTTPS 配置（推荐，有域名才能用）

```bash
# 服务器上执行（需要有域名并指向服务器 IP）
apt install certbot python3-certbot-nginx -y
certbot --nginx -d 你的域名

# 证书自动续签（certbot 安装后通常已自动配置，可验证）
certbot renew --dry-run
```

配置好 HTTPS 后，WebSocket 会自动升级为 `wss://`，玩家连接更稳定。

---

## 五、数据备份

在服务器上执行备份：

```bash
# 备份数据库和上传文件
tar -czf /root/karuta-backup-$(date +%Y%m%d).tar.gz /data/karuta.db /data/uploads/
```

然后用 SFTP 工具把 `/root/karuta-backup-*.tar.gz` 下载到本地保存。

---

## 六、故障排查

| 现象 | 可能原因 | 排查命令 |
|------|----------|----------|
| 访问不了网页 | nginx 没启动 | `systemctl status nginx` |
| 网页有但 API 报错 | 后端没启动 | `systemctl status karuta` |
| WebSocket 断连 | nginx 缺 Upgrade 头 | 检查 nginx.conf 的 `/ws/` 配置 |
| 上传文件失败 | 目录权限问题 | `chmod 755 /data/uploads` |
| 上传文件报 413 | nginx 限制大小 | 检查 `client_max_body_size 30M` |
| 服务器重启后失效 | 没有 enable | `systemctl enable karuta nginx` |
| 更新后端没生效 | 忘了 chmod | `chmod +x /opt/karuta/karuta-server` |
