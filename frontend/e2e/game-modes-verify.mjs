// 裁判模式 + duel 模式协议级验证（D12-补5）：
// judge：开局 → judge_waiting → 裁判 play-card → card_start → 玩家抢牌 → 计分；裁判抢牌被拒。
// duel：建房 → 双方入席 → 开局 → arrange_start → 双方 ready → arrange_done → duel_card_start → 抢牌 → duel_card_claimed。
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
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}
async function connect(token, roomId, events) {
  const t = await post(token, '/ws-ticket', { path: `/ws/rooms/${roomId}` })
  if (t.status !== 200) throw new Error(`ticket ${t.status}`)
  const ws = new WebSocket(`${WS_BASE}/ws/rooms/${roomId}?ticket=${encodeURIComponent(t.body.ticket)}`)
  ws.onmessage = (ev) => { try { events.push(JSON.parse(ev.data)) } catch { /* */ } }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws timeout')), 8000)
    ws.onopen = () => { clearTimeout(timer); resolve() }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
  })
  return ws
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const hostToken = await login('visual_qa', 'qa123456')
await post(hostToken, '/admin/users/7/disable', { disabled: false })
const victimToken = await login('victim_admin', 'va123456')
const out = {}

// ============ 场景 1：裁判模式 ============
{
  const created = await post(hostToken, '/rooms', { deck_id: 1, interval_sec: 1, mode: 'judge' })
  const roomId = created.body.id
  await post(victimToken, '/rooms/join', { code: created.body.code })
  const hostEv = [], vicEv = []
  const hostWs = await connect(hostToken, roomId, hostEv)
  const vicWs = await connect(victimToken, roomId, vicEv)
  await sleep(400)

  const start = await post(hostToken, `/rooms/${roomId}/start`, {})
  out.judge_start = start.status
  await sleep(1500)
  out.judge_waiting_seen = vicEv.some(e => e.type === 'judge_waiting') || hostEv.some(e => e.type === 'judge_waiting')

  // 裁判选牌（card 1）
  const play = await post(hostToken, `/rooms/${roomId}/play-card`, { card_id: 1, card_audio_id: 0 })
  out.judge_play_status = play.status
  await sleep(1500)
  const cardStart = vicEv.find(e => e.type === 'card_start')
  out.judge_card_start = !!cardStart

  // 裁判自己抢牌应被拒（grab_banned）
  hostWs.send(JSON.stringify({ type: 'grab', card_id: 1, cmd_id: 1 }))
  await sleep(1000)
  out.judge_self_grab_banned = hostEv.some(e => e.type === 'grab_banned')

  // 玩家抢牌成功
  if (cardStart) {
    vicWs.send(JSON.stringify({ type: 'grab', card_id: cardStart.card_id, cmd_id: 1 }))
    await sleep(1200)
    out.judge_player_claimed = vicEv.some(e => e.type === 'card_claimed' && e.winner_id === 7)
  }
  hostWs.close(); vicWs.close()
}

// ============ 场景 2：duel 模式 ============
{
  const created = await post(hostToken, '/rooms', {
    deck_id: 1, interval_sec: 1, mode: 'duel',
    duel_total_cards: 4, duel_round_time: 30, duel_arrange_time: 10,
    duel_grab_chances: 2, duel_flip: true, duel_requeue: false, duel_max_rounds: 0,
  })
  const roomId = created.body.id
  out.duel_room = roomId
  await post(victimToken, '/rooms/join', { code: created.body.code })

  // 双方入席
  const seat1 = await post(hostToken, `/rooms/${roomId}/claim-seat`, { seat: 1 })
  const seat2 = await post(victimToken, `/rooms/${roomId}/claim-seat`, { seat: 2 })
  out.duel_seats = [seat1.status, seat2.status]

  const hostEv = [], vicEv = []
  const hostWs = await connect(hostToken, roomId, hostEv)
  const vicWs = await connect(victimToken, roomId, vicEv)
  await sleep(400)

  const start = await post(hostToken, `/rooms/${roomId}/start`, {})
  out.duel_start = start.status
  await sleep(1500)
  out.duel_arrange_start_seen = vicEv.some(e => e.type === 'duel_arrange_start')

  // 双方编排就绪
  hostWs.send(JSON.stringify({ type: 'duel_arrange_ready' }))
  vicWs.send(JSON.stringify({ type: 'duel_arrange_ready' }))
  await sleep(1500)
  out.duel_arrange_done_seen = vicEv.some(e => e.type === 'duel_arrange_done')

  // 等 duel_card_start
  await sleep(2500)
  const duelCard = vicEv.find(e => e.type === 'duel_card_start')
  out.duel_card_start = !!duelCard
  out.duel_card_fields = duelCard ? { card_id: duelCard.card_id, round: duelCard.round, has_audio: !!duelCard.audio_url } : null

  // victim 抢牌
  if (duelCard) {
    vicWs.send(JSON.stringify({ type: 'grab', card_id: duelCard.card_id, cmd_id: 1 }))
    await sleep(1500)
    out.duel_claimed_seen = vicEv.some(e => e.type === 'duel_card_claimed' && e.user_id === 7)
    const claimed = vicEv.find(e => e.type === 'duel_card_claimed')
    out.duel_claimed_area = claimed ? claimed.area : null
  } else {
    out.duel_claimed_seen = false
  }
  hostWs.close(); vicWs.close()
}

console.log(JSON.stringify(out, null, 2))
const judgePass = out.judge_start === 200 && out.judge_waiting_seen && out.judge_play_status === 200
  && out.judge_card_start && out.judge_self_grab_banned && out.judge_player_claimed
const duelPass = out.duel_start === 200 && out.duel_arrange_start_seen && out.duel_arrange_done_seen
  && out.duel_card_start && out.duel_claimed_seen
console.log(judgePass ? 'JUDGE PROTOCOL ✓' : 'JUDGE PROTOCOL ✗')
console.log(duelPass ? 'DUEL PROTOCOL ✓' : 'DUEL PROTOCOL ✗')
process.exit(judgePass && duelPass ? 0 : 1)
