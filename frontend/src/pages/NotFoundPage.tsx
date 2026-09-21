import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, CenteredShell } from '../components/ui'
import { paths } from '../routes/paths'

/** 404：无效路由的统一落点（不再静默重定向回首页） */
export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <CenteredShell>
      <EmptyState
        icon="🗺"
        title="页面不存在或已移动"
        description="请检查链接是否正确"
        action={<Button onClick={() => navigate(paths.home())}>回到大本营</Button>}
      />
    </CenteredShell>
  )
}
