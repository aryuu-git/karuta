import { useState, useRef, type ReactNode, type CSSProperties, type RefObject, type DragEvent, type ChangeEvent } from 'react'

/** 音频类型过滤（拖拽音频区共用） */
export const isAudioFile = (f: File) => f.type.startsWith('audio/')

interface UploadZoneProps {
  /** 隐藏文件输入的 accept 属性 */
  accept: string
  /** 是否允许多选 */
  multiple?: boolean
  /** 仅拖拽路径应用文件过滤（文件选择框路径不过滤，与原行为一致） */
  filter?: (file: File) => boolean
  /** 拿到（拖拽路径已过滤的）文件列表回调 */
  onFiles: (files: File[]) => void
  className?: string
  /** 常态内联样式 */
  baseStyle?: CSSProperties
  /** 拖拽悬停时覆盖的样式 */
  dragOverStyle?: CSSProperties
  /** 需要在外部重置输入值时传入 ref（如追加音频成功后清空） */
  inputRef?: RefObject<HTMLInputElement>
  /** 区域内容；拖拽悬停状态通过渲染参数注入 */
  children: ReactNode | ((dragOver: boolean) => ReactNode)
}

/** 通用拖拽/点击上传区域：封面、创建音频、追加音频共用 */
export function UploadZone({ accept, multiple = false, filter, onFiles, className, baseStyle, dragOverStyle, inputRef, children }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const internalRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? internalRef

  /** 拖拽释放：按过滤规则筛出目标文件后交给调用方 */
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    onFiles(filter ? dropped.filter(filter) : dropped)
  }

  /** 文件选择框变更：不做类型过滤，原样交给调用方 */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(e.target.files ?? []))
  }

  return (
    <>
      <div
        className={className}
        style={dragOver ? { ...baseStyle, ...dragOverStyle } : baseStyle}
        onClick={() => ref.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}>
        {typeof children === 'function' ? children(dragOver) : children}
      </div>
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={handleChange} />
    </>
  )
}
