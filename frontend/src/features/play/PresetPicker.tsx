import { useEffect, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button, Dialog, Select } from '../../components/ui'
import type { Deck } from '../../api/types'
import type { RoomConfig } from './roomConfig'
import { PRESETS, loadCustomPresets, removeCustomPreset, type CustomPreset } from './presets'

export type { RoomPreset } from './presets'

/** PresetPicker（§4.2）：快速开局弹层，选预设 + 选牌组 → 直接创建或跳完整表单 */
export interface PresetPickerProps {
  open: boolean
  decks: Deck[]
  /** 锁定牌组（从牌组页进入时传入，禁用牌组切换） */
  defaultDeckId?: number
  /** 上次配置；无则隐藏「上次配置」整行 */
  lastConfig?: RoomConfig | null
  /** 直接创建（选中预设 + 牌组） */
  onSelect: (config: RoomConfig, deckId: number) => void
  /** 跳完整表单（携带预设配置） */
  onCustomize: (config: RoomConfig, deckId: number) => void
  /** 创建进行中：主按钮 loading 锁定，防重复提交（消费方负责防重入，此 prop 提供视觉反馈） */
  loading?: boolean
  onClose: () => void
}

/** 模式代号 → 展示名（用于「上次配置」摘要） */
const MODE_LABEL: Record<RoomConfig['mode'], string> = {
  auto: '标准',
  judge: '裁判',
  duel: '决斗',
}

interface PresetRow {
  key: string
  label: string
  desc: string
  config: RoomConfig
}

export function PresetPicker({ open, decks, defaultDeckId, lastConfig, onSelect, onCustomize, loading = false, onClose }: PresetPickerProps) {
  // 可选预设行：有上次配置则置顶追加（说明文字由配置派生）
  // 我的预设（B 轮增补）：每次打开重载
  const [customs, setCustoms] = useState<CustomPreset[]>([])
  useEffect(() => {
    if (open) setCustoms(loadCustomPresets())
  }, [open])

  const rows = useMemo<PresetRow[]>(() => {
    const list: PresetRow[] = []
    if (lastConfig) {
      list.push({ key: 'last', label: '上次配置', desc: `${MODE_LABEL[lastConfig.mode]} · ${lastConfig.intervalSec}s`, config: lastConfig })
    }
    list.push(...customs.map(c => ({ key: c.key, label: `★ ${c.label}`, desc: c.desc, config: c.config })))
    list.push(...PRESETS)
    return list
  }, [lastConfig, customs])

  const handleRemoveCustom = (key: string) => {
    setCustoms(removeCustomPreset(key))
    if (selectedKey === key) setSelectedKey(lastConfig ? 'last' : PRESETS[0].key)
  }

  const [selectedKey, setSelectedKey] = useState<string>(() => (lastConfig ? 'last' : PRESETS[0].key))
  const [deckId, setDeckId] = useState<number | null>(() => defaultDeckId ?? decks[0]?.id ?? null)
  const deckLocked = defaultDeckId !== undefined

  // 牌组异步加载后回填默认选中（组件常驻挂载，初始 decks 可能为空）
  useEffect(() => {
    if (deckId === null && !deckLocked && decks.length > 0) {
      setDeckId(decks[0].id)
    }
  }, [decks, deckId, deckLocked])

  const selectedConfig = rows.find(r => r.key === selectedKey)?.config ?? PRESETS[0].config
  const canSubmit = deckId !== null

  const deckOptions = decks.map(d => ({ value: String(d.id), label: `${d.name}（${d.card_count}张）` }))

  return (
    <Dialog open={open} onClose={onClose} title="快速开局" size="md">
      <div className="flex flex-col gap-4">
        {/* 预设单选列表 */}
        <div className="flex flex-col gap-1.5">
          {rows.map(row => {
            const active = row.key === selectedKey
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => setSelectedKey(row.key)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                  active ? 'border-gold bg-gold/10' : 'border-border hover:border-gold/40 bg-white/5'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                  active ? 'border-gold' : 'border-muted/50'
                }`}>
                  {active && <span className="w-2 h-2 rounded-full bg-gold" />}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium ${active ? 'text-gold' : 'text-white/80'}`}>{row.label}</span>
                  <span className="text-tiny text-muted ml-2">{row.desc}</span>
                </div>
                {row.key.startsWith('custom-') && (
                  <span
                    role="button"
                    aria-label="删除预设"
                    onClick={e => { e.stopPropagation(); handleRemoveCustom(row.key) }}
                    className="text-muted/40 hover:text-crimson transition-colors shrink-0 p-1">
                    <X size={12} />
                  </span>
                )}
                {active && <Check size={14} className="text-gold shrink-0" />}
              </button>
            )
          })}
        </div>

        {/* 牌组选择（唯一必选） */}
        {decks.length === 0 ? (
          <p className="text-muted text-caption text-center py-2">还没有牌组，先去牌组页创建一副</p>
        ) : (
          <Select
            label="牌组"
            value={deckId !== null ? String(deckId) : ''}
            disabled={deckLocked}
            options={deckOptions}
            onChange={v => setDeckId(parseInt(v, 10))}
            hint={deckLocked ? '已锁定该牌组' : undefined}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" size="sm" disabled={!canSubmit || loading} onClick={() => onCustomize(selectedConfig, deckId as number)}>
          查看完整配置
        </Button>
        <Button size="sm" disabled={!canSubmit} loading={loading} onClick={() => onSelect(selectedConfig, deckId as number)}>
          开辟战场
        </Button>
      </div>
    </Dialog>
  )
}
