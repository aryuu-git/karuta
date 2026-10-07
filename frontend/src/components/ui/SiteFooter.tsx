import { ExternalLink } from 'lucide-react'

/**
 * 开源仓库页脚（2026-09-30 位置评审）：低频元信息归内容页底注，
 * 取代顶栏 GitHub 图标钮——开发者语义不与玩家主操作抢第一视觉层。
 * 由 ListPageShell 模板壳统一挂载（首页/个人页手动挂），对局/认证页不挂。
 */
export function SiteFooter() {
  return (
    <footer className="mt-8 flex justify-center">
      <a
        href="https://github.com/aryuu-git/karuta"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-tiny text-muted/70 hover:text-gold transition-colors duration-fast"
      >
        <span aria-hidden="true">🌸</span>
        开源仓库 · GitHub
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    </footer>
  )
}
