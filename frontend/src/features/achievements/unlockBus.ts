import type { AchievementUnlock } from '../../api/types'

/**
 * 成就解锁总线（模块级轻量 pub-sub，无新依赖）。
 * 两个来源汇入同一队列：
 * 1) WS `achievement_unlocked`（对局结算逐人推送，useRoomGame 发布）；
 * 2) 成就查询 diff（内容型解锁，useAchievementCenter 订阅查询后发布）。
 * 消费方唯一：AppLayout 挂载的右下角 AchievementPopup（仪式层，与顶部
 * Toast 操作反馈通道隔离）。
 */
type Listener = (u: AchievementUnlock) => void

const listeners = new Set<Listener>()

export function publishUnlocks(list: AchievementUnlock[]) {
  for (const u of list) {
    for (const l of listeners) l(u)
  }
}

export function subscribeUnlocks(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
