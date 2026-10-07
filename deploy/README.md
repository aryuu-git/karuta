# 部署（deploy/）

服务器上只有**两个动作**：上传发布包 → 跑一键脚本。脚本负责备份、替换、重启、健康检查与失败回滚。

```
本机：build-release.sh  →  karuta-<版本>.tar.zst / karuta-fe-<版本>.tar.zst (+ .sha256)
                                  ↓ 上传到服务器同一目录
服务器：deploy-oneclick.sh  →  备份 → 替换 → 重启 → /readyz 校验 →（失败自动回滚）
```

## 文件一览

| 路径 | 用途 |
|---|---|
| `scripts/build-release.sh` | 本机打包：跑测试 → 前端构建 → 交叉编译 Linux 二进制 → 出 `.tar.zst` + `.sha256` |
| `scripts/deploy-oneclick.sh` | 服务器一键部署：备份/替换/重启/健康检查/自动回滚（**推荐日常用这个**） |
| `scripts/deploy-server.sh` | 版本化发布（releases/ 软链 + previous 回滚，配 CI 产物用） |
| `scripts/rollback-server.sh` | 上面那套的配套回滚 |
| `systemd/karuta.service` | systemd 单元（首次部署时安装） |
| `nginx.conf` | 反代 + 静态资源（首次部署时安装） |
| `karuta.env.example` | 环境变量模板（含 COS 凭据、JWT_SECRET、DB_PATH） |

## 一、打包（本机）

```bash
./deploy/scripts/build-release.sh 20261005-3     # 版本号会写进 /version 接口
```

产物（仓库根目录）：

| 包 | 内容 | 什么时候用 |
|---|---|---|
| `karuta-<版本>.tar.zst` | `karuta-server` + `karuta-admin` + `VERSION` + `frontend/dist` | 整包更新（会停服几秒） |
| `karuta-fe-<版本>.tar.zst` | 只有 `frontend/dist` | **只改了前端**时用（不重启服务、秒级） |

两个包都会生成同名 `.sha256`；脚本会自动核对，不匹配直接拒绝执行。

> Windows 上打包：用 Git Bash 跑，并把带 zstd 的 tar 指过去
> `TAR=/c/Windows/System32/tar.exe ./deploy/scripts/build-release.sh 20261005-3`
> （Git Bash 自带的 tar 没有 zstd，会报 `--zstd` 不支持）

## 二、部署（服务器）

把 `deploy-oneclick.sh` 和发布包传到服务器同一目录（如 `/root`），然后：

```bash
chmod +x deploy-oneclick.sh
sudo ./deploy-oneclick.sh karuta-fe-20261005-3.tar.zst
# 或让脚本自己找 karuta-*.tar.zst：
sudo ./deploy-oneclick.sh
```

脚本做的事，全程有 `>>` / `OK` / `!!` / `XX` 输出：

1. 校验发布包 sha256
2. 从 `systemctl show -p ExecStart` 探测后端真实路径（不写死路径）
3. **备份**到 `/data/karuta-backups/`：`karuta.db.<时间戳>`（含 `-wal`/`-shm`）、`karuta-server.<时间戳>`、`frontend-dist.<时间戳>/`
4. 整包模式：停服 → 原子替换（同目录临时文件 + `mv`）→ 起服 → 30s 轮询 `/readyz`
   仅前端模式：不动服务，替换 `frontend/dist` 后做资源自检
5. 失败**自动回滚**旧二进制/旧前端并重启，并打印 `journalctl` 最近 20 行
6. 每类备份只留最近 5 份（`KARUTA_KEEP_BACKUPS` 可调）

常用覆盖项：`KARUTA_APP_DIR` / `KARUTA_DB_PATH` / `KARUTA_BACKUP_DIR` / `KARUTA_SERVICE` / `SKIP_VERIFY=1`，见脚本头部注释。

**验收**：
```bash
curl -fsS http://127.0.0.1:8080/readyz          # {"status":"ready","schema_version":8,...}
curl -s  http://127.0.0.1:8080/version          # 版本号
curl -s  http://127.0.0.1/ | grep -o 'assets/index-[^"]*\.js'   # 前端哈希（换前端后 Ctrl+F5）
```

**手动回滚**：从 `/data/karuta-backups/` 取回 `karuta-server.<时间戳>` / `frontend-dist.<时间戳>` 放回原位再起服务。数据库全程不动。

## 三、首次部署（服务器一次性）

```bash
sudo useradd --system --home /opt/karuta --shell /usr/sbin/nologin karuta || true
sudo mkdir -p /opt/karuta/{frontend,shared,scripts} /data/karuta-backups
sudo chown -R karuta:karuta /opt/karuta /data/karuta-backups
sudo install -m 0755 deploy/scripts/*.sh /opt/karuta/scripts/
sudo install -m 0644 deploy/systemd/karuta.service /etc/systemd/system/
sudo install -m 0600 deploy/karuta.env.example /opt/karuta/shared/karuta.env   # 改密钥！
sudo install -m 0644 deploy/nginx.conf /etc/nginx/conf.d/karuta.conf
sudo systemctl daemon-reload && sudo systemctl enable --now karuta
sudo nginx -t && sudo systemctl reload nginx
```

配置硬性要求（不满足会起不来）：

- `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` **任何环境都必填**（媒体只存 COS，服务器不留媒体）
- `APP_ENV=production` 时 `JWT_SECRET` ≥32 位且非默认值（**改动会让所有已发 token 失效**）
- `DB_PATH` 必须落在可写目录（systemd 是 `ProtectSystem=strict` + `ReadWritePaths=/data/...`）；现网用 `/data/karuta.db`
- `INVITE_REQUIRED=true` 时新库没有任何邀请码 → 注册会被挡，先用 `karuta-admin` 发码或临时置 false

## 四、备份清单

| 对象 | 位置 | 说明 |
|---|---|---|
| **SQLite 数据库** | `/data/karuta.db`（+ `-wal`/`-shm`） | 用户、牌组、歌牌、战绩、成就全在这一个文件；脚本每次部署前自动备份。**服务运行中别直接 `cp`**（WAL 未 checkpoint），停服后复制或用 `karuta-admin backup-db` |
| 环境变量 | `/opt/karuta/shared/karuta.env` | 含 `JWT_SECRET`（丢了全员重新登录）与 COS 凭据（丢了媒体读写全挂） |
| 媒体文件 | 腾讯云 COS（服务器上没有） | 备份 = COS 桶开版本控制/跨地域复制；`media_assets` 表是键映射 |
| 配置 | `deploy/systemd/`、`deploy/nginx.conf`、`deploy/scripts/` | 已入库，可重建 |
| 脚本备份 | `/data/karuta-backups/` | 每次部署自动落；同一块盘，别当成唯一备份 |

备份自检建议：`sqlite3 备份.db "PRAGMA integrity_check;"`，并试在临时目录起一次服务看 `/readyz`。

## 五、排错

| 现象 | 排查 |
|---|---|
| `readyz` 失败 | `journalctl -u karuta -n 50 --no-pager`；常见为 COS 凭据缺失、`DB_PATH` 不可写、端口被占 |
| `curl 127.0.0.1:8080` 连不上 | 刚起服要等 1~2 秒；再 `curl`，仍失败看 `systemctl status karuta` 与日志 |
| 前端没更新 | `curl -s http://127.0.0.1/ \| grep -o 'assets/index-[^"]*\.js'` 对比新包里的哈希；对不上说明 nginx `root` 不是目标目录；对上了就 Ctrl+F5 |
| 解包报 zstd | `yum install -y zstd`（或 Ubuntu `apt install zstd`） |
| 部署后页面点不动/报错 | 用回滚：`/data/karuta-backups/` 还原 + 起服 |

## 六、数据库兼容

`/readyz` 会校验「库的 schema 版本 == 二进制期望版本」，不一致直接拒流量（防旧二进制写坏已迁移的库）。所以**后端二进制和库要一起升级**——服务启动时会自动跑迁移，不需要手动改库；但只要新版本包含**破坏性** schema 变更，就按维护窗口处理：停服 → 备份 → 升级 → 验证，别指望自动回滚能救。
