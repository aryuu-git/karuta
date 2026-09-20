import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'

const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })))
const GuestPage = lazy(() => import('./pages/GuestPage').then(m => ({ default: m.GuestPage })))
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const DecksPage = lazy(() => import('./pages/DecksPage').then(m => ({ default: m.DecksPage })))
const DeckDetailPage = lazy(() => import('./pages/DeckDetailPage').then(m => ({ default: m.DeckDetailPage })))
const CardLibraryPage = lazy(() => import('./pages/CardLibraryPage').then(m => ({ default: m.CardLibraryPage })))
const CardCreatePage = lazy(() => import('./pages/CardCreatePage').then(m => ({ default: m.CardCreatePage })))
const NewRoomPage = lazy(() => import('./pages/NewRoomPage').then(m => ({ default: m.NewRoomPage })))
const JoinRoomPage = lazy(() => import('./pages/JoinRoomPage').then(m => ({ default: m.JoinRoomPage })))
const RoomPage = lazy(() => import('./pages/RoomPage').then(m => ({ default: m.RoomPage })))

const routeFallback = (
  <div className="min-h-screen washi-bg flex items-center justify-center">
    <div className="text-gold animate-pulse font-serif text-lg">加载中…</div>
  </div>
)

export default function App() {
  const { user } = useAuth()
  const isGuest = !!user?.is_guest

  // Guest users only see guest page + room page
  if (isGuest) {
    return (
      <Suspense fallback={routeFallback}>
      <Routes>
        <Route path="/guest" element={<GuestPage />} />
        <Route path="/rooms/:id" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/guest" replace />} />
      </Routes>
      </Suspense>
    )
  }

  return (
    <Suspense fallback={routeFallback}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/guest" element={<GuestPage />} />

      <Route path="/" element={<HomePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/decks" element={<DecksPage />} />
      <Route path="/decks/:id" element={<DeckDetailPage />} />
      <Route path="/cards" element={<CardLibraryPage />} />
      <Route path="/cards/new" element={<CardCreatePage />} />
      <Route path="/cards/:id" element={<CardCreatePage />} />
      <Route path="/rooms/new" element={<NewRoomPage />} />
      <Route path="/rooms/join" element={<JoinRoomPage />} />
      <Route path="/rooms/:id" element={<RoomPage />} />


      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
