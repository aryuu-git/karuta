// 类型化路由构建器：全项目禁止手写路由字符串字面量（重构 R1 约定）。
// 改路由只改这里，调用点零搜索成本。

export const paths = {
  home: () => '/',
  login: () => '/login',
  register: () => '/register',
  guest: () => '/guest',
  profile: () => '/profile',

  decks: () => '/decks',
  deck: (id: number) => `/decks/${id}`,

  cards: () => '/cards',
  cardNew: () => '/cards/new',
  cardEdit: (id: number) => `/cards/${id}`,

  roomNew: (deckId?: number) =>
    deckId !== undefined ? `/rooms/new?deck_id=${deckId}` : '/rooms/new',
  roomJoin: () => '/rooms/join',
  room: (id: number) => `/rooms/${id}`,
} as const

/** 路由表用的路径 pattern（含 :param），与 paths 工厂一一对应 */
export const routePatterns = {
  deck: '/decks/:id',
  cardEdit: '/cards/:id',
  roomNew: '/rooms/new',
  room: '/rooms/:id',
} as const
