// @vitest-environment happy-dom
// 深链回跳回归（修复 #3）：登录成功后应回到守卫/JoinRoomPage 记录的
// state.from；缺失或非法值（`//host`、绝对 URL）回退首页——防开放重定向。
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

// vitest 未开 globals，RTL 自动 cleanup 不生效（D9 教训）——显式清理防 DOM 残留
afterEach(cleanup)

const loginMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ login: loginMock, user: null, loading: false }),
}))
vi.mock('framer-motion', () => import('../test/framerMock'))

import { LoginPage } from './LoginPage'

function renderLogin(state: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/', element: <div data-testid="home">HOME</div> },
      { path: '/rooms/join', element: <div data-testid="join">JOIN</div> },
    ],
    { initialEntries: [{ pathname: '/login', state }] },
  )
  render(<RouterProvider router={router} />)
  return router
}

async function submitLogin() {
  fireEvent.change(screen.getByPlaceholderText('输入昵称'), { target: { value: 'alice' } })
  fireEvent.change(screen.getByPlaceholderText('输入密码'), { target: { value: 'secret1' } })
  // happy-dom 下点击 submit 按钮不触发隐式表单提交——显式提交 form
  const form = screen.getByText('进入战场').closest('form')
  if (!form) throw new Error('login form not found')
  fireEvent.submit(form)
  await waitFor(() => expect(loginMock).toHaveBeenCalledWith('alice', 'secret1'))
}

describe('登录深链回跳', () => {
  it('存在 state.from 时回跳目标页（含 query）', async () => {
    const router = renderLogin({ from: '/rooms/join?code=59N35P' })
    await submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/rooms/join'))
    expect(router.state.location.search).toBe('?code=59N35P')
  })

  it('无 state.from 时回首页', async () => {
    const router = renderLogin(null)
    await submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('协议相对 URL 拒绝，回退首页（防开放重定向）', async () => {
    const router = renderLogin({ from: '//evil.example.com' })
    await submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('绝对 URL 拒绝，回退首页', async () => {
    const router = renderLogin({ from: 'https://evil.example.com' })
    await submitLogin()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
