import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Input } from '../../components/ui'
import { Plus } from 'lucide-react'

interface CustomTagDialogProps {
  open: boolean
  /** 确认回调（入参为去空白的标签名） */
  onConfirm: (tag: string) => void
  onCancel: () => void
}

/** 自定义标签弹窗：输入标签名，回车或确认后交由页面并入表单标签 */
export function CustomTagDialog({ open, onConfirm, onCancel }: CustomTagDialogProps) {
  const [value, setValue] = useState('')

  // 每次打开时清空输入（与原打开时 setNewTagInput('') 行为一致）
  useEffect(() => {
    if (open) setValue('')
  }, [open])

  /** 确认：非空时回调并关闭；空值仅关闭（与原确认按钮行为一致） */
  const confirm = () => {
    if (value.trim()) onConfirm(value.trim())
    onCancel()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={onCancel}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-xs rounded-2xl p-5"
            style={{ background: 'linear-gradient(160deg, rgb(var(--color-ink)), rgb(var(--color-ink-deep)))', border: '1px solid rgb(var(--accent-primary)/ 0.2)' }}
            onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-gold text-base mb-1">✦ 自定义标签</h3>
            <p className="text-pink-300/40 text-xs mb-4 font-serif">为歌牌赋予独特属性吧～</p>
            <Input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && value.trim()) confirm()
              }}
              className="text-sm mb-4"
              placeholder="输入标签名…"
              autoFocus
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onCancel}>取消</Button>
              <Button onClick={confirm} disabled={!value.trim()}>
                <Plus className="mr-0.5 inline h-3 w-3" /> 添加
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
