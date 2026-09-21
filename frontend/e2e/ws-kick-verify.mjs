// WS 踢出纯协议验证（D12-补3）：
// victim 换 ticket 连 WS → 管理员禁用 → victim 的 WebSocket 应被服务端断开（onclose）。
// Node 26 原生 WebSocket，无需浏览器。
const API = 'http://localhost:8080/api'

async function login(u, p) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  })
  return (await res.json()).token
}

const adminToken = await login('visual_qa', 'qa123456')
// 确保 victim 非禁用
await fetch(`${API}/admin/users/7/disable`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ disabled: false }),
})
const victimToken = await login('victim_admin', 'va123456')

// victim 入住房间 2（WS 升级有 membership 校验）
const joinRes = await fetch(`${API}/rooms/join`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${victimToken}` },
  body: JSON.stringify({ code: '59N35P' }),
})
const joinBody = await joinRes.json().catch(() => ({}))
console.log('victim join room:', joinRes.status, joinBody.room ? `room ${joinBody.room.id}` : JSON.stringify(joinBody).slice(0, 80))

// victim 换 WS ticket 并连接
const ticketRes = await fetch(`${API}/ws-ticket`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${victimToken}` },
  body: JSON.stringify({ path: '/ws/rooms/2' }),
})
const { ticket } = await ticketRes.json()
const ws = new WebSocket(`ws://localhost:8080/ws/rooms/2?ticket=${encodeURIComponent(ticket)}`)

const result = {}
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('WS connect timeout')), 8000)
  ws.onopen = () => { result.connected = true; clearTimeout(timer); resolve() }
  ws.onerror = (e) => { clearTimeout(timer); reject(new Error('WS error: ' + (e.message || 'unknown'))) }
})

// 等连接在 hub 注册完成
await new Promise(r => setTimeout(r, 500))

// 管理员禁用 victim —— 应触发服务端 DisconnectUserEverywhere
const kickedPromise = new Promise(resolve => {
  ws.onclose = (ev) => resolve({ code: ev.code, reason: ev.reason })
})
const disableRes = await fetch(`${API}/admin/users/7/disable`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ disabled: true }),
})
result.disable_status = disableRes.status

const closed = await Promise.race([
  kickedPromise,
  new Promise(r => setTimeout(() => r('TIMEOUT'), 6000)),
])
result.ws_close = closed

// 断开后 victim 换 ticket 应被 middleware 拦（重连不可能）
const retryTicket = await fetch(`${API}/ws-ticket`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${victimToken}` },
  body: JSON.stringify({ path: '/ws/rooms/2' }),
})
result.retry_ticket_status = retryTicket.status

console.log(JSON.stringify(result, null, 2))
const pass = result.connected === true && result.disable_status === 200 && result.ws_close !== 'TIMEOUT' && result.retry_ticket_status === 403
console.log(pass ? 'WS KICK VERIFIED ✓' : 'WS KICK FAILED ✗')
process.exit(pass ? 0 : 1)
