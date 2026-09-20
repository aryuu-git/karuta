# 🌸 歌牌 Karuta — 二次元歌牌大乱斗

一个在线多人歌牌（かるた）游戏。玩家自建牌组，上传音频和封面，创建房间一起抢牌。

> 一款在线多人抢牌游戏。上传你喜欢的歌曲，组成牌组，和朋友一起抢！

## 🔗 相关链接

| | |
|---|---|
| 🌐 **在线体验** | [http://101.34.245.28/](http://101.34.245.28/) |
| 📋 **需求 / JIRA** | [腾讯文档](https://docs.qq.com/sheet/DZVhIcVZHSmpMcWpo?tab=BB08J2) |
| 📞 **联系 QQ** | 951505136 |

## ⚡ 功能一览

- **三种游戏模式**：自动模式 / 裁判模式 / ⚔️对阵模式（1v1 花牌决斗）[内测]
- **独立牌库**：牌与牌组解耦，支持复用、共享、筛选、一键复制
- **多音频牌**：一张牌绑定多首歌，全局随机打散、堆叠展示
- **模糊牌面**：6 种 CSS 遮罩效果 × 3 档难度，防偷看
- **随机片段播放** + 倒数 N 首开启扣分 + 牌面打乱
- **浏览器端音频处理**：上传前可选压缩 / 裁剪 30 秒（ffmpeg.wasm，不经服务器）
- **服务端权威抢牌判定**：消息到达时间为准，防作弊
- **账号系统**：注册 / 登录 / 游客模式（恢复凭据找回身份）
- 主题切换、聊天室、丢鸡蛋、旁观模式、响应式布局

完整玩法规则见 **[docs/gameplay.md](docs/gameplay.md)**。

## 🚀 快速启动

前置：Go 1.21+ · Node.js 18+ · 腾讯云 COS 凭据（必填）

**一键启动（Windows）**：右键 `deploy/scripts/dev.ps1` → 使用 PowerShell 运行

**手动启动**：

```bash
# 终端 1 — 后端
cd backend
go run ./cmd/server

# 终端 2 — 前端
cd frontend
npm install
npm run dev
```

首次启动前设置 COS 凭据（媒体只存 COS，本地不落盘）：

```bash
COS_SECRET_ID=... COS_SECRET_KEY=... go run ./cmd/server
```

完整环境变量与配置说明见 **[docs/configuration.md](docs/configuration.md)**。

## 📚 文档

| 文档 | 内容 |
|------|------|
| [docs/gameplay.md](docs/gameplay.md) | 玩法说明：规则、模式、计分、常见问题 |
| [docs/configuration.md](docs/configuration.md) | 环境变量、产物目录、管理命令 |
| [docs/architecture.md](docs/architecture.md) | 技术栈、目录结构、媒体/实时链路设计 |
| [docs/deployment.md](docs/deployment.md) | 生产部署与回滚手册 |
| [docs/handoff.md](docs/handoff.md) | 上线改造决策与 AI 协作交接记录 |

## ☕ 支持作者

赞助作者多买点 galgame 周边，和孝敬他的法老控爹～

| 微信 | 支付宝 |
|:---:|:---:|
| <img src="docs/images/donate-wechat.png" width="200"> | <img src="docs/images/donate-alipay.jpg" width="200"> |

---

*🌸 拼尽全力，争夺第一！*
