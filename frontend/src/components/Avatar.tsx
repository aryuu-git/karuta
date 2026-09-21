interface AvatarProps {
  username: string
  avatarUrl?: string
  size?: number
  className?: string
}

export function Avatar({ username, avatarUrl, size = 24, className = '' }: AvatarProps) {
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 overflow-hidden font-bold border border-gold/30 text-gold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        // 渐变背景保留 inline（条件依赖 avatarUrl，无法用类表达）
        background: avatarUrl ? undefined : 'linear-gradient(135deg, rgb(var(--accent-primary)/ 0.3), rgb(var(--accent-bg-end)/ 0.8))',
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
