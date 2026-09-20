# 配置说明

> 所有配置通过环境变量注入（生产部署写在 `/opt/karuta/shared/karuta.env`，模板见 [deploy/karuta.env.example](../deploy/karuta.env.example)）。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 8080 | 后端监听端口 |
| BIND_ADDR | 开发为空；生产为 127.0.0.1 | 后端监听地址；仅在明确需要直连时改为 `0.0.0.0` |
| JWT_SECRET | karuta-secret-key | JWT 签名密钥；生产环境至少 32 个字符 |
| DB_PATH | ./data/karuta.db | SQLite 数据库文件路径 |
| COS_SECRET_ID | — | 腾讯云 SecretId（**必填**） |
| COS_SECRET_KEY | — | 腾讯云 SecretKey（**必填**） |
| COS_BUCKET | karuta-1321249409 | COS Bucket 名称 |
| COS_REGION | ap-shanghai | COS 地域 |
| COS_CDN_DOMAIN | (空) | 可选 CDN 域名；配置后媒体 URL 走 CDN |
| APP_ENV | development | 生产环境设为 `production`，会拒绝默认 JWT 密钥 |
| CORS_ALLOWED_ORIGINS | (空) | 额外允许的浏览器来源，逗号分隔；同源始终允许 |
| COS_FIX_CACHE_ON_START | false | 仅一次性维护时启用，正常启动禁止全桶扫描 |

## 产物目录（data/，gitignore）

| 路径 | 内容 |
|------|------|
| `data/dist/` | 前端构建输出（`vite build.outDir`） |
| `data/karuta-server.exe` | 本地开发编译的后端二进制（dev.ps1 输出） |
| `data/karuta.db` + `-wal`/`-shm` | SQLite 数据库与 WAL（`DB_PATH` 可覆盖） |

## 上传限制与格式

- 音频：mp3、wav、m4a、flac、ogg、aac，单文件 ≤ 20MB
- 封面：jpg、png、webp，单文件 ≤ 5MB
- 浏览器端可选处理：压缩（MP3 128kbps）、裁剪前 30s / 随机 30s

## 管理命令

```bash
cd backend
go build -o ../data/karuta-admin ./cmd/admin

# 备份数据库（deploy-server.sh 发布前自动调用）
../data/karuta-admin backup-db -source /data/karuta/karuta.db -destination /data/karuta/backups/xxx.db

# 授予/撤销管理员（写入审计日志）
../data/karuta-admin set-admin -username <name> -enabled true
```

## 本地开发注意事项

- COS 凭据**必填**（含本地开发）——媒体读写直接访问真实 bucket，测试数据会进生产桶
- `dev.ps1` 含密钥且已被 gitignore，永远不要提交；新机器需手动重建
- 数据库默认在 `data/karuta.db`，删除即重置为空库
