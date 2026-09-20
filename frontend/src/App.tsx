import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'

// 认证统一入口：登录/注册/访客三模式单页（/register、/guest 为别名重定向）
const AuthPage = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })))
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const DecksPage = lazy(() => import('./pages/DecksPage').then(m => ({ default: m.DecksPage })))
const DeckDetailPage = lazy(() => import('./pages/DeckDetailPage').then(m => ({ default: m.DeckDetailPage })))
const CardLibraryPage = lazy(() => import('./pages/CardLibraryPage').then(m => ({ default: m.CardLibraryPage })))
const CardCreatePage = lazy(() => import('./pages/CardCreatePage').then(m => ({ default: m.CardCreatePage })))
const NewRoomPage = lazy(() => import('./pages/NewRoomPage').then(m => ({ default: m.NewRoomPage })))
const RoomPage = lazy(() => import('./pages/RoomPage').then(m => ({ default: m.RoomPage })))

const routeFallback = (
  <div className="min-h-screen washi-bg flex items-center justify-center">
    <div className="text-gold animate-pulse font-serif text-lg">加载中…</div>
  </div>
)

export default function App() {
  const { user } = useAuth()
  const isGuest = !!user?.is_guest

  // 游客仅可见：认证页（凭令入场面板）+ 对战页
  if (isGuest) {
    return (
      <Suspense fallback={routeFallback}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/rooms/:id" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={routeFallback}>
    <Routes>
      {/* 认证单页 + 别名重定向（外链兼容） */}
      <Route path="/login" element={<AuthPage />} />
      <Route path="/register" element={<Navigate to="/login?mode=register" replace />} />
      <Route path="/guest" element={<Navigate to="/login?mode=guest" replace />} />

      {/* 大厅即首页：凭令入场 + 开辟战场 + 房间列表 */}
      <Route path="/" element={<HomePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/decks" element={<DecksPage />} />
      <Route path="/decks/:id" element={<DeckDetailPage />} />
      <Route path="/cards" element={<CardLibraryPage />} />
      <Route path="/cards/new" element={<CardCreatePage />} />
      <Route path="/cards/:id" element={<CardCreatePage />} />
      <Route path="/rooms/new" element={<NewRoomPage />} />
      <Route path="/rooms/join" element={<Navigate to="/" replace />} />
      <Route path="/rooms/:id" element={<RoomPage />} />


      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
