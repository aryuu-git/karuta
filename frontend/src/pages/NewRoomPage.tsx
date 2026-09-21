import { useState, useEffect, useRef, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import {
  Swords, Check, Layers, Timer, Bot, Crown, Gamepad2, Minus, Plus,
  RefreshCw, FlipHorizontal2, Wrench, Users, EyeOff, Globe, Target, Snail, Zap, Shuffle,
  Tornado, Music, Hourglass, Dices, Play, AlertCircle,
} from 'lucide-react'
import { Button, Skeleton, PageContainer, HeroHeader, Dialog } from '../components/ui'
import { useMyDecks, useDeckDetail } from '../api/queries'
import { paths } from '../routes/paths'
import { createRoomFromConfig, writeLastConfig } from '../features/play/roomCreate'
import { matchPreset, saveCustomPreset } from '../features/play/presets'
import { defaultRoomConfig, type RoomConfig } from '../features/play/roomConfig'
import type { Room } from '../api/types'

/**
 * 建房配置模型已下沉至叶子模块 features/play/roomConfig（避免与预设模板 presets.ts 的
 * 运行时循环依赖）。此处 re-export，保持「RoomConfig/defaultRoomConfig 从 NewRoomPage
 * export」的既有契约不变。
 */
export { defaultRoomConfig }
export type { RoomConfig }

/** 配置区块统一底：三段渐变 + 描金细边（收敛原多处重复 inline 模板） */
const sectionBoxStyle: CSSProperties = {
  background: 'linear-gradient(135deg, rgb(var(--accent-bg)/ 0.15), rgb(var(--accent-bg-mid)/ 0.4))',
  border: '1px solid rgb(var(--accent-primary)/ 0.12)',
}

/** 步进器数值区底色 */
const stepValueStyle: CSSProperties = { background: 'rgb(var(--accent-primary)/ 0.05)' }

/** 选项卡片选中态样式：选中描金高亮，未选中悬停提示 */
function optionCardClass(selected: boolean, layout: string): string {
  return [
    layout,
    'rounded-lg border transition-all',
    selected
      ? 'border-gold bg-gold/10 text-white'
      : 'border-border hover:border-gold/40 text-white/70 hover:text-white',
  ].join(' ')
}

/** 加减步进器外壳（描金描边） */
function StepperBox({ children }: { children: ReactNode }) {
  return <div className="flex items-center rounded-lg overflow-hidden border border-gold/20">{children}</div>
}

/** 步进器加减按钮（统一 hover 反馈） */
function StepButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="px-2.5 py-1 text-gold/70 hover:text-gold hover:bg-gold/10 transition-colors text-sm font-bold inline-flex items-center">
      {children}
    </button>
  )
}

/** 步进器数值展示区 */
function StepValue({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <span className={`${wide ? 'w-12' : 'w-10'} text-center text-sm text-white/90 font-medium py-1`} style={stepValueStyle}>
      {children}
    </span>
  )
}

/** 拨杆配色：选中态轨道与滑钮色（gold/crimson/orange 三色系） */
const toggleToneClass: Record<'gold' | 'crimson' | 'orange', { track: string; knob: string }> = {
  gold: { track: 'bg-gold/50', knob: 'bg-gold' },
  crimson: { track: 'bg-crimson/50', knob: 'bg-crimson' },
  orange: { track: 'bg-orange-400/50', knob: 'bg-orange-400' },
}

/** 拨杆开关轨道（sm 紧凑行 / lg 主开关；gold/crimson/orange 三色系） */
function ToggleTrack({ checked, tone = 'gold', size = 'sm' }: {
  checked: boolean
  tone?: 'gold' | 'crimson' | 'orange'
  size?: 'sm' | 'lg'
}) {
  const toneCls = toggleToneClass[tone]
  const isLg = size === 'lg'
  return (
    <div className={`${isLg ? 'w-9 h-5' : 'w-8 h-4'} rounded-full transition-all duration-200 relative shrink-0 ${checked ? toneCls.track : 'bg-white/10'}`}>
      <div className={`absolute top-0.5 ${isLg ? 'w-4 h-4' : 'w-3 h-3'} rounded-full transition-all duration-200 ${
        checked ? `${isLg ? 'left-[18px]' : 'left-[17px]'} ${toneCls.knob}` : 'left-0.5 bg-white/30'
      }`} />
    </div>
  )
}

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
    <PageContainer size="sm">
      <HeroHeader
        icon={<Swords size={18} />}
        title="创建房间"
        subtitle={presetLabel ? `基于：${presetLabel}` : '选好牌组和规则，创建对局'}
        onBack={() => navigate(-1)}
      />

      <AnimatePresence mode="wait">
        {createdRoom ? (
          // Success state
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border border-border rounded-xl p-8 text-center"
          >
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
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: copied ? 1 : 0 }}
              className="text-green-400 text-xs mb-1 flex items-center justify-center gap-1"
            >
              <Check size={12} />
              复制成功
            </motion.p>
            <p className="text-muted text-xs mb-8">
              点击邀请码即可复制
            </p>
            {/* 进入房间主按钮 */}
            <Button size="lg" className="w-full font-serif" icon={<Play size={16} />} onClick={() => navigate(paths.room(createdRoom.id))}>
              进入房间
            </Button>
          </motion.div>
        ) : (
          // Form
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <form
              onSubmit={handleSubmit}
              className="rounded-2xl p-6 flex flex-col gap-6"
              style={sectionBoxStyle}
            >
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
                    <button
                      type="button"
                      onClick={() => navigate(paths.decks())}
                      className="text-gold underline ml-1 hover:text-gold-light transition-colors"
                    >
                      去创建一副！
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-scroll-lg overflow-y-auto">
                    {decks.map((deck) => (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => setSelectedDeckId(deck.id)}
                        className={optionCardClass(selectedDeckId === deck.id, 'flex items-center gap-3 px-4 py-3 text-left')}
                      >
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center font-serif text-gold text-sm shrink-0"
                          style={{
                            background: 'rgb(var(--accent-primary)/ 0.1)',
                            border: '1px solid rgb(var(--accent-primary)/ 0.2)',
                          }}
                        >
                          <Music size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-sans font-medium truncate">{deck.name}</div>
                          <div className="text-xs text-muted">{deck.card_count} 张</div>
                        </div>
                        {selectedDeckId === deck.id && (
                          <Check size={14} className="text-gold shrink-0" />
                        )}
                      </button>
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
                  {config.intervalSec >= 20 && <span className="text-green-400 ml-1 text-xs">（慢节奏）</span>}
                </label>
                <input
                  type="range"
                  min={3}
                  max={30}
                  step={1}
                  value={config.intervalSec}
                  onChange={(e) => update('intervalSec', parseInt(e.target.value, 10))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgb(var(--color-gold)) ${((config.intervalSec - 3) / 27) * 100}%, rgb(var(--color-surface)) ${((config.intervalSec - 3) / 27) * 100}%)`,
                  }}
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
                  <button
                    type="button"
                    onClick={() => update('mode', 'auto')}
                    className={optionCardClass(config.mode === 'auto', 'flex flex-col items-center gap-1.5 px-3 py-3 text-left')}
                  >
                    <Bot size={20} />
                    <span className="text-xs font-medium">自动模式</span>
                    <span className="text-xs text-muted text-center leading-relaxed">系统自动播放</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => update('mode', 'judge')}
                    className={optionCardClass(config.mode === 'judge', 'flex flex-col items-center gap-1.5 px-3 py-3 text-left')}
                  >
                    <Crown size={20} />
                    <span className="text-xs font-medium">裁判模式</span>
                    <span className="text-xs text-muted text-center leading-relaxed">房主手动选牌</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => update('mode', 'duel')}
                    className={optionCardClass(config.mode === 'duel', 'flex flex-col items-center gap-1.5 px-3 py-3 text-left')}
                  >
                    <Swords size={20} />
                    <span className="text-xs font-medium">对阵模式 <span className="text-[9px] px-1 py-0.5 rounded bg-crimson/20 text-crimson/80 ml-0.5">内测</span></span>
                    <span className="text-xs text-muted text-center leading-relaxed">1v1 花牌决斗</span>
                  </button>
                </div>
              </div>

              {/* Duel mode config */}
              {config.mode === 'duel' && (
                <div className="rounded-xl p-4" style={sectionBoxStyle}>
                  <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Swords size={12} />对阵配置</h3>
                  <div className="space-y-3">
                    {/* 总牌数 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">总牌数</p>
                        <p className="text-[10px] text-muted/50">每人分到一半</p>
                      </div>
                      <StepperBox>
                        <StepButton onClick={() => update('duelTotalCards', Math.max(10, config.duelTotalCards - 10))}><Minus size={12} /></StepButton>
                        <StepValue>{config.duelTotalCards}</StepValue>
                        <StepButton onClick={() => update('duelTotalCards', Math.min(100, config.duelTotalCards + 10))}><Plus size={12} /></StepButton>
                      </StepperBox>
                    </div>
                    {/* 每轮时间 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">每轮时间</p>
                        <p className="text-[10px] text-muted/50">超时则无人得牌</p>
                      </div>
                      <StepperBox>
                        <StepButton onClick={() => update('duelRoundTime', Math.max(30, config.duelRoundTime - 10))}><Minus size={12} /></StepButton>
                        <StepValue>{config.duelRoundTime}s</StepValue>
                        <StepButton onClick={() => update('duelRoundTime', Math.min(120, config.duelRoundTime + 10))}><Plus size={12} /></StepButton>
                      </StepperBox>
                    </div>
                    {/* 拍牌次数 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">拍牌次数</p>
                        <p className="text-[10px] text-muted/50">每轮可拍错几次</p>
                      </div>
                      <StepperBox>
                        <StepButton onClick={() => update('duelGrabChances', Math.max(1, config.duelGrabChances - 1))}><Minus size={12} /></StepButton>
                        <StepValue>{config.duelGrabChances}</StepValue>
                        <StepButton onClick={() => update('duelGrabChances', Math.min(5, config.duelGrabChances + 1))}><Plus size={12} /></StepButton>
                      </StepperBox>
                    </div>
                    {/* 最大轮次 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">最大轮次</p>
                        <p className="text-[10px] text-muted/50">0 = 无限</p>
                      </div>
                      <StepperBox>
                        <StepButton onClick={() => update('duelMaxRounds', Math.max(0, config.duelMaxRounds - 5))}><Minus size={12} /></StepButton>
                        <StepValue>{config.duelMaxRounds || '∞'}</StepValue>
                        <StepButton onClick={() => update('duelMaxRounds', config.duelMaxRounds + 5)}><Plus size={12} /></StepButton>
                      </StepperBox>
                    </div>
                    {/* 排阵时间 */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">排阵时间</p>
                        <p className="text-[10px] text-muted/50">开局前调整布局(秒)</p>
                      </div>
                      <StepperBox>
                        <StepButton onClick={() => update('duelArrangeTime', Math.max(10, config.duelArrangeTime - 10))}><Minus size={12} /></StepButton>
                        <StepValue wide>{config.duelArrangeTime}s</StepValue>
                        <StepButton onClick={() => update('duelArrangeTime', Math.min(300, config.duelArrangeTime + 10))}><Plus size={12} /></StepButton>
                      </StepperBox>
                    </div>
                    {/* 开关项 */}
                    <div className="space-y-2 pt-1">
                      <div onClick={() => update('duelFlip', !config.duelFlip)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                          config.duelFlip ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                        }`}>
                        <ToggleTrack checked={config.duelFlip} />
                        <div>
                          <p className={`text-xs font-medium flex items-center gap-1.5 ${config.duelFlip ? 'text-white/80' : 'text-white/40'}`}>
                            <FlipHorizontal2 size={11} />
                            对方区牌面倒置
                          </p>
                          <p className="text-[10px] text-muted/50">增加辨认难度！</p>
                        </div>
                      </div>
                      <div onClick={() => update('duelRequeue', !config.duelRequeue)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                          config.duelRequeue ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                        }`}>
                        <ToggleTrack checked={config.duelRequeue} />
                        <div>
                          <p className={`text-xs font-medium flex items-center gap-1.5 ${config.duelRequeue ? 'text-white/80' : 'text-white/40'}`}>
                            <RefreshCw size={11} />
                            歌曲重入队
                          </p>
                          <p className="text-[10px] text-muted/50">超时未抢的歌会再次出现</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
                  <ToggleTrack checked={config.maskEnabled} size="lg" />
                  <div>
                    <span className={`text-sm ${config.maskEnabled ? 'text-white/90' : 'text-white/60'}`}>开启模糊牌面</span>
                    <p className="text-xs text-pink-300/40 mt-0.5">封面图会被随机遮罩，增加辨识难度</p>
                  </div>
                </div>
                {config.maskEnabled && (
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    {([
                      { key: 'easy', label: '简单', desc: '遮1/4' },
                      { key: 'normal', label: '普通', desc: '遮1/2' },
                      { key: 'hard', label: '困难', desc: '遮3/4' },
                    ] as const).map(({ key, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => update('maskDifficulty', key)}
                        className={optionCardClass(config.maskDifficulty === key, 'flex flex-col items-center gap-1 px-3 py-2.5 text-center')}
                      >
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-xs text-muted">{desc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 扣分设置（duel 无效隐藏：对阵用「抢牌机会数」惩罚，抢错/抢慢扣分仅 auto/judge
                  生效——2026-09-21 参数有效性矩阵修复） */}
              {config.mode !== 'duel' && (
              <div className="rounded-xl p-4" style={sectionBoxStyle}>
                <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Zap size={12} />惩罚规则</h3>
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
                      <ToggleTrack checked={item.checked} tone="crimson" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium flex items-center gap-1.5 ${item.checked ? 'text-white/80' : 'text-white/40'}`}>
                          <item.icon size={11} />
                          {item.label}
                        </p>
                        <p className="text-[10px] text-muted/50">{item.desc}</p>
                      </div>
                      <span className={`text-[10px] shrink-0 ${item.checked ? 'text-crimson/70' : 'text-white/20'}`}>
                        {item.checked ? '-1' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-muted/40 text-[10px] mt-2 text-center font-serif">关闭后仅禁止本轮继续抢，不扣分</p>
                {/* 倒数N首开启惩罚 */}
                {config.penaltyWrong && (
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold/10">
                    <div>
                      <p className="text-xs text-white/70">倒数N首开启</p>
                      <p className="text-[10px] text-muted/50">0=全程扣分</p>
                    </div>
                    <StepperBox>
                      <StepButton onClick={() => update('penaltyLast', Math.max(0, config.penaltyLast - 5))}><Minus size={12} /></StepButton>
                      <StepValue wide>{config.penaltyLast || '全程'}</StepValue>
                      <StepButton onClick={() => update('penaltyLast', config.penaltyLast + 5)}><Plus size={12} /></StepButton>
                    </StepperBox>
                  </div>
                )}
              </div>
              )}

              {/* 牌面打乱（对阵模式不需要） */}
              {/* —— 高级设置（A 轮增补：渐进披露，默认收起，非常用 20% 字段收纳于此） —— */}
              <button type="button" onClick={() => setAdvancedOpen(v => !v)}
                className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:border-gold/30 transition-all">
                <span className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                  <Wrench size={12} /> 高级设置
                  {advancedCount > 0 && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 text-gold">{advancedCount} 项已调</span>
                  )}
                </span>
                <span className="text-[10px] text-muted">{advancedOpen ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              {advancedOpen && (<>

              {config.mode !== 'duel' && <div className="rounded-xl p-4" style={sectionBoxStyle}>
                <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Shuffle size={12} />牌面打乱</h3>
                <div onClick={() => update('shuffleEnabled', !config.shuffleEnabled)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                    config.shuffleEnabled ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                  }`}>
                  <ToggleTrack checked={config.shuffleEnabled} />
                  <div>
                    <p className={`text-xs font-medium flex items-center gap-1.5 ${config.shuffleEnabled ? 'text-white/80' : 'text-white/40'}`}>
                      <Tornado size={11} />
                      每轮抢完后打乱牌面
                    </p>
                    <p className="text-[10px] text-muted/50">增加混乱度，考验记忆力！</p>
                  </div>
                </div>
                {config.shuffleEnabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-muted text-xs">剩余</span>
                    <StepperBox>
                      <StepButton onClick={() => update('shuffleRemaining', Math.max(1, config.shuffleRemaining - 1))}><Minus size={12} /></StepButton>
                      <input type="text" value={config.shuffleRemaining}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update('shuffleRemaining', Math.min(99, Math.max(1, v))) }}
                        className="w-8 text-center text-sm text-white/90 font-medium bg-transparent outline-none py-1"
                        style={stepValueStyle} />
                      <StepButton onClick={() => update('shuffleRemaining', Math.min(99, config.shuffleRemaining + 1))}><Plus size={12} /></StepButton>
                    </StepperBox>
                    <span className="text-muted text-xs">张时开始打乱</span>
                  </div>
                )}
              </div>}

              {/* 多音频牌模式（duel 模式强制 once，不展示选择） */}
              {config.mode !== 'duel' && <div className="rounded-xl p-4" style={sectionBoxStyle}>
                <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Music size={12} />多音频牌</h3>
                <div className="flex gap-2">
                  {([
                    { value: 'all', label: '全部播完', desc: 'N首全抢完才消失' },
                    { value: 'once', label: '拍一次消失', desc: '抢到第一首就消失' },
                  ] as const).map(({ value, label, desc }) => (
                    <button key={value} type="button" onClick={() => update('multiAudioMode', value)}
                      className={optionCardClass(config.multiAudioMode === value, 'flex-1 p-2.5 rounded-lg text-center')}>
                      <p className={`text-xs font-medium ${config.multiAudioMode === value ? 'text-gold' : 'text-white/50'}`}>{label}</p>
                      <p className="text-[9px] text-muted/50 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>}

              {/* 最短播放时间 */}
              {config.mode !== 'duel' && (
                <div className="rounded-xl p-4" style={sectionBoxStyle}>
                  <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Hourglass size={12} />最短播放时间</h3>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-white/60">短歌也要播够这么久才能进入下一首</p>
                    <StepperBox>
                      <StepButton onClick={() => update('minPlayTime', config.minPlayTime <= 10 ? 0 : config.minPlayTime - 5)}><Minus size={12} /></StepButton>
                      <StepValue wide>{config.minPlayTime || '关闭'}</StepValue>
                      <StepButton onClick={() => update('minPlayTime', config.minPlayTime === 0 ? 10 : Math.min(60, config.minPlayTime + 5))}><Plus size={12} /></StepButton>
                    </StepperBox>
                  </div>
                  {config.minPlayTime > 0 && <p className="text-muted/40 text-[10px] mt-2">即使歌曲不到 {config.minPlayTime}s，也会等到 {config.minPlayTime}s 再进入间隔</p>}
                </div>
              )}

              {/* 随机片段播放 */}
              <div className="rounded-xl p-4" style={sectionBoxStyle}>
                <h3 className="text-gold/80 text-xs font-serif mb-3 flex items-center gap-1.5"><Dices size={12} />随机片段</h3>
                <div onClick={() => update('randomStart', !config.randomStart)}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                    config.randomStart ? 'bg-gold/10 border border-gold/25' : 'bg-white/5 border border-white/5'
                  }`}>
                  <ToggleTrack checked={config.randomStart} />
                  <div>
                    <p className={`text-xs font-medium flex items-center gap-1.5 ${config.randomStart ? 'text-white/80' : 'text-white/40'}`}>
                      <Play size={11} />
                      每首歌从随机位置开始播放
                    </p>
                    <p className="text-[10px] text-muted/50">不从头播，增加听歌难度！</p>
                  </div>
                </div>
                {config.randomStart && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-muted text-xs">最大起始位置</span>
                    <StepperBox>
                      <StepButton onClick={() => update('randomStartMax', Math.max(10, config.randomStartMax - 10))}><Minus size={12} /></StepButton>
                      <input type="text" value={config.randomStartMax}
                        onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) update('randomStartMax', Math.min(80, Math.max(10, v))) }}
                        className="w-8 text-center text-sm text-white/90 font-medium bg-transparent outline-none py-1"
                        style={stepValueStyle} />
                      <span className="text-white/50 text-xs pr-1">%</span>
                      <StepButton onClick={() => update('randomStartMax', Math.min(80, config.randomStartMax + 10))}><Plus size={12} /></StepButton>
                    </StepperBox>
                  </div>
                )}
              </div>

              {/* 房主测试模式（移入高级区） */}
              {config.mode !== 'duel' && (
                <div onClick={() => {
                  const next = !config.training
                  update('training', next)
                  // Owner 裁定（2026-09-21）：测试局=私密房——开启测试即自动私密
                  update('isPrivate', next)
                }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    config.training ? 'border border-orange-400/30 bg-orange-400/5' : 'border border-white/10 bg-white/5 hover:border-white/20'
                  }`}>
                  <ToggleTrack checked={config.training} tone="orange" size="lg" />
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${config.training ? 'text-orange-300/90' : 'text-white/50'}`}>
                      {config.training ? <Wrench size={12} /> : <Users size={12} />}
                      {config.training ? '房主测试局（私密）' : '多人模式'}
                    </p>
                    <p className="text-[10px] text-muted/50">
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
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    config.isPrivate ? 'border border-gold/30 bg-gold/5' : 'border border-white/10 bg-white/5 hover:border-white/20'
                  }`}>
                  <ToggleTrack checked={config.isPrivate} size="lg" />
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${config.isPrivate ? 'text-gold/90' : 'text-white/50'}`}>
                      {config.isPrivate ? <EyeOff size={12} /> : <Globe size={12} />}
                      {config.isPrivate ? '私密房间' : '公开房间'}
                    </p>
                    <p className="text-[10px] text-muted/50">
                      {config.isPrivate ? '不在大厅展示，凭邀请码进入' : '展示在首页活跃战场列表'}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5">
                <div>
                  <p className="text-xs font-medium text-white/80 flex items-center gap-1.5"><Users size={11} /> 人数上限</p>
                  <p className="text-[10px] text-muted/50">满员后新玩家只能旁观（2-32）</p>
                </div>
                <input type="number" min={2} max={32} value={config.maxPlayers}
                  onChange={e => update('maxPlayers', Math.min(32, Math.max(2, parseInt(e.target.value) || 16)))}
                  className="w-16 text-center text-sm px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80 outline-none focus:border-gold/40" />
              </div>
              </>)}

              {/* —— 配置摘要条（A 轮增补：提交前零意外） —— */}
              <div className="flex items-center gap-1.5 flex-wrap px-1">
                <span className="text-[10px] text-muted/60 font-serif">当前配置：</span>
                {[
                  config.mode === 'duel' ? '对决' : config.mode === 'judge' ? '裁判' : '自动',
                  ...(config.mode !== 'duel' ? [`${config.intervalSec}s 间隔`] : [`${config.duelRoundTime}s/轮`]),
                  config.penaltyWrong || config.penaltySlow ? '有扣分' : '无惩罚',
                  config.maskEnabled ? `模糊·${config.maskDifficulty === 'easy' ? '简单' : config.maskDifficulty === 'hard' ? '困难' : '普通'}` : null,
                  config.isPrivate ? '私密' : null,
                  config.training ? '测试局' : null,
                ].filter(Boolean).map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-gold/90">{tag}</span>
                ))}
              </div>

              {/* C 轮：牌组画像智能提示（数据已就位，零额外成本） */}
              {audioStats && audioStats.avg > 0 && config.mode !== 'duel' && (
                <p className="text-[10px] text-muted/50 text-center font-serif">
                  本牌组平均 {audioStats.avg}s/首
                  {audioStats.avg > 60 && config.intervalSec > 10 && ' — 长曲为主，间隔可调小让节奏更紧凑'}
                  {audioStats.multiRatio >= 0.4 && config.multiAudioMode === 'all' && '；多音频牌较多，可试试「拍一次消失」'}
                </p>
              )}

              {error && (
                <p className="text-crimson text-sm bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </p>
              )}

              {/* 保存为我的预设（B 轮增补） */}
              <button type="button" onClick={() => setPresetDialogOpen(true)}
                className="text-[11px] text-gold/70 hover:text-gold underline underline-offset-2 self-center transition-colors">
                ⭐ 把当前配置保存为我的预设
              </button>

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
            </form>
          </motion.div>
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
        <input type="text" value={presetName} onChange={e => setPresetName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSavePreset() }}
          maxLength={20} placeholder="给这组配置起个名字（20 字内）" autoFocus
          className="w-full text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/85 outline-none focus:border-gold/40" />
        <p className="text-[10px] text-muted/50 mt-2">保存后可在「快速开局」弹层的「我的预设」中一键使用（本机存储）</p>
      </Dialog>
    </PageContainer>
  )
}
