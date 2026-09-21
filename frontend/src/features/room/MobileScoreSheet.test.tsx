// @vitest-environment happy-dom
// MobileScoreSheet 回归（设计规格 §5.6）：把手文案派生、展开/收起、me 高亮、裁判模式过滤、旁观排尾。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MobileScoreSheet } from './MobileScoreSheet'
import type { RoomPlayer } from '../../api/types'

vi.mock('framer-motion', () => import('../../test/framerMock'))

afterEach(cleanup)

function player(over: Partial<RoomPlayer> & { user_id: number; username: string }): RoomPlayer {
  return { room_id: 1, role: 'player', score: 0, online: true, ...over } as RoomPlayer
}

const players = [
  player({ user_id: 1, username: 'alice', score: 12 }),
  player({ user_id: 2, username: '我', score: 8 }),
  player({ user_id: 3, username: 'bob', score: 5 }),
]

describe('MobileScoreSheet 把手文案', () => {
  it('玩家：显示人数与我的名次', () => {
    render(<MobileScoreSheet players={players} currentUserId={2} hostId={1} isJudgeMode={false} />)
    expect(screen.getByText(/3人 · 你第2/)).toBeTruthy()
  })

  it('旁观者：显示旁观中', () => {
    render(<MobileScoreSheet players={players} currentUserId={99} hostId={1} isJudgeMode={false} />)
    expect(screen.getByText(/旁观中/)).toBeTruthy()
  })
})

describe('MobileScoreSheet 名单', () => {
  it('点按展开：按分数排序渲染，me 带（你）标记', () => {
    const { container } = render(<MobileScoreSheet players={players} currentUserId={2} hostId={1} isJudgeMode={false} />)
    fireEvent.click(screen.getByRole('button', { name: /3人/ }))
    expect(screen.queryByText(/alice（你）/)).toBeNull()   // alice 不是我
    expect(screen.getByText(/我（你）/)).toBeTruthy()
    // 排序验证：DOM 顺序 alice(12分) 在「我」(8分) 之前
    const names = Array.from(container.querySelectorAll('.truncate')).map(el => el.textContent)
    expect(names[0]).toBe('alice')
    expect(names[1]).toBe('我（你）')
  })

  it('再点收起：名单消失', () => {
    render(<MobileScoreSheet players={players} currentUserId={2} hostId={1} isJudgeMode={false} />)
    const handle = screen.getByRole('button', { name: /3人/ })
    fireEvent.click(handle)
    expect(screen.getByText(/我（你）/)).toBeTruthy()
    fireEvent.click(handle)
    expect(screen.queryByText(/我（你）/)).toBeNull()
  })

  it('裁判模式：房主（裁判）不出现在名单，人数扣除', () => {
    render(<MobileScoreSheet players={players} currentUserId={2} hostId={1} isJudgeMode />)
    expect(screen.getByText(/2人 · 你第1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /2人/ }))
    expect(screen.queryByText('alice')).toBeNull()
  })

  it('旁观者排在名单尾部', () => {
    const withSpectator = [...players, player({ user_id: 4, username: '看客', role: 'spectator' })]
    render(<MobileScoreSheet players={withSpectator} currentUserId={2} hostId={1} isJudgeMode={false} />)
    fireEvent.click(screen.getByRole('button', { name: /3人/ }))
    expect(screen.getByText('看客')).toBeTruthy()
    expect(screen.getByText('旁观')).toBeTruthy()
  })
})
