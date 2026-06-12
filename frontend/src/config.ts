/**
 * 服务器连接配置
 * - Web 环境（开发/生产）：使用相对路径，由 Vite proxy 或 nginx 处理
 * - 原生客户端（Tauri/Capacitor）：使用绝对 URL 直连服务器
 */

// 从 Vite 环境变量读取服务器地址，为空时使用相对路径（Web 模式）
const serverUrl = import.meta.env.VITE_SERVER_URL || ''

/** API 基础路径 */
export const API_BASE = serverUrl ? `${serverUrl}/api` : '/api'

/** Quadrant API 基础路径 */
export const QUADRANT_API_BASE = serverUrl ? `${serverUrl}/api/quadrant` : '/api/quadrant'

/** CCP API 基础路径 */
export const CCP_API_BASE = serverUrl ? `${serverUrl}/api/ccp` : '/api/ccp'

/** 构建 WebSocket URL */
export function buildWsUrl(path: string, token: string): string {
  if (serverUrl) {
    // 原生客户端：根据 serverUrl 协议决定 ws/wss
    const isHttps = serverUrl.startsWith('https')
    const protocol = isHttps ? 'wss:' : 'ws:'
    const host = serverUrl.replace(/^https?:\/\//, '')
    return `${protocol}//${host}${path}?token=${encodeURIComponent(token)}`
  }
  // Web 环境：使用当前页面的协议和 host
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}${path}?token=${encodeURIComponent(token)}`
}

/** 是否为原生客户端模式 */
export const IS_NATIVE = !!serverUrl
