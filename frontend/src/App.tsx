import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { PageSpinner } from './components/ui'
import { AppLayout } from './components/AppLayout'
import { RequireAuth, RequireMember } from './routes/guards'
import { ErrorBoundary } from './routes/ErrorBoundary'
import { NotFoundPage } from './pages/NotFoundPage'
import { paths, routePatterns } from './routes/paths'

// 公开页（无导航壳）
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })))
const GuestPage = lazy(() => import('./pages/GuestPage').then(m => ({ default: m.GuestPage })))

// 登录页（有导航壳）
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })))
const DecksPage = lazy(() => import('./pages/DecksPage').then(m => ({ default: m.DecksPage })))
const DeckDetailPage = lazy(() => import('./pages/DeckDetailPage').then(m => ({ default: m.DeckDetailPage })))
const CardLibraryPage = lazy(() => import('./pages/CardLibraryPage').then(m => ({ default: m.CardLibraryPage })))
const CardCreatePage = lazy(() => import('./pages/CardCreatePage').then(m => ({ default: m.CardCreatePage })))
const NewRoomPage = lazy(() => import('./pages/NewRoomPage').then(m => ({ default: m.NewRoomPage })))
const JoinRoomPage = lazy(() => import('./pages/JoinRoomPage').then(m => ({ default: m.JoinRoomPage })))
const RoomPage = lazy(() => import('./pages/RoomPage').then(m => ({ default: m.RoomPage })))

/**
 * 唯一路由树（重构 R1）：
 * - 公开页：登录/注册/游客（独立全屏，无导航壳）。
 * - RequireAuth：会话恢复 + 登录守卫；AppLayout 提供导航壳（Outlet）。
 * - RequireMember：正式用户区（游客重定向回游客页）；房间页对游客开放。
 * - `*` 落 404（不再静默重定向）。
 * 路由路径全部经 paths/routePatterns 引用，禁止字面量。
 */
export default function App() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<PageSpinner text="星彩正在翻阅卷轴…" />}>
        <Routes>
          {/* 公开页 */}
          <Route path={paths.login()} element={<LoginPage />} />
          <Route path={paths.register()} element={<RegisterPage />} />
          <Route path={paths.guest()} element={<GuestPage />} />
          {/* 加入页公开可达：未登录时页面内展示防御态（登录/游客双通道，code 保留），
              已登录时自动加入——挂在守卫下会使防御态永不可达（视觉验收发现） */}
          <Route path={paths.roomJoin()} element={<JoinRoomPage />} />

          {/* 登录区（导航壳） */}
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              {/* 正式用户区 */}
              <Route element={<RequireMember />}>
                <Route path={paths.home()} element={<HomePage />} />
                <Route path={paths.profile()} element={<ProfilePage />} />
                <Route path={paths.decks()} element={<DecksPage />} />
                <Route path={routePatterns.deck} element={<DeckDetailPage />} />
                <Route path={paths.cards()} element={<CardLibraryPage />} />
                <Route path={paths.cardNew()} element={<CardCreatePage />} />
                <Route path={routePatterns.cardEdit} element={<CardCreatePage />} />
                <Route path={routePatterns.roomNew} element={<NewRoomPage />} />
              </Route>
              {/* 房间页：正式用户与游客均可达 */}
              <Route path={routePatterns.room} element={<RoomPage />} />
            </Route>
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
