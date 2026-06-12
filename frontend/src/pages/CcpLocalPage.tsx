import { useLocation, useNavigate } from 'react-router-dom'

export function CcpLocalPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mode = location.pathname.endsWith('/host')
    ? 'host'
    : location.pathname.endsWith('/player')
      ? 'player'
      : ''

  if (!mode) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F0720] text-pink-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <div>
            <button
              onClick={() => navigate('/')}
              className="mb-5 px-3 py-2 rounded-xl text-xs font-medium bg-white/10 border border-white/15 text-pink-100"
            >
              返回大厅
            </button>
            <h1 className="font-serif text-2xl font-bold text-pink-100">CG猜猜 本地联机</h1>
            <p className="mt-2 text-sm text-pink-100/60">一个固定同步题板，不需要房间码。</p>
          </div>
          <button
            onClick={() => navigate('/ccp/local/host')}
            className="w-full py-4 rounded-2xl bg-pink-500/20 border border-pink-300/30 text-pink-50 font-bold"
          >
            我是出题人
          </button>
          <button
            onClick={() => navigate('/ccp/local/player')}
            className="w-full py-4 rounded-2xl bg-teal-400/15 border border-teal-200/30 text-teal-50 font-bold"
          >
            我是玩家
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#0F0720]">
      <div
        className="absolute left-0 right-0 top-0 z-[60] flex items-center gap-3 px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(15,7,32,0.9), rgba(15,7,32,0.5), transparent)',
        }}
      >
        <button
          onClick={() => navigate('/ccp/local')}
          className="px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#F0E6FF',
            backdropFilter: 'blur(8px)',
          }}
        >
          切换视角
        </button>
        <div className="min-w-0">
          <h1 className="font-serif text-sm sm:text-base text-pink-100 font-bold truncate">
            CG猜猜 · {mode === 'host' ? '出题视角' : '玩家视角'}
          </h1>
          <p className="text-[10px] sm:text-xs text-pink-100/50 font-serif truncate">
            固定同步题板，连麦猜图
          </p>
        </div>
        <button
          onClick={() => navigate('/ccp')}
          className="ml-auto px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
          style={{
            background: 'rgba(45, 212, 191, 0.12)',
            border: '1px solid rgba(45, 212, 191, 0.35)',
            color: '#99F6E4',
            backdropFilter: 'blur(8px)',
          }}
        >
          联机版
        </button>
      </div>

      <iframe
        src={`/guess-emperor.html?view=${mode}`}
        className="w-full h-full border-0"
        title={`CG猜猜 ${mode}`}
      />
    </div>
  )
}
