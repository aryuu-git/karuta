import { useState } from 'react'
import { Copy, Check, Wand2 } from 'lucide-react'
import { ModalSurface, Button, useToast } from './ui'
import { PACK_PROMPT } from '../utils/packPrompt'

/**
 * AI 制作导入包弹窗（2026-09-30）：格式规格即提示词——用户把它投喂给自己的
 * AI 助手产出 .zip，再走现有导入流程。规格与 cardPack/deckPack 的 manifest
 * 结构同源（权威文档 docs/capabilities/09-pack-format.md）。
 */
export function PackPromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PACK_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.show('提示词已复制，发给你的 AI 助手吧 ✧', 'success', 2500)
    } catch {
      toast.show('复制失败，请手动全选复制', 'fail', 2500)
    }
  }

  return (
    <ModalSurface open={open} onClose={onClose} title="用 AI 制作导入包" size="lg">
      <div className="space-y-3">
        <p className="text-caption text-muted leading-relaxed">
          把下面的提示词发给你的 AI 助手（ChatGPT / Claude / 各类 Agent 均可），
          让它把你的歌曲和封面按规格做成 .zip，再回到本页导入。
          AI 无法直接产出 zip 时，会给出 manifest.json 与文件清单，自行打包即可。
        </p>
        <pre className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-ink-deep p-4 font-mono text-tiny text-muted/90 leading-relaxed">{PACK_PROMPT}</pre>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-tiny text-muted/70">
            <Wand2 size={12} aria-hidden="true" />
            产出的 .zip 回来点「导入」即可
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
            <Button size="sm" onClick={handleCopy} icon={copied ? <Check size={12} /> : <Copy size={12} />}>
              {copied ? '已复制' : '复制提示词'}
            </Button>
          </div>
        </div>
      </div>
    </ModalSurface>
  )
}
