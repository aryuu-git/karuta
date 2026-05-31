import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { GuestPage } from './pages/GuestPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { DecksPage } from './pages/DecksPage'
import { DeckDetailPage } from './pages/DeckDetailPage'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { CardCreatePage } from './pages/CardCreatePage'
import { NewRoomPage } from './pages/NewRoomPage'
import { JoinRoomPage } from './pages/JoinRoomPage'
import { RoomPage } from './pages/RoomPage'
import { QuadrantLobby } from './pages/quadrant/QuadrantLobby'
import { QuadrantRoom } from './pages/quadrant/QuadrantRoom'
import { QuadrantBankList } from './pages/quadrant/QuadrantBankList'
import { QuadrantBankEdit } from './pages/quadrant/QuadrantBankEdit'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  const { user } = useAuth()
  const isGuest = !!user?.is_guest

  // Guest users only see guest page + room page
  if (isGuest) {
    return (
      <Routes>
        <Route path="/guest" element={<GuestPage />} />
        <Route path="/rooms/:id" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/guest" replace />} />
      </Routes>
    )
  }

  return (
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

      <Route path="/quadrant" element={<QuadrantLobby />} />
      <Route path="/quadrant/rooms/:id" element={<QuadrantRoom />} />
      <Route path="/quadrant/banks" element={<QuadrantBankList />} />
      <Route path="/quadrant/banks/:id" element={<QuadrantBankEdit />} />

      <Route path="/settings" element={<SettingsPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
