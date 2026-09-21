import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, HttpError } from '../../api/client'
import { useToast } from '../../components/ui'
import { paths } from '../../routes/paths'
import { inviteLink } from './roomCreate'

/**
 * 原班再来一局（结算页 P0）：房主发起 rematch → 复制新房链接 → 跳新房；
 * 失败按状态码提示（409 对局进行中 / 404 战场已解散），其余透传后端文案。
 */
export function useRematch() {
  const navigate = useNavigate()
  const toast = useToast()
  const [rematching, setRematching] = useState(false)

  const rematch = async (roomId: number) => {
    if (rematching) return
    setRematching(true)
    try {
      const res = await api.rooms.rematch(roomId)
      await navigator.clipboard.writeText(inviteLink(res.room.code)).catch(() => null)
      toast.show('新房已就绪，链接已复制', 'success', 2500)
      // 携带 focusInvite：新房大厅的邀请面板自动高亮房间码（§4.6「InvitePanel 自动展开」）
      navigate(paths.room(res.room.id), { state: { focusInvite: true } })
    } catch (err) {
      if (err instanceof HttpError && err.status === 409) toast.show('对局还在进行中', 'fail', 2500)
      else if (err instanceof HttpError && err.status === 404) toast.show('战场已解散', 'fail', 2500)
      else toast.show(err instanceof Error ? err.message : '再来一局失败，请重试', 'fail', 2500)
    } finally {
      setRematching(false)
    }
  }

  return { rematch, rematching }
}
