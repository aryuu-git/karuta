# CCP 本地联机模式修正方案

## 背景

当前 `ccp/local` 已经被改造成一个“固定单房间同步题板”：

- `/ccp/local/host`：出题视角
- `/ccp/local/player`：玩家视角
- `/ws/ccp-local`：全局 WebSocket，同步题板状态和聊天

这个模式不需要房间管理、不需要玩家列表、不需要分数、不需要投票、不需要系统判定。实际玩法是大家连麦，网页只负责同步题面和聊天。

当前有两个需要修正的问题：

1. 聊天里的说话人 ID 是本地随机生成的 mock ID，例如 `P-1234` / `HOST-5678`，不是实际登录用户。
2. “结束对局”的帅气动画只在出题视角播放，玩家视角通常只收到最终状态快照，没有同步播放结束动画。

本文只解决这两个问题，不扩大系统范围。

## 总目标

保持当前极简架构：

- 只有一个全局同步房间
- 不做房间码
- 不做玩家管理
- 不做在线成员列表
- 不做抢答、判定、投票、计分

本次修正只做：

1. 聊天显示真实登录用户身份。
2. 结束对局动画以 action 事件同步到所有视角。

## 相关文件

- `frontend/public/guess-emperor.html`
- `frontend/src/pages/CcpLocalPage.tsx`
- `frontend/src/App.tsx`
- `ccp/local_live.go`
- `ccp/router.go`

主要改动集中在：

- `frontend/public/guess-emperor.html`
- `ccp/local_live.go`

## 问题一：聊天 ID 使用真实用户

### 当前问题

当前前端大概使用类似逻辑生成聊天身份：

```js
const liveIdPrefix = IS_HOST_VIEW ? 'HOST' : 'P';
let liveClientId = localStorage.getItem(LIVE_ID_KEY);
if (!liveClientId || !liveClientId.startsWith(liveIdPrefix + '-')) {
  liveClientId = liveIdPrefix + '-' + Math.floor(1000 + Math.random() * 9000);
  localStorage.setItem(LIVE_ID_KEY, liveClientId);
}
```

这只是浏览器本地 mock ID，不是项目里的用户 ID。

### 目标行为

聊天显示真实用户信息：

```text
[出题人] aryuu#1：来猜这张
[玩家] test#23：是不是某某
```

如果未登录，则显示游客身份：

```text
[游客] guest：我没登录
```

注意：这里仍然不做玩家管理。只是聊天消息携带显示身份。

### 前端实现方案

在 `guess-emperor.html` 的 live sync 初始化区域增加当前用户加载逻辑。

建议新增全局变量：

```js
let LIVE_USER = {
  id: 'guest',
  username: 'guest',
  label: 'guest',
};
```

新增函数：

```js
async function loadCurrentUser() {
  const token = localStorage.getItem('karuta_token');
  if (!token) {
    return {
      id: 'guest',
      username: 'guest',
      label: 'guest',
    };
  }

  try {
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('not logged in');

    const user = await res.json();
    const id = String(user.id || 'guest');
    const username = user.username || `user-${id}`;

    return {
      id,
      username,
      label: `${username}#${id}`,
    };
  } catch {
    return {
      id: 'guest',
      username: 'guest',
      label: 'guest',
    };
  }
}
```

如果开发环境前端跑在 Vite `5173`，`fetch('/api/me')` 可能打到 Vite 而不是 Go 后端。当前项目的 API client 里有 `API_BASE`，但 `guess-emperor.html` 是纯 HTML，无法直接 import。

可以在 HTML 内写一个小函数，和 WebSocket 地址逻辑保持一致：

```js
function getAPIBase() {
  if (location.port === '5173') {
    return `${location.protocol}//${location.hostname}:8080/api`;
  }
  return '/api';
}
```

然后：

```js
const res = await fetch(`${getAPIBase()}/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

### 初始化顺序

当前可能是：

```js
initLiveSync();
renderHistory();
showScreen('idle');
```

建议改成：

```js
async function initApp() {
  LIVE_USER = await loadCurrentUser();
  initLiveSync();
  renderHistory();
  showScreen('idle');
}

initApp();
```

### 聊天发送格式

当前发送可能是：

```js
liveSocket.send(JSON.stringify({
  type: 'chat',
  data: {
    speaker: liveClientId,
    text,
    ts: Date.now(),
  },
}));
```

改成：

```js
liveSocket.send(JSON.stringify({
  type: 'chat',
  data: {
    userId: LIVE_USER.id,
    username: LIVE_USER.username,
    speaker: LIVE_USER.label,
    role: IS_HOST_VIEW ? 'host' : 'player',
    text,
    ts: Date.now(),
  },
}));
```

### 聊天显示格式

更新 `appendChatMessage(msg)`：

```js
function chatRoleLabel(role) {
  if (role === 'host') return '出题人';
  if (role === 'player') return '玩家';
  return '游客';
}

function appendChatMessage(msg) {
  if (!msg || !msg.text) return;

  const log = $('#chat-log');
  const empty = log.querySelector('.chat-empty');
  if (empty) empty.remove();

  const line = document.createElement('div');
  line.className = 'chat-line';

  const speaker = document.createElement('span');
  speaker.className = 'chat-speaker';
  speaker.textContent = `[${chatRoleLabel(msg.role)}] ${msg.speaker || 'guest'}：`;

  line.appendChild(speaker);
  line.appendChild(document.createTextNode(msg.text));
  log.appendChild(line);

  while (log.children.length > 80) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
```

### 聊天框顶部 ID

当前可能显示：

```js
$('#chat-id').textContent = liveClientId;
```

改成：

```js
$('#chat-id').textContent = LIVE_USER.label;
```

## 问题二：结束对局动画同步

### 当前问题

当前 host 执行 `endGame()` 时，本地会播放：

- 未翻开的卡片依次翻开
- 粒子效果
- 最后一张时烟花效果
- 进入 finished 结果页

但玩家端主要靠 `state_update` 套最终状态，所以没有完整动画过程。

### 目标行为

host 点击“结束对局”后：

1. host 播放结束动画。
2. player 同时播放同一套结束动画。
3. 动画结束后，host 广播最终状态。
4. player 在动画期间不要被最终快照打断。

### 后端新增 action 广播

文件：`ccp/local_live.go`

当前 WebSocket 处理大概有：

```go
switch msg.Type {
case "set_state":
    if msg.Data != nil {
        c.hub.setState(msg.Data)
    }
case "chat":
    c.hub.broadcast(map[string]interface{}{
        "type": "chat",
        "data": msg.Data,
    })
case "ping":
default:
}
```

增加：

```go
case "action":
    c.hub.broadcast(map[string]interface{}{
        "type": "action",
        "data": msg.Data,
    })
```

后端不理解 action 内容，只负责原样广播。

### 前端新增 action 发送函数

文件：`frontend/public/guess-emperor.html`

新增：

```js
function sendLiveAction(action, payload = {}) {
  if (!IS_HOST_VIEW || !liveSocket || liveSocket.readyState !== WebSocket.OPEN) return;

  liveSocket.send(JSON.stringify({
    type: 'action',
    data: {
      action,
      ...payload,
      ts: Date.now(),
    },
  }));
}
```

注意：只有 host 应该主动发送题板 action。

### 拆分结束逻辑

当前大概是：

```js
function handleEndClick() {
  ...
  endGame();
}

function endGame() {
  // 翻完剩余牌
  // 播动画
  // finished / nextImage
}
```

建议拆成：

```js
function requestEndGame() {
  if (!IS_HOST_VIEW) return;
  sendLiveAction('end_game');
  runEndGameAnimation();
}

function runEndGameAnimation() {
  // 原 endGame() 的动画主体
}
```

然后 `handleEndClick()` 里第二次确认时调用：

```js
requestEndGame();
```

不要直接调用旧的 `endGame()`。

### 动画期间加锁

新增：

```js
let liveAnimating = false;
```

在 `runEndGameAnimation()` 开始时：

```js
if (liveAnimating) return;
liveAnimating = true;
```

在动画结束后：

```js
liveAnimating = false;
if (IS_HOST_VIEW) sendLiveState();
```

### 玩家收到 action 后播放动画

WebSocket message 处理里新增：

```js
if (msg.type === 'action') handleLiveAction(msg.data);
```

新增：

```js
function handleLiveAction(data) {
  if (!data || !data.action) return;

  if (data.action === 'end_game') {
    runEndGameAnimation();
  }
}
```

host 会收到自己广播出去的 action。为了避免 host 播两遍，可以二选一：

方案 A：host 发送 action 后本地不立刻执行，等自己也收到广播再执行。

```js
function requestEndGame() {
  if (!IS_HOST_VIEW) return;
  sendLiveAction('end_game');
}
```

方案 B：action 带 sender，host 收到自己的 action 时忽略。

推荐方案 A，所有视角都由同一个广播触发动画，行为更一致。

### 推荐最终流程

使用方案 A：

```js
function requestEndGame() {
  if (!IS_HOST_VIEW) return;
  sendLiveAction('end_game');
}

function handleLiveAction(data) {
  if (!data || !data.action) return;

  if (data.action === 'end_game') {
    runEndGameAnimation();
  }
}
```

这样 host 和 player 都是在收到服务端广播后播放动画。

### 避免 state_update 打断动画

在 `applyLiveState(data)` 开头加：

```js
if (liveAnimating) return;
```

但是这里有一个细节：如果动画期间忽略了最终状态，动画结束后 player 可能缺少最新快照。

更稳的写法是缓存：

```js
let pendingLiveState = null;

async function applyLiveState(data) {
  if (liveAnimating) {
    pendingLiveState = data;
    return;
  }

  // 原来的应用状态逻辑
}
```

在 `runEndGameAnimation()` 动画结束时：

```js
liveAnimating = false;

if (IS_HOST_VIEW) {
  sendLiveState();
} else if (pendingLiveState) {
  const state = pendingLiveState;
  pendingLiveState = null;
  applyLiveState(state);
}
```

注意：如果 player 动画已经正确进入 finished 或下一题，通常不需要立刻套快照。但保留 pending 可以防止网络顺序导致状态落后。

### 修改原自动结束逻辑

当前 `flipTile()` 可能有：

```js
if (STATE.flippedCount >= STATE.tiles.length) {
  setTimeout(() => endGame(), 800);
}
```

应改成：

```js
if (STATE.flippedCount >= STATE.tiles.length) {
  setTimeout(() => requestEndGame(), 800);
}
```

这样“全部翻开自动结束”也会同步动画。

### 修改按钮确认逻辑

当前 `handleEndClick()` 第二次确认可能有：

```js
endGame();
```

改成：

```js
requestEndGame();
```

## 注意事项

### 不要把 action 当状态

`state_update` 是快照，用于让新进入的人追上当前题板。

`action` 是瞬时动作，用于播放动画、触发过渡。

结束动画必须用 action，因为快照无法表达“逐张翻开”的过程。

### 新进入玩家的行为

如果一个玩家在结束动画播放中途才打开页面：

- 他会收到当前 state 快照。
- 不一定能看到完整动画。

这是可以接受的，因为当前模式是极简同步题板，不追求回放系统。

### 图片仍然用 data URL

当前同步状态里包含图片 data URL。这个方案对临时单房间足够简单。

不要在本次修正里引入图片上传、题库、COS、落库等复杂逻辑。

### 聊天身份不等于权限

即使聊天显示真实用户，也不要顺手做：

- host 权限系统
- 在线成员列表
- 玩家列表
- 踢人
- 禁言

这次只是显示身份。

## 验收清单

### 聊天身份

1. 登录用户打开 `/ccp/local/host`。
2. 登录用户打开 `/ccp/local/player`。
3. 双方发送聊天。
4. 聊天框显示真实用户名和用户 ID。
5. 未登录时显示 `guest`，但仍能聊天。

### 结束动画

1. host 上传图片并开始。
2. player 打开玩家视角。
3. host 点击结束对局并确认。
4. host 和 player 都能看到剩余牌依次翻开的动画。
5. 如果是最后一张，host 和 player 都能看到烟花/结束页。
6. 如果不是最后一张，host 和 player 都进入下一张。

### 回归检查

1. host 翻一张，player 同步翻一张。
2. host 右键撤销，player 同步撤销。
3. host 重置，player 回到等待/idle。
4. 玩家视角点击棋盘不会本地翻牌。
5. 结束按钮不再被遮罩或聊天框挡住。

## 建议测试命令

后端：

```powershell
$env:GOCACHE='D:\aryuu_workspace\projects\karuta\.gocache'
$env:GOMODCACHE='D:\aryuu_workspace\projects\karuta\.gomodcache'
go test ./...
```

前端：

```powershell
cd frontend
npm run build
```

HTML 内联脚本语法检查：

```powershell
node -e "const fs=require('fs'); const html=fs.readFileSync('frontend/public/guess-emperor.html','utf8'); const m=html.match(/<script>([\s\S]*)<\/script>/); new Function(m[1]); console.log('guess-emperor script syntax ok')"
```

