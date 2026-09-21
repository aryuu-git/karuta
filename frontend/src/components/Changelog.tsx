import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui'

const CURRENT_VERSION = '4.0.0'
const STORAGE_KEY = 'karuta_changelog_seen'

const CHANGELOG = [
  {
    version: '4.0.0',
    date: '2026-09',
    title: '🏠 开战改版 + 再来一局 + 对局屏升级',
    items: [
      { emoji: '🏠', text: '首页改版为「开战」：快速开局/自定义建房双入口，邀请码满 6 位自动加入' },
      { emoji: '⚡', text: '快速开局预设：标准抢牌/对决/裁判/练手四个模板，也记住上次配置' },
      { emoji: '🔁', text: '再来一局：结算页一键用同配置同牌组开新房，房主发起后自动复制邀请链接' },
      { emoji: '📋', text: '邀请面板升级：大字房间码 + 复制邀请链接/复制码/系统分享' },
      { emoji: '🎵', text: '对局新增状态条：随时知道当前能不能抢牌、是否出局、身份是玩家还是旁观' },
      { emoji: '📡', text: '对局断线提示：连接中断显示重连进度，恢复后即时提示' },
      { emoji: '📱', text: '手机对局体验：计分改为底部抽屉，操作收进「⋯」菜单，不再横向溢出' },
      { emoji: '🃏', text: '造牌改四步向导：素材→信息→权限→预览，随时回退，数据不丢' },
      { emoji: '🔧', text: '音频处理更透明：逐文件显示转码/上传进度，失败可单独重试' },
      { emoji: '✉️', text: '邀请链接直达：未登录打开链接可走游客通道，邀请码自动填好' },
      { emoji: '🎨', text: '界面精简：统一骨架屏加载、空状态引导、文案全面平实化' },
    ],
  },
  {
    version: '3.2.0',
    date: '2026-05',
    title: '👤 用户系统 + 游客模式',
    items: [
      { emoji: '👻', text: '游客模式：无需注册，输入昵称+邀请码即可加入对局' },
      { emoji: '🎫', text: '邀请码系统：默认不启用，注册依旧使用神秘代号；开启后每人可生成邀请码分享给朋友' },
      { emoji: '🖼️', text: '头像系统：个人页上传头像，等待大厅/分数板显示头像' },
      { emoji: '🎵', text: '创建歌牌支持同时添加多首曲目' },
      { emoji: '🚪', text: '新建歌牌时点击返回会提示是否放弃当前编辑' },
      { emoji: '🏷️', text: '所有页面显示全量标签（从后端接口获取）' },
      { emoji: '🎮', text: '多音频牌模式：全部播完 / 拍一次消失，可选' },
    ],
  },
  {
    version: '3.1.0',
    date: '2026-05',
    title: '🎯 体验升级 + Bangumi + 桌面版',
    items: [
      { emoji: '🔍', text: 'Bangumi 搜索：建牌时可搜索动画/游戏，自动填充作品名+封面' },
      { emoji: '💻', text: '桌面版（Electron）：音频本地缓存，省流量更流畅' },
      { emoji: '🏋️', text: '房主测试模式：只允许房主对局，他人只能旁观' },
      { emoji: '⏱️', text: '最短播放时间：短歌也要播够N秒，来得及反应' },
      { emoji: '🖼️', text: '封面支持修改：编辑牌页面点击封面即可更换' },
      { emoji: '✏️', text: '用户名支持修改：个人页点击用户名即改' },
      { emoji: '🎵', text: '添加音频支持拖拽+同时多首上传' },
      { emoji: '🏷️', text: '标签显示数量：一眼看到每个标签下有多少首歌' },
      { emoji: '🔎', text: '牌库/牌组/加牌弹窗：新增创建人筛选' },
      { emoji: '🃏', text: '加牌弹窗改为网格卡片式+分页，翻找更快' },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-05',
    title: '⚔️ 对阵模式 + 牌权限系统',
    items: [
      { emoji: '⚔️', text: '新模式「对阵模式」[内测]：1v1花牌决斗，双方各持牌，听音抢牌' },
      { emoji: '🪑', text: '选手席位制：2个席位先到先得，其余自动旁观' },
      { emoji: '🧩', text: '排阵环节：开局前可调整牌面布局，支持跨区对调' },
      { emoji: '🔒', text: '牌权限三级制：私有 / 可使用 / 可编辑，多选批量切换' },
      { emoji: '📋', text: '公开牌一键复制：他人的公开牌可快速复制到自己牌库编辑' },
      { emoji: '⏱️', text: '倒数N首开启扣分：前期可自由试错，后期才开始惩罚' },
      { emoji: '🌀', text: '牌面打乱优化：改为下一首开始时弹窗打乱，打乱后立即可抢' },
      { emoji: '⏸️', text: '对阵模式支持暂停/跳过/模糊牌面/随机片段播放' },
      { emoji: '👁', text: '对局中显示旁观席位列表，选手和旁观者都可见' },
      { emoji: '🏆', text: '专用对阵结算界面：展示双方各自抢到的牌+未抢到的牌' },
    ],
  },
  {
    version: '2.3.0',
    date: '2026-05',
    title: '新玩法 + 房主强化 🎲',
    items: [
      { emoji: '🎲', text: '随机片段播放：每首歌从随机位置开始，可配置最大起始%' },
      { emoji: '🔀', text: '牌面打乱：可设置剩余N张时每轮抢完后打乱棋盘位置' },
      { emoji: '🚪', text: '房主踢人：等待大厅和游戏中均可踢出玩家' },
      { emoji: '📋', text: '复制牌组新增选项：完整复制 / 只复制牌面' },
      { emoji: '☑', text: '牌库页支持多选批量删除' },
      { emoji: '🔧', text: '修复关闭扣分后toast仍显示"-1分"' },
      { emoji: '🔧', text: '修复复制牌组不带牌的问题' },
    ],
  },
  {
    version: '2.2.0',
    date: '2026-05',
    title: '线下决斗 + 裁判强化 ⚔️',
    items: [
      { emoji: '🗡️', text: '新增「线下决斗」：一键导出牌组所有封面图的压缩包' },
      { emoji: '☑', text: '牌组支持多选批量移除牌' },
      { emoji: '👑', text: '裁判模式修复：多音频牌可精确指定播放哪首歌' },
      { emoji: '🎵', text: '废牌堆：每轮抢牌/逃跑后立即在底部显示记录' },
      { emoji: '✏️', text: '音频提示文字支持在线编辑（点击即改）' },
      { emoji: '🏷️', text: '自定义标签不再因切换选项而消失' },
      { emoji: '🔧', text: '修复数据库外键问题导致无法创建牌的bug' },
      { emoji: '🔧', text: '修复裁判模式多音频牌同时高亮的bug' },
      { emoji: '🔧', text: '修复牌组共享设置无法保存的bug' },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-05',
    title: '体验优化 + 主题切换 ✧',
    items: [
      { emoji: '🎨', text: '新增主题切换！左下角按钮可切换樱花粉 / 蓝白条纹风格' },
      { emoji: '⚔️', text: '旁观者现在可以随时点击「加入战斗」切换为玩家参与抢牌' },
      { emoji: '⚡', text: '建房新增惩罚规则开关：可选择抢错/抢慢是否扣分' },
      { emoji: '👑', text: '裁判模式支持多音频牌：每首歌独立显示供裁判选择' },
      { emoji: '🎯', text: '对局棋盘自适应屏幕宽度，不再固定5列' },
      { emoji: '🌸', text: '全站 UI 大美化：二次元风格统一、渐变光效、诗意文案' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05',
    title: '牌库大重构 + 新玩法！🎉',
    items: [
      { emoji: '📚', text: '全新「牌库」系统！牌独立管理，一张牌可被多个牌组引用' },
      { emoji: '🎵', text: '一张牌可绑定多首歌！棋盘上堆叠显示×N，每首歌独立抢' },
      { emoji: '🎭', text: '新玩法「模糊牌面」！建房开启后封面被随机遮罩，增加辨识难度' },
      { emoji: '✂️', text: '上传歌曲时可选压缩/裁剪前30s/随机30s，不用再自己剪了' },
      { emoji: '▶', text: '牌列表支持播放预览，上传完直接能听' },
      { emoji: '🤝', text: '牌组三级共享：私有/可使用/可编辑，支持一键复制牌组' },
      { emoji: '🔍', text: '公共牌库支持按作品名、标签筛选' },
      { emoji: '☁️', text: '文件存储支持云端（COS），加载更快更稳定' },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-04',
    title: '游戏体验全面升级',
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
    title: '裁判模式 · 聊天室 · 旁观',
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
    title: '旁观模式 · 聊天室 · 丢鸡蛋',
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
    title: '抢牌系统大升级',
    items: [
      { emoji: '⚡', text: '抢错扣1分，本首禁止再抢' },
      { emoji: '🎵', text: '进度条跟随实际音频时长，歌放多久就等多久' },
      { emoji: '💀', text: '全员出局后自动结束本首，不浪费时间' },
      { emoji: '📢', text: '抢牌结果全房公告，成功失败都广播给所有人' },
      { emoji: '🏆', text: '分数可以为负数，抢错太多会扣成负分' },
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
          className="fixed inset-0 z-modal flex items-center justify-center px-4 bg-black/75 backdrop-blur"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ duration: 0.4, ease: 'backOut' }}
            className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl overflow-hidden border border-gold/20"
            style={{ background: 'linear-gradient(160deg, rgb(var(--color-ink)) 0%, rgb(var(--color-ink-deep)) 100%)', boxShadow: '0 0 60px rgb(var(--accent-primary)/ 0.15), 0 24px 48px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">🌸</span>
                    <h2 className="font-serif text-lg font-bold text-gold">更新日志</h2>
                    <span className="text-tiny px-2 py-0.5 rounded-full font-mono bg-gold/15 text-gold border border-gold/25">
                      v{CURRENT_VERSION}
                    </span>
                  </div>
                  <p className="text-muted text-tiny">看看更新了什么</p>
                </div>
                <button onClick={handleClose}
                  className="text-muted hover:text-body-text transition-colors text-lg leading-none shrink-0 mt-0.5">
                  ✕
                </button>
              </div>
            </div>

            {/* 内容滚动区 */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {CHANGELOG.map((log, li) => (
                <div key={log.version}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-tiny font-mono px-2 py-0.5 rounded border ${li === 0 ? 'bg-gold/15 text-gold border-gold/20' : 'bg-body-text/5 text-body-text/30 border-body-text/10'}`}>
                      v{log.version}
                    </span>
                    <span className={`font-medium text-caption ${li === 0 ? 'text-body-text/90' : 'text-body-text/40'}`}>
                      {log.title}
                    </span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {log.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-caption shrink-0 mt-0.5">{item.emoji}</span>
                        <span className={`text-tiny leading-relaxed ${li === 0 ? 'text-body-text/75' : 'text-body-text/35'}`}>
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
              <Button variant="gold" size="lg" className="w-full" onClick={handleClose}>
                知道了
              </Button>
              <p className="text-muted/40 text-tiny text-center mt-2">本次更新不再弹出</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
