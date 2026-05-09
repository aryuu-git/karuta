import { Routes, Route, Navigate } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { HomePage } from './pages/HomePage'
import { ProfilePage } from './pages/ProfilePage'
import { DecksPage } from './pages/DecksPage'
import { DeckDetailPage } from './pages/DeckDetailPage'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { CardCreatePage } from './pages/CardCreatePage'
import { NewRoomPage } from './pages/NewRoomPage'
import { JoinRoomPage } from './pages/JoinRoomPage'
import { RoomPage } from './pages/RoomPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

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
  )
}
