# 09 · 导入包格式（牌包 / 牌组包）

## 能力概览

牌与牌组支持**整包导出/导入**（zip），跨机器完整重建（媒体二进制随包）。格式自 v8 起为
`version: 1`，由前端在浏览器端打包/解包（jszip），**无专用后端导入接口**——导入即逐卡
复用「建卡 + 追加音频」API，媒体经服务端 magic bytes 嗅探格式后写入 COS（内容寻址去重）。

**AI 制作通道（2026-09-30）**：牌库/牌组页「AI 制作」弹窗内置格式提示词
（`frontend/src/utils/packPrompt.ts` 的 `PACK_PROMPT`），用户投喂自己的 AI 助手产出 .zip
后走常规导入。提示词与本规格同源，格式变更**必须三处同步**：
`cardPack.ts`/`deckPack.ts` 类型 ↔ 本文档 ↔ `packPrompt.ts`。

## 包结构

```
<zip 根>
├── manifest.json      # 清单（唯一入口，必须在根目录）
├── c0/cover           # 第 1 张牌封面（可选）
├── c0/a0              # 第 1 张牌第 1 首音频（每牌 ≥1 首）
└── c0/a1              # …多首构成随机播放池；目录/文件名任意，与 manifest 引用一致即可
```

## manifest.json

| 字段 | 必填 | 语义 |
|---|---|---|
| `version` | ✓ | 固定 `1` |
| `deck` | ✗ | `{name, description}`——带上即为**牌组包**（导入时自动建私有牌组并挂卡）；省略即为**牌包** |
| `cards[].display_text` | ✓ | 牌面主文字 |
| `cards[].series` / `tags` | ✗ | 检索元数据 |
| `cards[].cover` | ✗ | 封面 zip 内路径；省略字段 = 无封面（导入端垫 2×3 占位 PNG） |
| `cards[].audios[].file` | ✓ | 音频 zip 内路径 |
| `cards[].audios[].hint` | ✗ | 播放提示句 |
| `cards[].audios[].duration` | ✗ | 时长（秒） |

## 导入流水线

1. jszip 解包 → 校验 `manifest.json`（缺清单/空 cards：整包拒绝）
2. 逐卡：`audios[0]` + 封面 + 元数据 → `POST /api/cards`（`is_shared=false` 写死）；
   余下音频逐个 `POST /api/cards/{id}/audios`；单卡 try/catch，成败计数 + 进度回调
3. 牌组包：先 `POST /api/decks`（`private` / `add_only`），结束后 `add-cards` 批量入组

## 边界与限制

| # | 限制 | 说明 | 性质 |
|---|---|---|---|
| 1 | 无去重 | 同包导两次 = 两份卡（仅 COS 媒体层内容寻址省空间） | 既定取舍 |
| 2 | 部分失败残留 | 建卡成功但追加音频失败：卡已入库（带首音频）却计 failed；牌组包不挂入该卡 | 已知瑕疵，待收拾 |
| 3 | 全失败空壳 | 牌组先行创建，全部卡失败会留下空牌组 | 已知瑕疵，待收拾 |
| 4 | 封面兜底不对称 | manifest **没写** cover 才垫占位图；**写了**但包里缺文件 → 该卡 failed | 已知瑕疵，待收拾 |
| 5 | 无版本迁移 | `version:1` 硬编码，格式演进需同步提示词与本文档 | 三处同步纪律 |
| 6 | 硬约束 | 音频 6 格式 ≤20MB；封面 jpg/png/webp ≤5MB（建议 3:4）；超出进 failed 计数 | 与单卡上传一致 |

## 验证记录（2026-09-30）

- 导出/导入往返：牌包与牌组包均经真实 zip 往返实测（v8 落地时浏览器端验证）
- `PACK_PROMPT` 提示词与本规格逐节比对同源
