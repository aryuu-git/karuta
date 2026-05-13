interface AvatarProps {
  username: string
  avatarUrl?: string
  size?: number
  className?: string
}

export function Avatar({ username, avatarUrl, size = 24, className = '' }: AvatarProps) {
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 overflow-hidden font-bold ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: avatarUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-primary),0.3), rgba(var(--accent-bg-end),0.8))',
        border: '1px solid rgba(var(--accent-primary),0.3)',
        color: 'var(--color-gold)',
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
