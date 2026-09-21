/**
 * 建房配置模型（P0 抽出为叶子模块）：
 * 原先定义在 NewRoomPage 内，但预设模板（presets.ts）与建房页互相引用会形成
 * 运行时循环依赖（模块求值期访问 TDZ 报错）。下沉到无依赖的叶子模块后，
 * NewRoomPage 仍 re-export 二者，保持「从 NewRoomPage export」的契约不变。
 */

/** 建房配置：表单所有规则字段聚合为单一对象（重构 R2 收敛 21 个平行 useState） */
export interface RoomConfig {
  /** 每张牌间隔时间（秒） */
  intervalSec: number
  /** 游戏模式：自动 / 裁判 / 对阵 */
  mode: 'auto' | 'judge' | 'duel'
  /** 是否开启模糊牌面 */
  maskEnabled: boolean
  /** 模糊难度（遮罩比例档位） */
  maskDifficulty: 'easy' | 'normal' | 'hard'
  /** 抢错扣分开关 */
  penaltyWrong: boolean
  /** 抢慢扣分开关 */
  penaltySlow: boolean
  /** 倒数 N 首开启扣分（0 = 全程） */
  penaltyLast: number
  /** 每轮抢完后打乱牌面 */
  shuffleEnabled: boolean
  /** 剩余多少张时开始打乱 */
  shuffleRemaining: number
  /** 每首歌从随机位置开始播放 */
  randomStart: boolean
  /** 随机起始位置上限（百分比） */
  randomStartMax: number
  /** 对阵：总牌数（每人分一半） */
  duelTotalCards: number
  /** 对阵：对方区牌面倒置 */
  duelFlip: boolean
  /** 对阵：超时未抢的歌重入队 */
  duelRequeue: boolean
  /** 对阵：最大轮次（0 = 无限） */
  duelMaxRounds: number
  /** 对阵：每轮时间（秒） */
  duelRoundTime: number
  /** 对阵：每轮可拍牌次数 */
  duelGrabChances: number
  /** 对阵：开局排阵时间（秒） */
  duelArrangeTime: number
  /** 房主测试模式（等待可加入，开打后只能旁观） */
  training: boolean
  /** 最短播放时间（秒，0 = 关闭） */
  minPlayTime: number
  /** 多音频牌模式：全部播完 / 拍一次消失 */
  multiAudioMode: 'all' | 'once'
  /** 私密房（列表隐藏，凭码可进） */
  isPrivate: boolean
  /** 人数上限（2-32，默认 16） */
  maxPlayers: number
}

/** 默认建房配置：完整保留原实现的初始值 */
export const defaultRoomConfig: RoomConfig = {
  intervalSec: 5,
  mode: 'auto',
  maskEnabled: false,
  maskDifficulty: 'normal',
  penaltyWrong: false,
  penaltySlow: false,
  penaltyLast: 0,
  shuffleEnabled: false,
  shuffleRemaining: 5,
  randomStart: false,
  randomStartMax: 50,
  duelTotalCards: 50,
  duelFlip: true,
  duelRequeue: true,
  duelMaxRounds: 0,
  duelRoundTime: 30,
  duelGrabChances: 1,
  duelArrangeTime: 60,
  training: false,
  minPlayTime: 0,
  multiAudioMode: 'all',
  isPrivate: false,
  maxPlayers: 16,
}
