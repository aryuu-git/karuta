import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link2, Copy, Share2 } from 'lucide-react'
import { Button, useToast } from '../../components/ui'
import { inviteLink } from './roomCreate'

/** 邀请面板（§4.4）：大字房间码 + 复制邀请链接/复制码 + 系统分享（支持才显示） */
export interface InvitePanelProps {
  code: string
  /** 进入时自动高亮房间码（便于直接复制） */
  autoFocus?: boolean
  className?: string
}

/**
 * 复制一段文本到剪贴板；失败返回 false（降级提示，不抛错）。
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function InvitePanel({ code, autoFocus = false, className = '' }: InvitePanelProps) {
  const toast = useToast()
  const codeRef = useRef<HTMLDivElement>(null)
  const [canShare] = useState(() => typeof navigator.share === 'function')

  // 进入时高亮房间码，便于直接复制（仅在显式要求时）
  useEffect(() => {
    if (!autoFocus || !codeRef.current) return
    const range = document.createRange()
    range.selectNodeContents(codeRef.current)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [autoFocus])

  const handleCopyLink = async () => {
    const ok = await copyText(inviteLink(code))
    toast.show(ok ? '链接已复制，发给战友吧 ✧' : '复制失败，请手动复制', ok ? 'success' : 'fail', 2500)
  }

  const handleCopyCode = async () => {
    const ok = await copyText(code)
    toast.show(ok ? '邀请码已复制' : '复制失败，请手动复制', ok ? 'success' : 'fail', 2000)
  }

  const handleShare = async () => {
    try {
      await navigator.share({ title: '二次元歌牌大乱斗', text: `房间码 ${code}，一起来抢牌`, url: inviteLink(code) })
    } catch {
      /* 用户取消分享，忽略 */
    }
  }

  return (
    <div className={`rounded-2xl p-5 ${className}`}
      style={{ background: 'linear-gradient(180deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', border: '1px solid rgb(var(--accent-primary)/ 0.12)' }}>
      <p className="text-gold/60 text-caption font-serif tracking-widest text-center mb-3">邀请战友</p>

      <div
        ref={codeRef}
        className="text-center font-mono text-5xl sm:text-6xl font-bold tracking-[0.25em] text-gold select-all cursor-pointer mb-4"
        style={{ textShadow: '0 0 30px rgb(var(--accent-primary)/ 0.5)' }}
        onClick={handleCopyCode}
        title="点击复制邀请码"
      >
        {code}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-center gap-2"
      >
        <Button size="sm" icon={<Link2 size={14} />} onClick={handleCopyLink}>
          复制邀请链接
        </Button>
        <Button size="sm" variant="outline" icon={<Copy size={14} />} onClick={handleCopyCode}>
          复制码
        </Button>
        {canShare && (
          <Button size="sm" variant="outline" icon={<Share2 size={14} />} onClick={handleShare}>
            系统分享
          </Button>
        )}
      </motion.div>
    </div>
  )
}
