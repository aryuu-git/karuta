# 本地测试，无需腾讯云

本地模式运行真实的前端、后端、SQLite 和游戏引擎。注册、登录、牌组编辑、媒体上传与音频播放都可在自己的电脑上验收。

## Windows 一键启动

需要 Go 1.21+ 和 Node.js 18+。在项目根目录打开 PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\dev-local.ps1
```

首次运行会安装前端依赖；Go 构建也可能下载依赖，因此首次需要联网。依赖齐全后，本地模式不需要云服务。

启动成功后打开 <http://127.0.0.1:5173/decks>。

| 项目 | 内容 |
| --- | --- |
| 初始测试账号 | `localdemo` |
| 初始密码 | `localdemo123` |
| 示例数据 | 两个牌组、六张歌牌、六张封面、六段合成提示音 |
| 数据保存 | `data/local/karuta.db`、`data/local/uploads/` |
| 后端日志 | `data/local/backend.stderr.log` |
| 停止 | 在启动窗口按 Ctrl+C，脚本会停止前后端 |

示例数据仅在空数据库首次启动时创建。修改密码、编辑或删除牌组后，重启不会覆盖修改。也可以注册自己的账号；新账号没有示例牌组，可在公共牌组中使用或复制共享演示牌组。

首次登录会显示更新日志，按 Esc 或点击弹窗外的空白处关闭后即可操作页面。

前端端口被占用时可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\dev-local.ps1 -FrontendPort 5199
```

后端默认使用 8080 端口，被占用时可换端口，脚本会同步配置前端代理：

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\dev-local.ps1 -BackendPort 18080
```

该脚本只监听本机，不需要服务器。

## 验收本次返回按钮修改

1. 用测试账号登录，进入牌组页 `/decks`。
2. 点击「本地测试牌组」的「查看」。
3. 确认进入 `/decks/<牌组编号>`，封面和歌牌正常显示。
4. 点击左上角「返回」。
5. 确认回到 `/decks`，仍然能看到牌组列表。

保留初始示例数据时，也可在安装了 Chrome 的电脑上运行自动浏览器验收（桌面与手机视口）：

```powershell
cd frontend
node e2e/local-decks-verify.mjs
```

截图保存到 `frontend/baseline/local-test/`。如使用 Edge，可先设置 `$env:QA_BROWSER_CHANNEL = 'msedge'`；自定义前端端口时设置 `QA_BASE_URL`。测试账号或密码改过后，使用 `QA_USERNAME` / `QA_PASSWORD`。

还可以试听提示音、编辑名称、添加歌牌、复制牌组，或用示例牌组创建自动模式房间。测试媒体是程序生成的封面和提示音；需要真实歌曲时，可从牌库上传自己的封面与音频。

## 手动启动（其他系统也适用）

在项目根目录打开后端终端，设置以下环境变量再启动。PowerShell 示例：

```powershell
$env:APP_ENV = 'development'
$env:BIND_ADDR = '127.0.0.1'
$env:MEDIA_STORAGE = 'local'
$env:DB_PATH = '../data/local/karuta.db'
$env:LOCAL_MEDIA_DIR = '../data/local/uploads'
$env:LOCAL_DEMO_DATA = 'true'
$env:INVITE_REQUIRED = 'false'
cd backend
go run ./cmd/server
```

另一个终端启动前端：

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1
```

macOS/Linux 将环境变量设置方式改成 `export KEY=value`，并使用 `npm`。

## 重置测试数据

停止本地服务后，把 `data/local/` 改名保存为备份，再运行启动脚本，即可生成新的演示数据。本地账号和修改都在这个目录中；它与默认模式的 `data/karuta.db` 独立。

## 模式切换

默认 `MEDIA_STORAGE=cos`，保持云存储流程。`local` 仅允许 `APP_ENV=development`；演示账号不会在 COS 或生产模式生成。一键脚本会在结束时恢复当前 PowerShell 进程原有的环境变量。
