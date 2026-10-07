/**
 * 导入包格式提示词（2026-09-30）：把牌包/牌组包的格式规格整理为可直接投喂
 * 用户 AI 助手的提示词，由 AI 产出 .zip 后走现有导入流程。
 * ⚠️ 与 cardPack.ts / deckPack.ts 的 PackManifest 结构同源——格式变更必须同步本提示词
 * （权威规格见 docs/capabilities/09-pack-format.md）。
 */
export const PACK_PROMPT = `# 任务：为「歌牌 Karuta」制作歌牌导入包

请按以下规格生成一个导入包（.zip 文件）。如果你无法直接产出 zip 文件，请完整输出 manifest.json 的内容和文件清单，由我自行打包成 zip。

## 一、包结构

<zip 根目录>
├── manifest.json      # 清单文件，必须位于根目录
├── c0/cover           # 第 1 张牌的封面（可选）
├── c0/a0              # 第 1 张牌的第 1 首音频（每牌至少 1 首）
├── c0/a1              # 第 1 张牌的第 2 首音频（可选，多首构成随机播放池）
├── c1/cover           # 第 2 张牌……依次类推
└── c1/a0

说明：目录名与文件名可以任意，只要 manifest.json 里的路径引用一致即可；上面的序号命名是推荐风格。扩展名可有可无（音频格式由内容嗅探识别）。

## 二、manifest.json（UTF-8）

{
  "version": 1,
  "deck": { "name": "牌组名", "description": "牌组简介" },
  "cards": [
    {
      "display_text": "牌面文字",
      "series": "作品名",
      "tags": "标签1,标签2",
      "cover": "c0/cover",
      "audios": [
        { "file": "c0/a0", "hint": "播放提示句", "duration": 42 },
        { "file": "c0/a1", "hint": "", "duration": 37 }
      ]
    }
  ]
}

字段语义：
- version：固定为 1。
- deck：可选。带上它就是「牌组包」——导入时自动创建私有牌组并把牌挂进去；省略则是「牌包」（只导入牌）。
- cards[].display_text：牌面主文字，必填非空。
- cards[].series / tags：检索用元数据，可为空字符串。
- cards[].cover：封面图的 zip 内路径；省略整个字段 = 无封面（导入端会自动垫一张占位图）。
- cards[].audios：该牌的音频池（游戏随机抽一首播放），至少 1 项：
  - file：音频的 zip 内路径
  - hint：播放时展示的提示句，可空
  - duration：音频时长（秒，整数）

## 三、硬约束（违反的条目会被导入端跳过并计入失败）

- 音频格式：mp3 / wav / m4a / flac / ogg / aac；单文件 ≤ 20MB
- 封面格式：jpg / png / webp；单文件 ≤ 5MB；建议 3:4 竖版
- 每张牌至少 1 首音频
- manifest.json 必须位于 zip 根目录，且是合法 JSON

## 四、导入后的行为（包里不需要处理）

- 所有牌以「私有」入库（不会自动公开共享），是否公开由我在游戏里设置
- 牌组包会创建私有牌组（协作级别 add_only）并把牌挂入

## 五、产出前自查清单

1. zip 根目录存在 manifest.json 且可解析
2. manifest 里每个 cover / file 路径在 zip 内真实存在
3. 每张牌 audios 数组 ≥ 1，duration 为秒数
4. 所有音频、封面满足格式与大小限制
`
