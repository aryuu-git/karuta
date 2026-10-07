/**
 * 统一头像：用户名首字母回退 + 图片裁切 + 描金边框。
 * 从 components/ 晋升 ui/（通用展示件）。首字母字号随尺寸等比缩放（动态值）。
 */
export interface AvatarProps {
  username: string
  avatarUrl?: string
  size?: number
  className?: string
}

export function Avatar({ username, avatarUrl, size = 24, className = '' }: AvatarProps) {
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 overflow-hidden font-bold border border-gold/30 text-gold ${avatarUrl ? '' : 'bg-gradient-to-br from-accent/30 to-accent-bg-end/80'} ${className}`}
      style={{
        width: size,
        height: size,
        // 首字母随头像尺寸等比缩放（动态值，无法用字阶类表达）
        fontSize: size * 0.4,
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        username.charAt(0).toUpperCase()
      )}
    </div>
  )
}
