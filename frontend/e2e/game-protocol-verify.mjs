// 真实对局协议级验证（D12-补4）：Hijacker 修复后对局引擎首次真实可测。
// 链路：建房 → 双方 WS → 开局 → countdown/card_start → 抢牌 → card_claimed + score_update。
// 此链路此前从未真实跑通（WS 升级一直 500）。
const API = 'http://localhost:8080/api'
const WS_BASE = 'ws://localhost:8080'

async function login(u, p) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }),
  })
  return (await res.json()).token
}

async function post(token, path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

function collect(ws, events) {
  ws.onmessage = (ev) => {
    try { events.push(JSON.parse(ev.data)) } catch { /* ignore */ }
  }
}

async function connect(token, roomId) {
  const t = await post(token, '/ws-ticket', { path: `/ws/rooms/${roomId}` })
  if (t.status !== 200) throw new Error(`ticket ${t.status}`)
  const ws = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}?ticket=${encodeURIComponent(t.body.ticket)}`)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws connect timeout')), 8000)
    ws.onopen = () => { clearTimeout(timer); resolve() }
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error('ws error')) }
  })
  return ws
}

const result = {}
const hostToken = await login('visual_qa', 'qa123456')
// victim 解禁 + 登录
await post(hostToken, '/admin/users/7/disable', { disabled: false })
const victimToken = await login('victim_admin', 'va123456')

// 1) 建房（deck 1，3 张牌，interval 1s 快节奏）
const created = await post(hostToken, '/rooms', { deck_id: 1, interval_sec: 1, mode: 'auto' })
if (created.status !== 200 && created.status !== 201) { console.log('CREATE ROOM FAILED', created); process.exit(1) }
const roomId = created.body.id
result.room_id = roomId

// 2) victim 入房
const joined = await post(victimToken, '/rooms/join', { code: created.body.code })
result.join_status = joined.status
if (joined.status !== 200 && joined.status !== 201) { console.log('JOIN FAILED', joined); process.exit(1) }

// 3) 双方 WS 连接并收集事件
const hostEvents = []
const victimEvents = []
const hostWs = await connect(hostToken, roomId)
const victimWs = await connect(victimToken, roomId)
collect(hostWs, hostEvents)
collect(victimWs, victimEvents)
await new Promise(r => setTimeout(r, 500))

// 4) 开局
const started = await post(hostToken, `/rooms/${roomId}/start`, {})
result.start_status = started.status

// 5) 等 countdown + card_start
await new Promise(r => setTimeout(r, 6000))
const firstCard = victimEvents.find(e => e.type === 'card_start')
result.got_card_start = !!firstCard
result.card_start_fields = firstCard ? {
  card_id: firstCard.card_id,
  has_ends_at: typeof firstCard.ends_at === 'number',
  has_server_now: typeof firstCard.server_now === 'number',
  has_next_audio: Array.isArray(firstCard.next_audio_urls),
} : null
result.countdown_seen = victimEvents.some(e => e.type === 'countdown')

// 6) victim 抢牌（正确牌 + cmd_id）
if (firstCard) {
  victimWs.send(JSON.stringify({ type: 'grab', card_id: firstCard.card_id, cmd_id: 1 }))
  await new Promise(r => setTimeout(r, 1500))
  const claimed = hostEvents.find(e => e.type === 'card_claimed')
  result.got_card_claimed = !!claimed
  result.claimed_winner = claimed ? claimed.winner_id : null
  result.claimed_is_victim = claimed ? claimed.winner_id === 7 : false
  const score = hostEvents.find(e => e.type === 'score_update')
  result.got_score_update = !!score
  result.victim_score = score ? (score.scores.find(s => s.user_id === 7) || {}).score : null
  // 抢同一张再试：应 grab_wrong（already_grabbed 语义 → 房主慢一步）
  hostWs.send(JSON.stringify({ type: 'grab', card_id: firstCard.card_id, cmd_id: 1 }))
  await new Promise(r => setTimeout(r, 1200))
  result.host_got_grab_wrong = hostEvents.some(e => e.type === 'grab_wrong' && e.user_id === 1)
} else {
  result.got_card_claimed = false
}

// 7) 旁观者视角事件广播（chat 全房广播）
hostWs.send(JSON.stringify({ type: 'chat', text: 'PROTOCOL_CHAT' }))
await new Promise(r => setTimeout(r, 800))
result.chat_broadcast_ok = victimEvents.some(e => e.type === 'chat_message' && e.text === 'PROTOCOL_CHAT')

hostWs.close(); victimWs.close()
console.log(JSON.stringify(result, null, 2))

const pass = result.start_status === 200 && result.got_card_start === true
  && result.card_start_fields?.has_ends_at === true && result.countdown_seen === true
  && result.got_card_claimed === true && result.claimed_is_victim === true
  && result.victim_score === 1 && result.host_got_grab_wrong === true
  && result.chat_broadcast_ok === true
console.log(pass ? 'FULL GAME PROTOCOL VERIFIED ✓' : 'GAME PROTOCOL FAILED ✗')
process.exit(pass ? 0 : 1)
