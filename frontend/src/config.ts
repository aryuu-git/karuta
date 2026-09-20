/**
 * 服务器连接配置（Web 版）
 * - 开发环境：相对路径，由 Vite proxy 转发
 * - 生产环境：同源部署，由 nginx 处理
 */

/** API 基础路径 */
export const API_BASE = '/api'

/** 构建 WebSocket URL。查询参数只携带 30 秒有效的一次性 ticket。 */
export function buildWsUrl(path: string, ticket: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}${path}?ticket=${encodeURIComponent(ticket)}`
}

/** 用普通 Authorization header 换取一次性 WebSocket ticket。 */
export async function openAuthenticatedWebSocket(path: string): Promise<WebSocket> {
  const token = localStorage.getItem('karuta_token')
  if (!token) throw new Error('not authenticated')
  const response = await fetch(`${API_BASE}/ws-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path }),
  })
  if (!response.ok) throw new Error('failed to obtain websocket ticket')
  const body = await response.json() as { ticket: string }
  return new WebSocket(buildWsUrl(path, body.ticket))
}
