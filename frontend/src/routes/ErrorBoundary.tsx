import { Component, type ErrorInfo, type ReactNode } from 'react'
import { CenteredShell } from '../components/ui'

interface Props {
  children: ReactNode
  /** 变化时自动复位错误态（路由层用 location.key 驱动） */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * 路由级错误边界：渲染异常时展示可恢复的兜底页，不再整站白屏。
 * resetKey 变化（如切换路由）自动清除错误态。
 * 注意：本组件挂在 main.tsx 同步依赖链上，刻意不引用 ui Button（其依赖
 * framer-motion 会整体拉入首屏主包，见决策日志 D2-A2），兜底按钮用原生元素。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 兜底诊断出口：错误边界的原始用途就是捕获渲染崩溃
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const btnClass = 'px-6 py-2.5 rounded font-sans font-medium text-caption transition-all duration-fast border border-gold/50 text-gold hover:bg-gold/10'
      return (
        <CenteredShell className="flex-col gap-4 text-center">
          <div className="text-5xl" aria-hidden="true">😣</div>
          <h1 className="font-serif text-title-xl text-gold">这里好像乱掉了…</h1>
          <p className="text-muted text-caption max-w-sm">
            页面渲染时出了点意外。可以试试重新加载，或者回到大本营。
          </p>
          <div className="flex gap-3">
            <button className={btnClass} onClick={() => this.setState({ error: null })}>
              再试一次
            </button>
            <button className={btnClass} onClick={() => window.location.assign('/')}>
              回到大本营
            </button>
          </div>
        </CenteredShell>
      )
    }
    return this.props.children
  }
}
