import { Dialog } from './Dialog'
import { Button } from './Button'

/**
 * 确认对话框：替换全项目 window.confirm 与手写确认弹窗（重构 R4）。
 * 危险动作用 danger 变体主按钮。
 */
export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 危险动作（主按钮红色） */
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '再想想',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => undefined : onCancel}
      closable={!loading}
      title={title}
      size="sm"
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>{cancelText}</Button>
          <Button variant={danger ? 'danger' : 'gold'} onClick={onConfirm} loading={loading}>{confirmText}</Button>
        </>
      }
    >
      {description && <p className="text-muted text-caption">{description}</p>}
    </Dialog>
  )
}
