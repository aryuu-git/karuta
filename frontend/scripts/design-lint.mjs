#!/usr/bin/env node
/**
 * 设计系统防回流检查（docs/design-system.md §4）。
 * 规则：
 *   R1 内置彩色类回流（白/黑中性豁免；新代码一律用语义 token）
 *   R2 离字阶任意字号（micro = text-[10px] 是唯一下限例外）
 *   R3 inline 渐变引用 CSS 变量（必须走 panel-＊、accent-line、glow-radial token 或组件）
 *   R4 十六进制硬编码颜色（一律走语义 token）
 *   R5 色彩函数字面量（rgba()/rgb()/hsl() 裸值，一律走语义 token）
 *   R6 自绘遮罩（fixed inset-0 + 底色，一律用 Scrim/ModalSurface）
 *   R7 手写阴影（boxShadow 字面量，一律用 shadow-* token）
 * R8 裸表单元素（ui/ 之外禁 <input>/<select>/<textarea>，type=file 豁免）
 * R9 低透明文字下限（text-muted/·text-white/ 透明度 <40 拦截；徽章/装饰豁免）
 * R10 直用 bg-glow-radial（业务层禁直用背景类，光晕走 <BrandGlow />）
 * R11 pages 自定义 max-w 字面量（禁任意数值；语义档 max-w-sm/md/lg… 与 max-w-content 豁免）
 * R12 业务层 framer 初始态（入场走 <FadeIn />；迁移期 allowlist 见规则内注释）
 * 用法：npm run design:lint（全量）/ node scripts/design-lint.mjs --rules=R9（独立开关）/ --self-test（正反例自检）/ --list
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 规则表：skip(relPath) 返回 true 时该文件豁免此规则 */
const RULES = [
  {
    name: 'R1 内置彩色类',
    re: /\b(?:hover:|focus:|active:|disabled:|group-hover:)*(?:text|bg|border|ring|from|to|via|fill|stroke|divide|outline|shadow)-(?!white(?:\/\d|\b)|black(?:\/\d|\b)|transparent\b|current\b)(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g,
    hint: '改用语义 token（gold/crimson/success/warning/danger/info/muted…）',
  },
  {
    name: 'R2 离字阶任意字号',
    re: /text-\[(?!10px\])[^\]]*(?:px|rem)[^\]]*\]|fontSize: '0\.[^']*'|fontSize: '(?:[0-9]|1[01])px[^']*'|fontSize: 'clamp\(0\.[^']*'/g,
    hint: '改用字阶 token（display/title/body/caption/tiny；下限 micro = text-[10px]）',
  },
  {
    name: 'R3 inline 渐变引用变量',
    re: /(?:background|backgroundImage):\s*'[^']*gradient\([^)]*var\(--/g,
    hint: '改用 panel-＊/accent-line/glow-radial backgroundImage token 或 PanelSurface',
  },
  {
    name: 'R4 十六进制硬编码色',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    hint: '改用语义 token（确需固定色时用 rgb(var(--…)) 变量）',
  },
  {
    name: 'R5 色彩函数字面量',
    re: /rgba?\(\s*(?!0(?:[\s,)]|$)|255(?:[\s,)]|$))\d|hsl\(\s*\d/g,
    hint: '改用语义 token 类（彩色一律 token；黑白中性 rgba(0…/rgb(255… 豁免）',
  },
  {
    name: 'R6 自绘遮罩',
    re: /fixed inset-0[^"'\n]*(?:bg-black|bg-ink|bg-white|bg-overlay)[^"'\n]*|fixed inset-0[^>]{0,200}?background: '[^']+'/g,
    hint: '改用 Scrim/ModalSurface',
    skip: (p) => p.split(sep).join('/').startsWith('components/ui/'),
  },
  {
    name: 'R7 手写阴影',
    re: /boxShadow: '/g,
    hint: '改用 shadow-panel/card/gold/gold-lg/crimson/foil/modal token',
  },
  {
    name: 'R8 裸表单元素',
    re: /<(?:input|select|textarea)\b(?![^>]{0,160}type="file")/g,
    hint: '改用 ui 表单组件（Input/Textarea/Select/RangeInput/Checkbox…）',
    skip: (p) => p.split(sep).join('/').startsWith('components/ui/'),
  },
  {
    name: 'R9 低透明文字下限',
    re: /text-(?:muted|white)\/(?:[0-9]|[123][0-9])(?![0-9])/g,
    hint: '正文对比度下限 text-muted/70；低透明仅限徽章/装饰',
    // 徽章胶囊(rounded-full)、hover 显隐(group-hover:)、纯装饰(aria-hidden)豁免
    allow: (_m, line) => /rounded-full|group-hover:|aria-hidden/.test(line),
    // 迁移期豁免已清空（2026-09-30 首页/新房切片提升对比度后移除）。
    migrationAllow: new Set([]),
    examples: {
      bad: ['className="text-muted/20"', 'className="text-white/30"'],
      good: ['className="text-muted/70"', 'className="text-white/50"', 'className="text-white/20 rounded-full bg-black/40"'],
    },
  },
  {
    name: 'R10 直用 bg-glow-radial',
    re: /\bbg-glow-radial\b/g,
    hint: '光晕走 <BrandGlow />（components/ui/BrandGlow.tsx），业务层禁直用背景类',
    skip: (p) => p.split(sep).join('/').startsWith('components/ui/'),
    examples: {
      bad: ['className="bg-glow-radial"'],
      good: ['<BrandGlow />'],
    },
  },
  {
    name: 'R11 pages 自定义 max-w 字面量',
    re: /\bmax-w-(?:\[[^\]]*\]|\d+(?:\.\d+)?)(?![\w-])/g,
    hint: '内容列宽走 max-w-content 契约；语义档 max-w-sm/md/lg/xl/2xl… 可用，禁任意数值',
    skip: (p) => !p.split(sep).join('/').startsWith('pages/'),
    examples: {
      bad: ['className="max-w-[72rem]"', 'className="max-w-96"'],
      good: ['className="max-w-sm"', 'className="max-w-content"', 'className="max-w-2xl"'],
    },
  },
  {
    name: 'R12 业务层 framer 初始态',
    re: /initial=\{\{\s*opacity:\s*0/g,
    hint: '入场一律 <FadeIn />（components/ui/FadeIn.tsx）；framer 仅留 AnimatePresence/手势/布局',
    skip: (p) => p.split(sep).join('/').startsWith('components/ui/'),
    // 带 exit 的 motion 属 AnimatePresence 管理（退出淡出必须留 framer），豁免；
    // 只拦纯入场 initial={{opacity: 0（无 exit）。探测：自 match 起至标签闭合 '>' 前是否出现 exit=。
    allow: (m, _line, text) => {
      const end = text.indexOf('>', m.index)
      return /\bexit=/.test(text.slice(m.index, end === -1 ? text.length : end))
    },
    // 迁移期 allowlist:以下业务文件尚未改用 <FadeIn />，逐个迁移后移除。
    // 游戏流(RoomPage/GameOver/DuelGameOver 等)本轮不迁移，暂留 framer 初始态。
    migrationAllow: new Set([
      // —— 游戏流 ——
      'components/CardGrid.tsx',
      'components/ChatRoom.tsx',
      'components/DuelBoard.tsx',
      'components/DuelGameOver.tsx',
      'components/DuelGiveModal.tsx',
      'components/EggAnimation.tsx',
      'components/GameOver.tsx',
      'components/JudgePanel.tsx',
      'components/KarutaCard.tsx',
      'components/ReadingPanel.tsx',
      'components/ScoreBoard.tsx',
      'components/WaitingLobby.tsx',
      'features/room/ShuffleOverlay.tsx',
      // —— 页面/功能流(待迁移到 <FadeIn /> 后移除；CardLibrary/Decks/Home/NewRoom 已于 2026-09-30 迁移移出) ——
      'features/achievements/AchievementPopup.tsx',
      'features/card-create/EditAudioPanel.tsx',
      'features/play/InvitePanel.tsx',
      'pages/CardCreatePage.tsx',
      'pages/DeckDetailPage.tsx',
      'pages/JoinRoomPage.tsx',
    ]),
    examples: {
      bad: ['initial={{ opacity: 0 }}', 'initial={{opacity: 0, y: 20}}'],
      good: ['<FadeIn delay={100}>', 'animate={{ opacity: 0 }}', 'initial={{ opacity: 0 }} exit={{ opacity: 0 }}'],
    },
  },
]

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full
  }
}

/** 规则 id 取自 name 首词（"R9 …" → "R9"），免去在 R1-R8 上重复声明 id */
const ruleId = (rule) => rule.name.split(' ')[0]

/** 全量扫描：在 src 下逐文件套用各规则，命中即报 */
function runLint(rules) {
  let violations = 0
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(SRC, file).split(sep).join('/')
    const lineStarts = [0]
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1)
    const lineOf = (index) => {
      let lo = 0
      let hi = lineStarts.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (lineStarts[mid] <= index) lo = mid
        else hi = mid - 1
      }
      return lo + 1
    }
    const lineTextOf = (line) => text.slice(lineStarts[line - 1], lineStarts[line] ?? text.length)

    for (const rule of rules) {
      if (rule.skip?.(rel)) continue
      if (rule.migrationAllow?.has(rel)) continue // 迁移期豁免
      rule.re.lastIndex = 0
      for (const match of text.matchAll(rule.re)) {
        const line = lineOf(match.index)
        if (rule.allow?.(match, lineTextOf(line), text)) continue // 徽章/装饰豁免
        violations++
        console.log(`${rel}:${line}  ${rule.name}  ${match[0].slice(0, 60)}  — ${rule.hint}`)
      }
    }
  }

  if (violations > 0) {
    console.error(`\ndesign:lint 失败：${violations} 处回流（规则见 docs/design-system.md §4）`)
    return 1
  }
  console.log('design:lint 通过：无设计系统回流')
  return 0
}

/** 自检：用各规则自带正/反例验证正例命中、反例放行（配 --rules 即独立开关） */
function selfTest(rules) {
  let failed = 0
  const count = (rule, sample) => {
    rule.re.lastIndex = 0
    let hits = 0
    for (const m of sample.matchAll(rule.re)) if (!rule.allow?.(m, sample, sample)) hits++
    return hits
  }
  for (const rule of rules) {
    const ex = rule.examples
    if (!ex) continue
    for (const s of ex.bad ?? []) {
      const hits = count(rule, s)
      const ok = hits >= 1
      if (!ok) failed++
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${ruleId(rule)}  应命中  ${s}  ${ok ? `命中 ${hits}` : '未命中'}`)
    }
    for (const s of ex.good ?? []) {
      const hits = count(rule, s)
      const ok = hits === 0
      if (!ok) failed++
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${ruleId(rule)}  应放行  ${s}  ${ok ? '' : `误报 ${hits}`}`)
    }
  }
  console.log(failed > 0 ? `\n自检失败：${failed} 例不符` : '\n自检通过：正反例均符合预期')
  return failed
}

/** 规则清单（--list） */
function listRules(rules) {
  for (const rule of rules) {
    console.log(`${rule.name}${rule.examples ? '  （含正反例）' : ''}`)
    console.log(`      ${rule.hint}`)
  }
}

// —— CLI：--rules=R9,R10 独立开关 / --self-test 正反例自检 / --list 清单 ——
const argv = process.argv.slice(2)
const opt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}
const spec = opt('rules') ?? opt('only')
const chosen = spec ? new Set(spec.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null
const rules = chosen ? RULES.filter((r) => chosen.has(ruleId(r))) : RULES

if (argv.includes('--list')) listRules(rules)
else if (argv.includes('--self-test')) process.exit(selfTest(rules) ? 1 : 0)
else process.exit(runLint(rules))
