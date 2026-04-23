import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CURRENT_VERSION = '1.4.0'
const STORAGE_KEY = 'karuta_changelog_seen'

const CHANGELOG = [
  {
    version: '1.4.0',
    date: '2026-04',
    title: '游戏体验全面升级 (ง •̀_•́)ง',
    items: [
      { emoji: '⏭', text: '房主新增「跳过」按钮，任何时候都能跳过当前牌，防止卡死' },
      { emoji: '🔥', text: '最后一张牌时顶部显示「最后一张！网速对决开始！」红色横幅' },
      { emoji: '🏆', text: '结算新增称号：🌐 世一网 / 🤦 手残选手 / 💔 苦命鸳鸯' },
      { emoji: '🃏', text: '结算页展示「我本局抢到的牌」封面图回顾' },
      { emoji: '📊', text: '个人战绩页新增「世一网」称号获得次数' },
      { emoji: '🔄', text: '进行中的房间允许加入（以旁观者身份），刷新不丢失抢牌记录' },
      { emoji: '🔒', text: '注册新增邀请码验证，只有被邀请的人才能注册' },
      { emoji: '⏸', text: '暂停期间倒计时正确冻结，继续后从暂停处恢复' },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-04',
    title: '裁判模式 · 聊天室 · 旁观 ٩(ˊᗜˋ*)و',
    items: [
      { emoji: '👑', text: '裁判模式：房主作为裁判手动选牌播放，不参与抢牌' },
      { emoji: '👁', text: '旁观者模式：游戏中可切换旁观，不抢牌不计分不进排名' },
      { emoji: '💬', text: '实时聊天室：所有人都能发言，支持表情和丢鸡蛋' },
      { emoji: '🥚', text: '丢鸡蛋特效：向指定玩家扔鸡蛋，全房广播动画' },
      { emoji: '🌐', text: '公开牌组：可将牌组共享给所有人使用' },
      { emoji: '🗑️', text: '牌组和歌牌支持删除，上传支持拖拽' },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-04',
    title: '旁观模式 · 聊天室 · 丢鸡蛋 ٩(ˊᗜˋ*)و',
    items: [
      { emoji: '👁', text: '新增旁观者模式，加入后可切换旁观，不参与抢牌不计分' },
      { emoji: '💬', text: '游戏中新增实时聊天室，旁观者和玩家都能发言' },
      { emoji: '🥚', text: '新增丢鸡蛋功能，向指定玩家发动鸡蛋攻击！全房广播动画' },
      { emoji: '📊', text: '新增个人战绩页，查看参与场数、前三名比例等统计' },
      { emoji: '🎮', text: '新增裁判模式，房主作为裁判手动选牌，其他玩家抢牌' },
      { emoji: '🌐', text: '牌组支持公开共享，其他玩家可直接使用你的牌组开房' },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04',
    title: '抢牌系统大升级 (ง •̀_•́)ง',
    items: [
      { emoji: '⚡', text: '抢错扣1分，本首禁止再抢！三思而后行~' },
      { emoji: '🎵', text: '进度条跟随实际音频时长，歌放多久就等多久' },
      { emoji: '💀', text: '全员出局后自动结束本首，不浪费时间' },
      { emoji: '📢', text: '抢牌结果全房公告，成功失败都广播给所有人' },
      { emoji: '🏆', text: '分数可以为负数，手滑太多就赤字了 (╥_╥)' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-04',
    title: '二次元歌牌大乱斗正式上线！🌸',
    items: [
      { emoji: '🃏', text: '自建牌组，上传音频和封面，打造专属歌牌' },
      { emoji: '🏯', text: '房间大厅，创建/加入房间，邀请好友一起玩' },
      { emoji: '🎮', text: '实时多人对战，服务端权威判定，公平竞技' },
      { emoji: '✨', text: '日式动画风格界面，樱花粉色主题' },
    ],
  },
]

export function Changelog() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY)
    if (seen !== CURRENT_VERSION) {
      // 延迟一点显示，让页面先加载
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, CURRENT_VERSION)
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ duration: 0.4, ease: 'backOut' }}
            className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(160deg, #2d0a1a 0%, #200814 100%)', border: '1px solid rgba(232,164,184,0.2)', boxShadow: '0 0 60px rgba(232,164,184,0.15), 0 24px 48px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">🌸</span>
                    <h2 className="font-serif text-lg font-bold text-gold">更新日志</h2>
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                      style={{ background: 'rgba(232,164,184,0.15)', color: '#e8a4b8', border: '1px solid rgba(232,164,184,0.25)' }}>
                      v{CURRENT_VERSION}
                    </span>
                  </div>
                  <p className="text-muted text-xs">有新东西啦！看看更新了什么 (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧</p>
                </div>
                <button onClick={handleClose}
                  className="text-muted hover:text-white transition-colors text-lg leading-none shrink-0 mt-0.5">
                  ✕
                </button>
              </div>
            </div>

            {/* 内容滚动区 */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {CHANGELOG.map((log, li) => (
                <div key={log.version}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-mono px-2 py-0.5 rounded"
                      style={{ background: li === 0 ? 'rgba(232,164,184,0.15)' : 'rgba(255,255,255,0.05)', color: li === 0 ? '#e8a4b8' : 'rgba(255,255,255,0.3)', border: `1px solid ${li === 0 ? 'rgba(232,164,184,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
                      v{log.version}
                    </span>
                    <span className="font-medium text-sm" style={{ color: li === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}>
                      {log.title}
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {log.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-sm shrink-0 mt-0.5">{item.emoji}</span>
                        <span className="text-xs leading-relaxed" style={{ color: li === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)' }}>
                          {item.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 底部按钮 */}
            <div className="px-6 pb-5 pt-3 border-t border-white/5 shrink-0">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleClose}
                className="btn-gold w-full py-3 text-sm">
                知道啦，冲！(ง •̀_•́)ง
              </motion.button>
              <p className="text-muted/40 text-xs text-center mt-2">下次不会再弹了 (｡•̀ᴗ-)</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
