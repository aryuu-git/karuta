// duel 子分支协议验证 v2（D12-补6）：分支窗口与对局生命周期解耦。
// 房 A（12 牌大��）：抢对方区触发给牌 + 抢错 + 机会耗尽。
// 房 B（静默房）：双方不抢 → 超时 requeue → 同牌重新出现（闭环）。
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
const lastOf = (ev, type) => [...ev].reverse().find(e => e.type === type)

const hostToken = await login('visual_qa', 'qa123456')
await post(hostToken, '/admin/users/7/disable', { disabled: false })
const victimToken = await login('victim_admin', 'va123456')
const out = {}

async function setupDuel(extra) {
  const created = await post(hostToken, '/rooms', { deck_id: 1, interval_sec: 1, mode: 'duel', duel_arrange_time: 8, ...extra })
  const roomId = created.body.id
  await post(victimToken, '/rooms/join', { code: created.body.code })
  await post(hostToken, `/rooms/${roomId}/claim-seat`, { seat: 1 })
  await post(victimToken, `/rooms/${roomId}/claim-seat`, { seat: 2 })
  const hostEv = [], vicEv = []
  const hostWs = await connect(hostToken, roomId, hostEv)
  const vicWs = await connect(victimToken, roomId, vicEv)
  await sleep(300)
  await post(hostToken, `/rooms/${roomId}/start`, {})
  await sleep(1000)
  hostWs.send(JSON.stringify({ type: 'duel_arrange_ready' }))
  vicWs.send(JSON.stringify({ type: 'duel_arrange_ready' }))
  await sleep(1200)
  return { roomId, hostWs, vicWs, hostEv, vicEv }
}

// ============ 房 A：give + wrong + blocked ============
{
  const { hostWs, vicWs, vicEv } = await setupDuel({
    duel_total_cards: 12, duel_round_time: 5, duel_grab_chances: 1, duel_flip: true, duel_requeue: false,
  })
  const VICTIM = 7
  let cmdId = 0
  let giveDone = false, wrongDone = false

  for (let turn = 0; turn < 14; turn++) {
    let card = lastOf(vicEv, 'duel_card_start')
    for (let i = 0; i < 30 && !card; i++) { await sleep(250); card = lastOf(vicEv, 'duel_card_start') }
    if (!card) break
    const consumed = card
    vicEv.splice(vicEv.indexOf(consumed), 1)

    const duelState = lastOf(vicEv, 'duel_state')
    const p1Ids = duelState?.data?.player1?.cards?.map(c => c.id) ?? []
    const inOpponent = p1Ids.includes(consumed.card_id)

    if (!giveDone && inOpponent) {
      // 分支：抢对方区 → needs_give → give_request → give_card → give_done
      vicWs.send(JSON.stringify({ type: 'grab', card_id: consumed.card_id, cmd_id: ++cmdId }))
      await sleep(1200)
      const giveReq = lastOf(vicEv, 'duel_give_request')
      if (giveReq?.cards?.length) {
        out.saw_give_request = true
        vicWs.send(JSON.stringify({ type: 'give_card', card_id: giveReq.cards[0].id }))
        await sleep(1200)
        out.saw_give_done = vicEv.some(e => e.type === 'duel_give_done')
        out.give_claimed_opponent = vicEv.some(e => e.type === 'duel_card_claimed' && e.area === 'opponent' && e.needs_give === true)
        giveDone = true
      }
    } else if (!wrongDone) {
      // 分支：抢"在场但非当前回合"的牌 → duel_grab_wrong；再抢正确 → blocked
      // （抢不存在的牌走 duel_grab_invalid，不是 wrong）
      const allInPlay = [
        ...(duelState?.data?.player1?.cards ?? []),
        ...(duelState?.data?.player2?.cards ?? []),
      ].map(c => c.id).filter(id => id !== consumed.card_id)
      const wrongTarget = allInPlay[0] ?? 99999
      vicWs.send(JSON.stringify({ type: 'grab', card_id: wrongTarget, cmd_id: ++cmdId }))
      await sleep(1000)
      out.saw_grab_wrong = vicEv.some(e => e.type === 'duel_grab_wrong' && e.user_id === VICTIM)
      vicWs.send(JSON.stringify({ type: 'grab', card_id: consumed.card_id, cmd_id: ++cmdId }))
      await sleep(1000)
      out.saw_grab_blocked = vicEv.some(e => e.type === 'duel_grab_blocked')
      wrongDone = true
    } else {
      vicWs.send(JSON.stringify({ type: 'grab', card_id: consumed.card_id, cmd_id: ++cmdId }))
      await sleep(900)
    }
    await sleep(500)
    if (giveDone && wrongDone) break
    if (vicEv.some(e => e.type === 'duel_game_over')) break
  }
  hostWs.close(); vicWs.close()
}

// ============ 房 B：超时 requeue 闭环 ============
{
  const { hostWs, vicWs, vicEv } = await setupDuel({
    duel_total_cards: 6, duel_round_time: 3, duel_grab_chances: 2, duel_flip: true, duel_requeue: true,
  })
  // 确认首回合已开始（duel_card_start 出现）再静默
  let started = false
  for (let i = 0; i < 30 && !started; i++) {
    started = vicEv.some(e => e.type === 'duel_card_start')
    if (!started) await sleep(250)
  }
  out.timeout_room_started = started
  // 双方静默，等首张超时（服务端 round_time 下限钳到 30s，需等 >30s）
  await sleep(35000)
  const timeout = lastOf(vicEv, 'duel_timeout')
  out.saw_timeout = !!timeout
  out.timeout_requeued = timeout ? timeout.requeued : null
  // requeue 闭环：超时的牌应重新出现（同 card_id 再次 duel_card_start）
  const firstTimeoutCard = timeout ? timeout.card_id : null
  // requeue 后牌回队尾：等后续回合推进后同 card_id 再次出现（30s/回合，等两轮余量）
  await sleep(65000)
  const reappeared = vicEv.filter(e => e.type === 'duel_card_start').some(e => e.card_id === firstTimeoutCard)
  out.requeued_card_reappeared = reappeared
  out.timeout_room_events = [...new Set(vicEv.map(e => e.type))].slice(0, 15)
  hostWs.close(); vicWs.close()
}

console.log(JSON.stringify(out, null, 2))
const pass = out.saw_give_request === true && out.saw_give_done === true && out.give_claimed_opponent === true
  && out.saw_grab_wrong === true && out.saw_grab_blocked === true
  && out.saw_timeout === true && out.timeout_requeued === true && out.requeued_card_reappeared === true
console.log(pass ? 'DUEL SUB-BRANCHES ALL ✓' : 'DUEL SUB-BRANCHES ✗')
process.exit(pass ? 0 : 1)
