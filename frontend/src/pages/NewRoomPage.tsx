import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import {
  Swords, Check, Layers, Timer, Bot, Crown, Gamepad2,
  RefreshCw, FlipHorizontal2, Wrench, Users, EyeOff, Globe, Target, Snail, Zap, Shuffle,
  Tornado, Music, Hourglass, Dices, Play, AlertCircle,
} from 'lucide-react'
import { Button, Skeleton, PageContainer, HeroHeader, Dialog, PanelSurface, Input, Stepper, Toggle, RangeInput, OptionCard, FadeIn } from '../components/ui'
import { useMyDecks, useDeckDetail } from '../api/queries'
import { paths } from '../routes/paths'
import { createRoomFromConfig, writeLastConfig } from '../features/play/roomCreate'
import { matchPreset, saveCustomPreset } from '../features/play/presets'
import { deckDisambiguator, duplicatedDeckNames } from '../features/play/deckLabel'
import { defaultRoomConfig, type RoomConfig } from '../features/play/roomConfig'
import type { Room } from '../api/types'

/**
 * 建房配置模型已下沉至叶子模块 features/play/roomConfig（避免与预设模板 presets.ts 的
 * 运行时循环依赖）。此处 re-export，保持「RoomConfig/defaultRoomConfig 从 NewRoomPage
 * export」的既有契约不变。
 */
export { defaultRoomConfig }
export type { RoomConfig }

/** 新建战场页：牌组/规则配置 → 创建成功后展示邀请码（表单含加载/空/错误态）。 */
export function NewRoomPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const presetDeckId = searchParams.get('deck_id')
  // 预设快开流：PresetPicker「查看完整配置」带入的配置（§4.2）；标签按配置值反查
  const presetState = location.state as { presetConfig?: RoomConfig } | null
  const presetLabel = presetState?.presetConfig ? matchPreset(presetState.presetConfig)?.label : undefined

  // 牌组列表走 react-query（原手写 loading/error + useEffect 收敛）
  const { data: decks = [], isLoading: loadingDecks } = useMyDecks()
  // 同名牌组追加创建日期，避免列表里两行同名无从区分（2026-10-05 体验修复）
  const duplicatedNames = duplicatedDeckNames(decks)

  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(
    presetDeckId ? parseInt(presetDeckId, 10) : null
  )
  // 规则配置：单一对象收敛全部表单字段（有预设则以其为初值）
  const [config, setConfig] = useState<RoomConfig>(presetState?.presetConfig ?? defaultRoomConfig)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A 轮增补：高级设置折叠 + 智能提示 + 保存预设
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [presetDialogOpen, setPresetDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  // C 轮：牌组音频画像（平均时长/多音频占比 → 间隔与模式建议）
  const detailQ = useDeckDetail(selectedDeckId ?? 0, !!selectedDeckId)
  const deckCards = detailQ.data?.cards ?? []
  const audioStats = (() => {
    const withAudio = deckCards.filter(c => (c.audio_count ?? 0) > 0)
    if (withAudio.length === 0) return null
    const totalSec = withAudio.reduce((sum, c) => sum + (c.audio_duration ?? 0), 0)
    const withDur = withAudio.filter(c => (c.audio_duration ?? 0) > 0)
    const avg = withDur.length > 0 ? totalSec / withDur.length : 0
    const multi = withAudio.filter(c => (c.audio_count ?? 0) > 1).length
    return { avg: Math.round(avg), multiRatio: multi / withAudio.length }
  })()

  // 高级区非默认项计数（折叠角标；isPrivate 在 auto/judge 由 training 联动不单列）
  const advancedCount = [
    config.training || (config.mode === 'duel' && config.isPrivate),
    config.maxPlayers !== 16,
    config.mode !== 'duel' && config.shuffleEnabled,
    config.mode !== 'duel' && config.multiAudioMode === 'once',
    config.mode !== 'duel' && config.minPlayTime > 0,
    config.randomStart,
  ].filter(Boolean).length

  const handleSavePreset = () => {
    const label = presetName.trim()
    if (!label) return
    saveCustomPreset(label, config)
    setPresetDialogOpen(false)
    setPresetName('')
  }
  // 创建成功态与 UI 状态
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null)
  const [copied, setCopied] = useState(false)

  // 按字段名更新配置对象
  function update<K extends keyof RoomConfig>(key: K, value: RoomConfig[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  // 未预选牌组时默认选中第一副
  useEffect(() => {
    if (!selectedDeckId && decks.length > 0) {
      setSelectedDeckId(decks[0].id)
    }
  }, [decks, selectedDeckId])

  // 提交建房：按模式组装参数调用创建接口，成功后切换到邀请码展示态
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedDeckId) return
    setCreating(true)
    setError(null)
    try {
      const room = await createRoomFromConfig(selectedDeckId, config)
      writeLastConfig(config)
      setCreatedRoom(room)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败，请重试')
    } finally {
      setCreating(false)
    }
  }

  // 复制邀请码到剪贴板，2 秒后自动复位“已复制”提示。
  // 计时器句柄留存并在卸载时清理（2026-09-21 修复：原裸 setTimeout 卸载后仍触发 setState）。
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
  }, [])
  const copyCode = async () => {
    if (!createdRoom) return
    await navigator.clipboard.writeText(createdRoom.code).catch(() => null)
    setCopied(true)
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <PageContainer size="lg">
      <HeroHeader
        icon={<Swords size={20} />}
        title="创建房间"
        subtitle={presetLabel ? `基于：${presetLabel}` : '选好牌组和规则，创建对局'}
        onBack={() => navigate(-1)}
      />

      <AnimatePresence mode="wait">
        {createdRoom ? (
          // Success state
          <FadeIn key="success" className="bg-surface border border-border rounded-xl p-8 text-center">
            <div className="text-5xl mb-2">🏯</div>
            <p className="text-gold font-serif text-base mb-1">房间已创建</p>
            <p className="text-muted text-xs mb-4 tracking-widest">把邀请码发给朋友，一起加入对局</p>
            <div
              className="font-serif text-6xl font-bold tracking-[0.2em] text-gold cursor-pointer mb-2 hover:scale-105 transition-transform duration-200"
              style={{ textShadow: '0 0 30px rgb(var(--accent-primary)/ 0.5)' }}
              onClick={copyCode}
            >
              {createdRoom.code}
            </div>
            {/* 复制成功提示：纯显隐过渡走 CSS opacity（入场不再用 framer 初始态） */}
            <p
              className={`text-success text-xs mb-1 flex items-center justify-center gap-1 transition-opacity duration-base ${
                copied ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Check size={12} />
              复制成功
            </p>
            <p className="text-muted text-xs mb-8">
              点击邀请码即可复制
            </p>
            {/* 进入房间主按钮 */}
            <Button size="lg" className="w-full font-serif" icon={<Play size={16} />} onClick={() => navigate(paths.room(createdRoom.id))}>
              进入房间
            </Button>
          </FadeIn>
        ) : (
          // Form：双栏——左列配置表单（~560px），右列 sticky 摘要卡（~320px，贴 header 下方）；
          // <1024px 单列，右栏卡片落到表单下方
          <FadeIn key="form">
            <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row lg:items-start lg:justify-center gap-6">
            {/* 配置区块统一底：深景渐变 + 描金细边（PanelSurface abyss/2xl） */}
            <PanelSurface variant="abyss" radius="2xl" className="p-6 flex flex-col gap-6 w-full lg:w-[560px]">
              {/* Deck selection */}
              <div>
                <label className="text-gold/70 text-xs mb-3 tracking-widest font-serif flex items-center gap-1.5">
                  <Layers size={12} />
                  选择牌组 *
                </label>
                {loadingDecks ? (
                  <div className="py-2">
                    <Skeleton variant="row" rows={2} />
                  </div>
                ) : decks.length === 0 ? (
                  <div className="text-muted text-sm text-center py-4">
                    还没有牌组
                    <Button variant="link" size="xs" type="button" className="ml-1" onClick={() => navigate(paths.decks())}>
                      去创建一副！
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-scroll-lg overflow-y-auto">
                    {decks.map((deck) => (
                      <OptionCard
                        key={deck.id}
                        selected={selectedDeckId === deck.id}
                        onSelect={() => setSelectedDeckId(deck.id)}
                        layout="row"
                        icon={
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-serif text-gold text-sm shrink-0 bg-gold/10 border border-gold/20">
                            <Music size={16} />
                          </div>
                        }
                        title={<span className="font-sans font-medium truncate block">{deck.name}</span>}
                        desc={`${deck.card_count} 张${deckDisambiguator(deck, duplicatedNames)}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Interval slider（duel 无效隐藏：对阵用「每轮时间」，间隔仅 auto/judge 生效——
                  2026-09-21 参数有效性矩阵修复） */}
              {config.mode !== 'duel' && (
              <div>
                <label className="text-gold/70 text-xs block mb-3 tracking-widest font-serif">
                  <Timer size={12} className="inline-block align-middle mr-1.5" />
                  每张牌间隔时间:{' '}
                  <span className="text-gold font-medium">{config.intervalSec} 秒</span>
                  {config.intervalSec <= 5 && <span className="text-crimson ml-1 text-xs">（快节奏）</span>}
                  {config.intervalSec >= 20 && <span className="text-success ml-1 text-xs">（慢节奏）</span>}
                </label>
                <RangeInput
                  value={config.intervalSec}
                  onChange={(v) => update('intervalSec', v)}
                  min={3}
                  max={30}
                  aria-label="每张牌间隔时间"
                />
                <div className="flex justify-between text-muted text-xs mt-1.5">
                  <span>3秒</span>
                  <span>30秒</span>
                </div>
              </div>
              )}

              {/* Mode selection */}
              <div>
                <label className="text-gold/70 text-xs mb-3 tracking-widest font-serif flex items-center gap-1.5">
                  <Gamepad2 size={12} />
                  游戏模式
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <OptionCard
                    selected={config.mode === 'auto'}
                    onSelect={() => update('mode', 'auto')}
                    layout="column"
                    icon={<Bot size={20} />}
                    title="自动模式"
                    desc="系统自动播放"
                  />
                  <OptionCard
                    selected={config.mode === 'judge'}
                    onSelect={() => update('mode', 'judge')}
                    layout="column"
                    icon={<Crown size={20} />}
                    title="裁判模式"
                    desc="房主手动选牌"
                  />
                  <OptionCard
                    selected={config.mode === 'duel'}
                    onSelect={() => update('mode', 'duel')}
                    layout="column"
                    icon={<Swords size={20} />}
                    title="对阵模式"
                    desc="1v1 花牌决斗"
                    badge={<span className="text-[10px] px-1 py-0.5 rounded-full bg-crimson/20 text-crimson/80">内测</span>}
                  />
                </div>
              </div>

              {/* Duel mode config */}
              {config.mode === 'duel' && (
                <PanelSurface variant="abyss" radius="xl" className="p-4">
                  <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Swords size={12} />对阵配置</h3>
                  <div className="space-y-3">
                    {/* 总牌数 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">总牌数</p>
                        <p className="text-[10px] text-muted/70">每人分到一半</p>
                      </div>
                      <Stepper
                        value={config.duelTotalCards}
                        onDecrease={() => update('duelTotalCards', Math.max(10, config.duelTotalCards - 10))}
                        onIncrease={() => update('duelTotalCards', Math.min(100, config.duelTotalCards + 10))}
                      />
                    </div>
                    {/* 每轮时间 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">每轮时间</p>
                        <p className="text-[10px] text-muted/70">超时则无人得牌</p>
                      </div>
                      <Stepper
                        value={config.duelRoundTime}
                        onDecrease={() => update('duelRoundTime', Math.max(30, config.duelRoundTime - 10))}
                        onIncrease={() => update('duelRoundTime', Math.min(120, config.duelRoundTime + 10))}
                        suffix="s"
                      />
                    </div>
                    {/* 拍牌次数 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">拍牌次数</p>
                        <p className="text-[10px] text-muted/70">每轮可拍错几次</p>
                      </div>
                      <Stepper
                        value={config.duelGrabChances}
                        onDecrease={() => update('duelGrabChances', Math.max(1, config.duelGrabChances - 1))}
                        onIncrease={() => update('duelGrabChances', Math.min(5, config.duelGrabChances + 1))}
                      />
                    </div>
                    {/* 最大轮次 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">最大轮次</p>
                        <p className="text-[10px] text-muted/70">0 = 无限</p>
                      </div>
                      <Stepper
                        value={config.duelMaxRounds}
                        onDecrease={() => update('duelMaxRounds', Math.max(0, config.duelMaxRounds - 5))}
                        onIncrease={() => update('duelMaxRounds', config.duelMaxRounds + 5)}
                        display={config.duelMaxRounds || '∞'}
                      />
                    </div>
                    {/* 排阵时间 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">排阵时间</p>
                        <p className="text-[10px] text-muted/70">开局前调整布局(秒)</p>
                      </div>
                      <Stepper
                        value={config.duelArrangeTime}
                        onDecrease={() => update('duelArrangeTime', Math.max(10, config.duelArrangeTime - 10))}
                        onIncrease={() => update('duelArrangeTime', Math.min(300, config.duelArrangeTime + 10))}
                        suffix="s"
                        wide
                      />
                    </div>
                    {/* 开关项 */}
                    <div className="space-y-2 pt-1">
                      <div onClick={() => update('duelFlip', !config.duelFlip)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                          config.duelFlip ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                        }`}>
                        <Toggle checked={config.duelFlip} />
                        <div>
                          <p className={`text-xs font-medium flex items-center gap-1.5 ${config.duelFlip ? 'text-white/80' : 'text-white/70'}`}>
                            <FlipHorizontal2 size={12} />
                            对方区牌面倒置
                          </p>
                          <p className="text-[10px] text-muted/70">增加辨认难度！</p>
                        </div>
                      </div>
                      <div onClick={() => update('duelRequeue', !config.duelRequeue)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                          config.duelRequeue ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                        }`}>
                        <Toggle checked={config.duelRequeue} />
                        <div>
                          <p className={`text-xs font-medium flex items-center gap-1.5 ${config.duelRequeue ? 'text-white/80' : 'text-white/70'}`}>
                            <RefreshCw size={12} />
                            歌曲重入队
                          </p>
                          <p className="text-[10px] text-muted/70">超时未抢的歌会再次出现</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </PanelSurface>
              )}

              {/* Mask (blur) option */}
              <div>
                <label className="text-gold/70 text-xs mb-3 tracking-widest font-serif flex items-center gap-1.5">
                  <EyeOff size={12} />
                  模糊牌面
                </label>
                <div
                  onClick={() => update('maskEnabled', !config.maskEnabled)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all cursor-pointer ${
                    config.maskEnabled
                      ? 'bg-gold/10 border border-gold/30'
                      : 'bg-white/5 border border-white/5 hover:border-gold/20'
                  }`}>
                  <Toggle checked={config.maskEnabled} size="lg" />
                  <div>
                    <span className={`text-sm ${config.maskEnabled ? 'text-white/90' : 'text-white/70'}`}>开启模糊牌面</span>
                    <p className="text-xs text-gold/70 mt-0.5">封面图会被随机遮罩，增加辨识难度</p>
                  </div>
                </div>
                {config.maskEnabled && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {([
                      { key: 'easy', label: '简单', desc: '遮1/4' },
                      { key: 'normal', label: '普通', desc: '遮1/2' },
                      { key: 'hard', label: '困难', desc: '遮3/4' },
                    ] as const).map(({ key, label, desc }) => (
                      <OptionCard
                        key={key}
                        selected={config.maskDifficulty === key}
                        onSelect={() => update('maskDifficulty', key)}
                        layout="column"
                        title={label}
                        desc={desc}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* 扣分设置（duel 无效隐藏：对阵用「抢牌机会数」惩罚，抢错/抢慢扣分仅 auto/judge
                  生效——2026-09-21 参数有效性矩阵修复） */}
              {config.mode !== 'duel' && (
              <PanelSurface variant="abyss" radius="xl" className="p-4">
                <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Zap size={12} />惩罚规则</h3>
                <div className="space-y-3">
                  {[
                    { label: '抢错扣分', icon: Target, desc: '点了不是当前播放的牌', checked: config.penaltyWrong, onChange: (v: boolean) => update('penaltyWrong', v) },
                    { label: '抢慢扣分', icon: Snail, desc: '牌已被别人先抢走', checked: config.penaltySlow, onChange: (v: boolean) => update('penaltySlow', v) },
                  ].map(item => (
                    <div key={item.label}
                      onClick={() => item.onChange(!item.checked)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                        item.checked
                          ? 'bg-crimson/10 border border-crimson/25'
                          : 'bg-white/5 border border-white/5 hover:border-white/10'
                      }`}>
                      <Toggle checked={item.checked} tone="crimson" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium flex items-center gap-1.5 ${item.checked ? 'text-white/80' : 'text-white/70'}`}>
                          <item.icon size={12} />
                          {item.label}
                        </p>
                        <p className="text-[10px] text-muted/70">{item.desc}</p>
                      </div>
                      <span className={`text-[10px] shrink-0 ${item.checked ? 'text-crimson/70' : 'text-white/70'}`}>
                        {item.checked ? '-1' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-muted/70 text-[10px] mt-2 text-center font-serif">关闭后仅禁止本轮继续抢，不扣分</p>
                {/* 倒数N首开启惩罚 */}
                {config.penaltyWrong && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold/10">
                    <div>
                      <p className="text-xs text-white/70">倒数N首开启</p>
                      <p className="text-[10px] text-muted/70">0=全程扣分</p>
                    </div>
                    <Stepper
                      value={config.penaltyLast}
                      onDecrease={() => update('penaltyLast', Math.max(0, config.penaltyLast - 5))}
                      onIncrease={() => update('penaltyLast', config.penaltyLast + 5)}
                      display={config.penaltyLast || '全程'}
                      wide
                    />
                  </div>
                )}
              </PanelSurface>
              )}

              {/* 牌面打乱（对阵模式不需要） */}
              {/* —— 高级设置（A 轮增补：渐进披露，默认收起，非常用 20% 字段收纳于此） —— */}
              <button type="button" onClick={() => setAdvancedOpen(v => !v)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-white/10 bg-white/5 hover:border-gold/30 transition-all">
                <span className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                  <Wrench size={12} /> 高级设置
                  {advancedCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">{advancedCount} 项已调</span>
                  )}
                </span>
                <span className="text-[10px] text-muted">{advancedOpen ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              {advancedOpen && (<>

              {config.mode !== 'duel' && <PanelSurface variant="abyss" radius="xl" className="p-4">
                <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Shuffle size={12} />牌面打乱</h3>
                <div onClick={() => update('shuffleEnabled', !config.shuffleEnabled)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                    config.shuffleEnabled ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                  }`}>
                  <Toggle checked={config.shuffleEnabled} />
                  <div>
                    <p className={`text-xs font-medium flex items-center gap-1.5 ${config.shuffleEnabled ? 'text-white/80' : 'text-white/70'}`}>
                      <Tornado size={12} />
                      每轮抢完后打乱牌面
                    </p>
                    <p className="text-[10px] text-muted/70">增加混乱度，考验记忆力！</p>
                  </div>
                </div>
                {config.shuffleEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-muted text-xs">剩余</span>
                    <Stepper
                      value={config.shuffleRemaining}
                      onDecrease={() => update('shuffleRemaining', Math.max(1, config.shuffleRemaining - 1))}
                      onIncrease={() => update('shuffleRemaining', Math.min(99, config.shuffleRemaining + 1))}
                      editable={{ min: 1, max: 99, onEdit: v => update('shuffleRemaining', v) }}
                    />
                    <span className="text-muted text-xs">张时开始打乱</span>
                  </div>
                )}
              </PanelSurface>}

              {/* 多音频牌模式（duel 模式强制 once，不展示选择） */}
              {config.mode !== 'duel' && <PanelSurface variant="abyss" radius="xl" className="p-4">
                <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Music size={12} />多音频牌</h3>
                <div className="flex gap-2">
                  {([
                    { value: 'all', label: '全部播完', desc: 'N首全抢完才消失' },
                    { value: 'once', label: '拍一次消失', desc: '抢到第一首就消失' },
                  ] as const).map(({ value, label, desc }) => (
                    <OptionCard
                      key={value}
                      selected={config.multiAudioMode === value}
                      onSelect={() => update('multiAudioMode', value)}
                      layout="column"
                      title={label}
                      desc={desc}
                      className="flex-1"
                    />
                  ))}
                </div>
              </PanelSurface>}

              {/* 最短播放时间 */}
              {config.mode !== 'duel' && (
                <PanelSurface variant="abyss" radius="xl" className="p-4">
                  <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Hourglass size={12} />最短播放时间</h3>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/70">短歌也要播够这么久才能进入下一首</p>
                    {/* 最短播放秒数：0=关闭；回绕语义（≤10 减到 0、从 0 加回到 10）保留 */}
                    <Stepper
                      value={config.minPlayTime}
                      onDecrease={() => update('minPlayTime', config.minPlayTime <= 10 ? 0 : config.minPlayTime - 5)}
                      onIncrease={() => update('minPlayTime', config.minPlayTime === 0 ? 10 : Math.min(60, config.minPlayTime + 5))}
                      display={config.minPlayTime || '关闭'}
                      wide
                    />
                  </div>
                  {config.minPlayTime > 0 && <p className="text-muted/70 text-[10px] mt-2">即使歌曲不到 {config.minPlayTime}s，也会等到 {config.minPlayTime}s 再进入间隔</p>}
                </PanelSurface>
              )}

              {/* 随机片段播放 */}
              <PanelSurface variant="abyss" radius="xl" className="p-4">
                <h3 className="text-gold-light/90 text-xs font-serif mb-3 flex items-center gap-1.5"><Dices size={12} />随机片段</h3>
                <div onClick={() => update('randomStart', !config.randomStart)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                    config.randomStart ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                  }`}>
                  <Toggle checked={config.randomStart} />
                  <div>
                    <p className={`text-xs font-medium flex items-center gap-1.5 ${config.randomStart ? 'text-white/80' : 'text-white/70'}`}>
                      <Play size={12} />
                      每首歌从随机位置开始播放
                    </p>
                    <p className="text-[10px] text-muted/70">不从头播，增加听歌难度！</p>
                  </div>
                </div>
                {config.randomStart && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-muted text-xs">最大起始位置</span>
                    {/* 随机起始上限：可键入，钳制 10..80；单位 % 随行外置（Stepper editable 档不渲染 suffix） */}
                    <Stepper
                      value={config.randomStartMax}
                      onDecrease={() => update('randomStartMax', Math.max(10, config.randomStartMax - 10))}
                      onIncrease={() => update('randomStartMax', Math.min(80, config.randomStartMax + 10))}
                      editable={{ min: 10, max: 80, onEdit: v => update('randomStartMax', v) }}
                    />
                    <span className="text-white/70 text-xs">%</span>
                  </div>
                )}
              </PanelSurface>

              {/* 房主测试模式（移入高级区） */}
              {config.mode !== 'duel' && (
                <div onClick={() => {
                  const next = !config.training
                  update('training', next)
                  // Owner 裁定（2026-09-21）：测试局=私密房——开启测试即自动私密
                  update('isPrivate', next)
                }}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    config.training ? 'border border-warning/30 bg-warning/5' : 'border border-white/10 bg-white/5 hover:border-white/20'
                  }`}>
                  <Toggle checked={config.training} tone="warning" size="lg" />
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${config.training ? 'text-warning/90' : 'text-white/70'}`}>
                      {config.training ? <Wrench size={12} /> : <Users size={12} />}
                      {config.training ? '房主测试局（私密）' : '多人模式'}
                    </p>
                    <p className="text-[10px] text-muted/70">
                      {config.training ? '不进大厅，开打后外人只能旁观' : '展示在大厅，其他玩家可加入对局'}
                    </p>
                  </div>
                </div>
              )}
              {/* isPrivate 与 training 合并（2026-09-21 Owner 裁定：测试局=私密房，
                  auto/judge 撤独立开关由 training 联动；duel 无测试局概念，保留独立
                  私密开关；后端字段与能力不变） */}
              {config.mode === 'duel' && (
                <div onClick={() => update('isPrivate', !config.isPrivate)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                    config.isPrivate ? 'border border-gold/30 bg-gold/5' : 'border border-white/10 bg-white/5 hover:border-white/20'
                  }`}>
                  <Toggle checked={config.isPrivate} size="lg" />
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${config.isPrivate ? 'text-gold/90' : 'text-white/70'}`}>
                      {config.isPrivate ? <EyeOff size={12} /> : <Globe size={12} />}
                      {config.isPrivate ? '私密房间' : '公开房间'}
                    </p>
                    <p className="text-[10px] text-muted/70">
                      {config.isPrivate ? '不在大厅展示，凭邀请码进入' : '展示在首页活跃战场列表'}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-white/5">
                <div>
                  <p className="text-xs font-medium text-white/80 flex items-center gap-1.5"><Users size={12} /> 人数上限</p>
                  <p className="text-[10px] text-muted/70">满员后新玩家只能旁观（2-32）</p>
                </div>
                <Stepper
                  value={config.maxPlayers}
                  onDecrease={() => update('maxPlayers', Math.max(2, config.maxPlayers - 1))}
                  onIncrease={() => update('maxPlayers', Math.min(32, config.maxPlayers + 1))}
                  editable={{ min: 2, max: 32, onEdit: v => update('maxPlayers', v) }}
                />
              </div>
              </>)}

            </PanelSurface>

            {/* —— 右栏：配置摘要 + 预设 + 创建 CTA（宽屏 sticky 贴 header 下方；窄屏落表单下方） —— */}
            <aside className="w-full lg:w-[320px] lg:shrink-0 lg:sticky lg:top-[calc(var(--header-h)_+_1rem)]">
              <PanelSurface variant="ink" radius="2xl" title="配置摘要">
                <div className="p-5 flex flex-col gap-4">
                  {/* 所选牌组 */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted/70 flex items-center gap-1.5 shrink-0">
                      <Layers size={12} />
                      牌组
                    </span>
                    <span className="text-sm text-white/80 truncate">
                      {decks.find((d) => d.id === selectedDeckId)?.name ?? '未选择'}
                    </span>
                  </div>

                  {/* 实时配置 chips（原表单底部摘要条升级为摘要卡主体，随表单状态实时刷新） */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      config.mode === 'duel' ? '对决' : config.mode === 'judge' ? '裁判' : '自动',
                      ...(config.mode !== 'duel' ? [`${config.intervalSec}s 间隔`] : [`${config.duelRoundTime}s/轮`]),
                      config.penaltyWrong || config.penaltySlow ? '有扣分' : '无惩罚',
                      config.maskEnabled ? `模糊·${config.maskDifficulty === 'easy' ? '简单' : config.maskDifficulty === 'hard' ? '困难' : '普通'}` : null,
                      config.isPrivate ? '私密' : null,
                      config.training ? '测试局' : null,
                    ].filter(Boolean).map(tag => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-gold/10 border border-gold/20 text-gold/90">{tag}</span>
                    ))}
                  </div>

                  {/* C 轮：牌组画像智能提示（数据已就位，零额外成本） */}
                  {audioStats && audioStats.avg > 0 && config.mode !== 'duel' && (
                    <p className="text-[10px] text-muted/70 text-center font-serif">
                      本牌组平均 {audioStats.avg}s/首
                      {audioStats.avg > 60 && config.intervalSec > 10 && ' — 长曲为主，间隔可调小让节奏更紧凑'}
                      {audioStats.multiRatio >= 0.4 && config.multiAudioMode === 'all' && '；多音频牌较多，可试试「拍一次消失」'}
                    </p>
                  )}

                  {/* 保存为我的预设（并入右栏；非提交动作需 type=button 防误触发表单提交） */}
                  <Button variant="link" size="xs" type="button" className="self-center" onClick={() => setPresetDialogOpen(true)}>
                    ⭐ 把当前配置保存为我的预设
                  </Button>

                  {error && (
                    <p className="text-crimson text-sm bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5">
                      <AlertCircle size={16} className="shrink-0" />
                      {error}
                    </p>
                  )}

                  {/* 创建房间提交按钮：loading 态锁定防重复提交 */}
                  <Button
                    type="submit"
                    size="lg"
                    loading={creating}
                    disabled={!selectedDeckId}
                    icon={<Swords size={16} />}
                    className="w-full font-serif"
                  >
                    创建房间
                  </Button>
                </div>
              </PanelSurface>
            </aside>
            </form>
          </FadeIn>
        )}
      </AnimatePresence>

      {/* 保存预设弹窗 */}
      <Dialog open={presetDialogOpen} title="保存为我的预设" onClose={() => setPresetDialogOpen(false)}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setPresetDialogOpen(false)}>取消</Button>
            <Button size="sm" disabled={!presetName.trim()} onClick={handleSavePreset}>保存</Button>
          </>
        }>
        <Input value={presetName} onChange={e => setPresetName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSavePreset() }}
          maxLength={20} placeholder="给这组配置起个名字（20 字内）" autoFocus />
        <p className="text-[10px] text-muted/70 mt-2">保存后可在「快速开局」弹层的「我的预设」中一键使用（本机存储）</p>
      </Dialog>
    </PageContainer>
  )
}
