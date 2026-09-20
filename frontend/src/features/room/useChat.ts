import { useCallback, useRef, useState } from 'react'

/** 聊天消息（结构与 ChatRoom 组件内部 ChatMessage 保持一致） */
export interface ChatMsg {
  id: number
  user_id: number
  username: string
  role: string
  text: string
  isEgg?: boolean
  fromName?: string
  targetName?: string
}

/** chat_message 事件负载 */
interface ChatMessageEvent {
  user_id: number
  username: string
  role: string
  text: string
}

/** egg_throw 事件负载 */
interface EggThrowEvent {
  from_id: number
  from_name: string
  target_id: number
  target_name: string
}

/**
 * 聊天消息与丢蛋动画状态。
 * chatIdRef 用于生成消息自增 id；eggEvent 为丢蛋一次性动画事件（2.5s 后自动清除）。
 */
export function useChat() {
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const chatIdRef = useRef(0)
  const [eggEvent, setEggEvent] = useState<{ id: number; fromName: string; targetName: string; isMe: boolean } | null>(null)

  // 收到聊天广播：追加一条消息
  const onChatMessage = useCallback((event: ChatMessageEvent) => {
    setChatMessages(prev => [...prev, {
      id: ++chatIdRef.current,
      user_id: event.user_id,
      username: event.username,
      role: event.role,
      text: event.text,
    }])
  }, [])

  // 收到丢蛋广播：追加系统消息并触发丢蛋动画（isMe = 我是目标）
  const onEggThrow = useCallback((event: EggThrowEvent, isMe: boolean) => {
    setChatMessages(prev => [...prev, {
      id: ++chatIdRef.current,
      user_id: 0,
      username: '',
      role: '',
      text: '',
      isEgg: true,
      fromName: event.from_name,
      targetName: event.target_name,
    }])
    setEggEvent({ id: Date.now(), fromName: event.from_name, targetName: event.target_name, isMe })
    setTimeout(() => setEggEvent(null), 2500)
  }, [])

  return { chatMessages, eggEvent, onChatMessage, onEggThrow }
}
