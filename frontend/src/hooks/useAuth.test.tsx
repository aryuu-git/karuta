// @vitest-environment happy-dom
// 会话恢复回归：/api/me 瞬时失败不得销毁 token（仅 401/403 才清）。
// 修复前 catch 一刀切 removeItem——一次网络抖动/5xx 即永久踢出登录（用户反馈
// 「每次都得重登」的根因）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type * as ClientModule from '../api/client'

const meMock = vi.hoisted(() => vi.fn())
vi.mock('../api/client', async (importOriginal) => {
  const orig = await importOriginal<typeof ClientModule>()
  return { ...orig, api: { ...orig.api, auth: { ...orig.api.auth, me: meMock } } }
})

// node 环境无 localStorage（vitest.config.ts 约定）：stub 全局，供 useAuth 的裸
// localStorage 读写与断言共用（键值随 set/delete/clear 动态增删，非静态查表）
const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string): string | null => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
})

import { AuthProvider, useAuth } from './useAuth'
import { HttpError } from '../api/client'
import { AUTH_TOKEN_KEY } from '../config'

beforeEach(() => {
  meMock.mockReset()
  localStorage.clear()
  localStorage.setItem(AUTH_TOKEN_KEY, 'stored-token')
})

describe('useAuth 会话恢复', () => {
  it('瞬时失败（500）：token 保留且退避重试，不被迫重登', async () => {
    meMock.mockRejectedValue(new HttpError('boom', 500))
    renderHook(() => useAuth(), { wrapper: AuthProvider })
    // 初始 + 1 次退避重试后耗尽
    await waitFor(() => expect(meMock.mock.calls.length).toBe(2), { timeout: 3000 })
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('stored-token')
  })

  it('鉴权失效（401）：token 清除', async () => {
    meMock.mockRejectedValue(new HttpError('invalid or expired token', 401))
    renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull())
    expect(meMock.mock.calls.length).toBe(1)
  })
})
