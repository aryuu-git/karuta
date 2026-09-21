import { useState, useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
// 图标统一走 lucide-react（映射约定见 A3.1–A3.4）
import { KeyRound, Play, Swords, AlertCircle } from 'lucide-react'
import { Button, Input, PageContainer, HeroHeader, EmptyState } from '../components/ui'
import { api } from '../api/client'
import { useAuth } from '../hooks/useAuth'
import { paths } from '../routes/paths'

/** 凭邀请码入房页：深链预填 + 已登录自动加入；手动输入校验 → 加入房间。 */
export function JoinRoomPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  // 深链邀请码：/rooms/join?code=XXXXXX
  const deepCode = (searchParams.get('code') ?? '').toUpperCase()

  const [code, setCode] = useState(deepCode)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoJoinRef = useRef(false)

  // 加入：邀请码规整后调用接口，成功跳房间详情，失败展示错误提示（不清输入）
  const doJoin = async (target: string) => {
    setJoining(true)
    setError(null)
    try {
      const res = await api.rooms.join(target)
      navigate(paths.room(res.room.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入失败，请检查邀请码')
    } finally {
      setJoining(false)
    }
  }

  // 深链自动加入：已登录且链接带 code，挂载后自动提交一次（防重复触发）
  useEffect(() => {
    if (user && deepCode && !autoJoinRef.current) {
      autoJoinRef.current = true
      void doJoin(deepCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, deepCode])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) {
      setError('请输入邀请码')
      return
    }
    await doJoin(trimmed)
  }

  // 输入过滤：仅放行字母数字与编辑类按键（邀请码字符集约束）
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const allowed = /^[a-zA-Z0-9]$/
    if (!allowed.test(e.key) && !['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault()
    }
  }

  // 未登录（公开路由防御态）：登录或游客双通道，链接中的邀请码保留
  if (!user) {
    return (
      <div className="min-h-screen washi-bg">
      <PageContainer size="sm">
        <HeroHeader icon={<KeyRound size={18} />} title="加入房间" onBack={() => navigate(-1)} />
        <EmptyState
          icon="🗝️"
          title="先登录再加入"
          description={deepCode ? `邀请码 ${deepCode} 已保留，登录后自动加入` : '登录或注册后即可加入对局'}
          action={
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button onClick={() => navigate(paths.login(), { state: { from: location.pathname + location.search } })}>
                登录 / 注册
              </Button>
              {deepCode && (
                <Button variant="outline" onClick={() => navigate(`${paths.guest()}?code=${deepCode}`)}>
                  游客快速入场
                </Button>
              )}
            </div>
          }
        />
      </PageContainer>
      </div>
    )
  }

  return (
    <div className="min-h-screen washi-bg">
    <PageContainer size="sm">
      <HeroHeader
        icon={<KeyRound size={18} />}
        title="加入房间"
        onBack={() => navigate(-1)}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface border border-border rounded-xl p-8"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🗝️</div>
          <p className="text-gold text-sm font-serif tracking-widest mb-1">输入邀请码</p>
          <p className="text-muted text-xs">向朋友索取邀请码，加入对局</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            className="text-center font-serif font-bold tracking-[0.3em]"
            style={{ fontSize: '2rem', letterSpacing: '0.3em' }}
            placeholder="XXXXXX"
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            autoFocus
          />

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-crimson text-sm bg-crimson/10 border border-crimson/30 rounded-lg px-3 py-2.5 flex items-center justify-center gap-1.5"
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </motion.p>
          )}

          <Button
            type="submit"
            loading={joining}
            disabled={!code.trim()}
            size="lg"
            icon={<Play size={16} />}
            className="w-full"
          >
            加入
          </Button>
        </form>
      </motion.div>

      <p className="text-center mt-6 text-muted text-sm flex items-center justify-center gap-1.5">
        想创建房间？
        <Button variant="ghost" size="sm" onClick={() => navigate(paths.roomNew())}
          icon={<Swords size={12} />}>
          去创建
        </Button>
      </p>
    </PageContainer>
    </div>
  )
}
