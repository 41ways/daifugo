'use strict';
/**
 * 대부호 — 클라이언트
 * 판정은 서버가 한다. 여기서는 화면을 그리고 "이 카드들을 낸다 / 넘긴다 / 돌려준다" 만 보낸다.
 * 낼 수 있는지 미리 보여 주는 건 서버와 같은 rules.js(DR)로 한다.
 * 접속 · 재접속 · 열린 방 목록 · 관전 · 채팅은 바퀴벌레 포커 클라이언트와 같은 짜임이다.
 */

const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const josa = (w, a, b) => { const ch = String(w).charCodeAt(String(w).length - 1); return (ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28) ? a : b; };

const EMO = ['😏', '🤔', '😱', '🙄', '💰', '👏'];
const FACE_NAME = { king: '대부호', rich: '부호', mid: '평민', poor: '빈민', beggar: '대빈민' };
const TITLE_FACE = { 대부호: 'king', 부호: 'rich', 평민: 'mid', 빈민: 'poor', 대빈민: 'beggar' };
const faceImg = k => `/img/rk_${k}.webp`;
const SUIT_NAME = { S: '스페이드', H: '하트', D: '다이아', C: '클로버' };

/* 규칙 고르기 — 대기실 토글 */
const RULE_INFO = [
  ['stairs', '계단', '같은 무늬로 이어진 3장 이상'],
  ['eight', '8 자르기', '8을 내면 바닥이 치워지고 다시 낸다'],
  ['lock', '문양 묶기', '앞 카드와 무늬가 같으면 그 무늬만'],
  ['spade3', '스페이드 3 되치기', '조커 한 장을 ♠3 으로 이긴다'],
  ['miyako', '도시 추락', '대부호가 1등을 놓치면 바로 대빈민'],
  ['foul', '반칙 마무리', '조커 · 8 · 2(혁명 중 3)로 끝내면 꼴찌'],
  ['jback', 'J 백', 'J를 내면 바닥이 치워질 때까지 세기 반전'],
];

/* ─────────────────────────── 카드 그리기 ───────────────────────────
   카드는 트럼프 그대로 — 모서리 숫자·무늬, 숫자 카드는 실제 무늬 배치. 그림 카드만 우키요에 인물. */

const isRed = s => s === 'H' || s === 'D';
const rn = r => DR.rankName(r);
const sv = (s, cls = '') => `<svg class="${cls}" viewBox="0 0 100 100"><use href="#s-${s}"/></svg>`;
const PIPS = {
  1: [[50, 50]],
  2: [[50, 10], [50, 90]],
  3: [[50, 10], [50, 50], [50, 90]],
  4: [[22, 10], [78, 10], [22, 90], [78, 90]],
  5: [[22, 10], [78, 10], [50, 50], [22, 90], [78, 90]],
  6: [[22, 10], [78, 10], [22, 50], [78, 50], [22, 90], [78, 90]],
  7: [[22, 10], [78, 10], [50, 30], [22, 50], [78, 50], [22, 90], [78, 90]],
  8: [[22, 10], [78, 10], [50, 30], [22, 50], [78, 50], [50, 70], [22, 90], [78, 90]],
  9: [[22, 10], [78, 10], [22, 37], [78, 37], [50, 50], [22, 63], [78, 63], [22, 90], [78, 90]],
  10: [[22, 10], [78, 10], [50, 23], [22, 37], [78, 37], [22, 63], [78, 63], [50, 77], [22, 90], [78, 90]],
};

function cardHTML(c, cls = '') {
  if (!c) return `<div class="card back ${cls}"></div>`;
  const data = c.id != null ? ` data-id="${c.id}"` : '';
  if (c.s === 'X') {
    return `<div class="card joker ${cls}"${data} title="조커"><span class="ix tl jk">JOKER</span><span class="ix br jk">JOKER</span>
      <div class="face court"><img src="/img/court_X.webp" alt="" draggable="false"></div></div>`;
  }
  const r = c.r;
  const idx = `<b>${rn(r)}</b>${sv(c.s, 'ip')}`;
  let face;
  if (r >= 11 && r <= 13) {
    const k = rn(r);
    face = `<div class="face court"><img src="/img/court_${k}.webp" alt="" draggable="false">${sv(c.s, 'cp tl')}${sv(c.s, 'cp br')}</div>`;
  } else {
    const n = r === 14 ? 1 : r === 15 ? 2 : r;
    const big = n === 1 ? (c.s === 'S' ? ' ace aceS' : ' ace') : '';
    face = `<div class="face pips${big}">${PIPS[n].map(([x, y]) => `<span class="pp${y > 50 ? ' inv' : ''}" style="left:${x}%;top:${y}%">${sv(c.s)}</span>`).join('')}</div>`;
  }
  return `<div class="card ${isRed(c.s) ? 'red' : 'blk'} ${cls}"${data} title="${DR.cardName(c)}"><span class="ix tl">${idx}</span><span class="ix br">${idx}</span>${face}</div>`;
}

/* 타이틀 · 규칙 화면의 카드 */
$('#ttFan').innerHTML = cardHTML({ s: 'S', r: 3 }, 'c1') + cardHTML({ s: 'X', r: 16 }, 'c2') + cardHTML({ s: 'S', r: 14 }, 'c3');
$('#strengthRow').innerHTML = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((r, i) => cardHTML({ s: DR.SUITS[i % 4], r }, 'mini')).join('') + cardHTML({ s: 'X', r: 16 }, 'mini');
$('#rankStrip').innerHTML = ['king', 'rich', 'mid', 'poor', 'beggar'].map(k => `<figure><img src="${faceImg(k)}" alt=""><figcaption>${FACE_NAME[k]}</figcaption></figure>`).join('');

(() => {
  const list = ['court_J', 'court_Q', 'court_K', 'court_X', 'back', 'rk_king', 'rk_rich', 'rk_mid', 'rk_poor', 'rk_beggar'];
  setTimeout(() => list.forEach(n => { const i = new Image(); i.src = `/img/${n}.webp`; }), 600);
})();

/* ─────────────────────────── 상태 ─────────────────────────── */

let ws = null;
let me = null;
let S = null;
let skew = 0;
let specId = null, specCtx = null, specRejoin = false;
const isSpec = () => !!S && S.role === 'spec';
const store = window.sessionStorage;
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

window.__S = () => S;
let qaHold = false;
if (new URLSearchParams(location.search).has('qa')) window.__feed = m => { qaHold = true; handle(m); };

/* ─────────────────────────── 소리 ─────────────────────────── */

let muted = ls.get('daifugo.mute') === '1';
let actx = null;
function ac() {
  if (muted) return null;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch (_) { return null; }
}
function tone(f, t0, dur, type = 'sine', vol = .12, f2) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0, c.currentTime + t0);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + .01);
  g.gain.exponentialRampToValueAtTime(.0008, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + .05);
}
function noise(t0, dur, vol = .15, freq = 2400) {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = .8;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination);
  s.start(c.currentTime + t0);
}
const sfx = {
  card: n => { for (let i = 0; i < Math.min(n || 1, 4); i++) noise(i * .05, .09, .22, 2600); },
  pass: () => tone(330, 0, .12, 'triangle', .05, 260),
  clear: () => { noise(0, .3, .14, 1200); },
  turn: () => { tone(988, 0, .12, 'sine', .08); tone(1318, .09, .18, 'sine', .07); },
  pop: () => tone(740, 0, .07, 'triangle', .07, 980),
  rev: () => { tone(110, 0, .6, 'sawtooth', .06, 70); [392, 466, 554, 659].forEach((f, i) => tone(f, .15 + i * .09, .3, 'square', .04)); },
  cut: () => { noise(0, .12, .3, 4200); tone(1400, 0, .1, 'triangle', .05, 600); },
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, i * .1, .3, 'triangle', .08)); },
  fall: () => { [440, 392, 330, 262].forEach((f, i) => tone(f, i * .14, .26, 'triangle', .08)); },
  coin: () => { tone(1568, 0, .08, 'sine', .07); tone(2093, .06, .14, 'sine', .06); },
};
function syncMute() {
  $$('[data-mute]').forEach(b => { b.textContent = muted ? '🔇' : '🔊'; b.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); });
}
$$('[data-mute]').forEach(b => b.onclick = () => { muted = !muted; ls.set('daifugo.mute', muted ? '1' : '0'); syncMute(); if (!muted) sfx.pop(); });
syncMute();

/* ─────────────────────────── 접속 ─────────────────────────── */

let pingT = null, resting = false, wokeUp = false, restWhy = 0;

function resume() {
  connect(() => {
    const code = store.getItem('code'), token = store.getItem('token');
    if (code && token) send({ t: 'resume', code, token });
  });
}

function wake(e) {
  if (!resting) return;
  if (e.type === 'visibilitychange' && (document.hidden || restWhy === 4001)) return;
  resting = false;
  $('#toast').classList.remove('on');
  if (store.getItem('code') && store.getItem('token')) { wokeUp = true; resume(); }
  else if (specCtx) rejoinSpec();
  else if (watching) watchRooms(true);
}
['pointerdown', 'keydown'].forEach(t => addEventListener(t, wake, true));
document.addEventListener('visibilitychange', wake);

function connect(onOpen) {
  if (ws && ws.readyState === 1) { onOpen && onOpen(); return; }
  if (ws) { ws.onopen = ws.onmessage = ws.onclose = null; try { ws.close(); } catch (_) {} }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => {
    if (sock !== ws) return;
    clearInterval(pingT);
    pingT = setInterval(() => send({ t: 'ping' }), 25_000);
    onOpen && onOpen();
  };
  ws.onmessage = e => {
    if (sock !== ws || qaHold) return;
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.t === 'moved' || m.t === 'idle') {
      sock.why = m.t;
      sock.onclose({ code: m.t === 'moved' ? 4001 : 4000 });
      ws = null;
      try { sock.close(); } catch (_) {}
      return;
    }
    handle(m);
  };
  ws.onclose = e => {
    if (sock !== ws) return;
    clearInterval(pingT);
    const code = sock.why === 'moved' ? 4001 : sock.why === 'idle' ? 4000 : e.code;
    if (code === 4000 || code === 4001) {
      resting = true; restWhy = code;
      const t = $('#toast');
      t.textContent = code === 4000
        ? '한동안 조작이 없어서 연결을 쉬고 있어요. 아무 곳이나 누르면 다시 붙어요.'
        : '다른 창에서 이 자리를 이어받았어요. 여기서 계속하려면 아무 곳이나 누르세요.';
      t.classList.add('on');
      clearTimeout(toastT);
      return;
    }
    if (watching && !store.getItem('code')) {
      setTimeout(() => { if (watching && (!ws || ws.readyState > 1)) watchRooms(true); }, 3000);
    } else if (store.getItem('code') && store.getItem('token')) {
      toast('연결이 끊겼어요. 다시 붙는 중…');
      setTimeout(() => connect(() => send({ t: 'resume', code: store.getItem('code'), token: store.getItem('token') })), 1200);
    } else if (specCtx) {
      toast('연결이 끊겼어요. 다시 붙는 중…');
      setTimeout(() => { if (specCtx && (!ws || ws.readyState > 1)) rejoinSpec(); }, 1200);
    } else {
      show('title');
    }
  };
}

function rejoinSpec() {
  if (!specCtx) return;
  specRejoin = true;
  connect(() => send({ t: 'join', code: specCtx.code, name: specCtx.name }));
}

const send = obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };

let leaving = false;
function handle(m) {
  if (leaving) {
    if (m.t !== 'left' && m.t !== 'err') return;
    leaving = false;
    if (m.t === 'err') return;
  }
  switch (m.t) {
    case 'welcome':
      wokeUp = false; entering = 0;
      if (m.code !== chatRoom) { chatRoom = m.code; chatReset(); }
      specRejoin = false;
      if (m.role === 'spec') {
        me = null; specId = m.specId;
        specCtx = { code: m.code, name: myName() };
        store.removeItem('code'); store.removeItem('token');
        history.replaceState(null, '', `?r=${m.code}`);
        break;
      }
      me = m.you;
      specId = null; specCtx = null;
      store.setItem('code', m.code);
      store.setItem('token', m.token);
      history.replaceState(null, '', `?r=${m.code}`);
      if (m.seated) toast('자리가 났어요 — 이제 같이 해요');
      break;

    case 'chat':
      addChat(m.spec ? `${m.name} (관전)` : m.name, m.text, m.from === (me != null ? me : specId));
      break;

    case 'rooms':
      if (watching) renderRooms(m.list);
      break;

    case 'state': {
      const prev = S;
      countGame(m);
      S = m;
      me = m.role === 'spec' ? null : (m.you != null ? m.you : me);
      if (m.now) skew = m.now - Date.now();
      render(prev);
      break;
    }

    case 'ev':
      if (m.kind === 'joined' && m.by !== me) toast('누가 들어왔어요');
      if (m.kind === 'timeout' && m.by === me) toast('시간이 지나서 알아서 뒀어요');
      break;

    case 'react':
      floatEmo(m.from, m.e);
      break;

    case 'err':
      entering = 0;
      toast(m.fatal && wokeUp ? '오래 비워 둔 사이 방이 정리됐어요. 새로 열어 주세요.' : m.msg);
      if (m.fatal) { store.removeItem('code'); store.removeItem('token'); specCtx = null; specId = null; show('title'); }
      else if (specRejoin) { specRejoin = false; specCtx = null; specId = null; show('title'); }
      wokeUp = false;
      break;

    case 'left':
      store.removeItem('code'); store.removeItem('token');
      specCtx = null; specId = null;
      history.replaceState(null, '', location.pathname);
      show('title');
      break;
  }
}

/* ─────────────────────────── 화면 ─────────────────────────── */

let screen = 'title';
function show(id) {
  screen = id;
  $$('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  document.body.classList.toggle('in-game', id === 'game');
  if ((id === 'setup') !== watching) watchRooms(id === 'setup');
  if (id === 'title' || id === 'setup') { chatRoom = null; chatReset(); $('#chatBtn').hidden = true; $('#logBox').hidden = true; }
}

let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

const playerOf = id => (S ? S.players.find(p => p.id === id) : null);
const nameOf = id => { const p = playerOf(id); return p ? (p.id === me ? '나' : p.name) : '?'; };
const who = (id, a = '이', b = '가') => (id === me ? (a === '이' ? '내가' : '나' + b) : `${esc(nameOf(id))}${josa(nameOf(id), a, b)}`);
/** 자리 그림 — 지난 판 계급이 있으면 그 계급 얼굴 */
const avatarOf = p => faceImg((S && S.prevTitles && TITLE_FACE[S.prevTitles[p.id]]) || p.face || 'mid');

/* ─────────────────────────── 채팅 ─────────────────────────── */

let chatUnread = 0, chatRoom = null, chatAway = 0, chatPeekT = 0;
const chatTitle0 = document.title;

function chatReset() {
  $('#chatLog').textContent = '';
  $('#chat').hidden = true;
  chatUnread = 0; chatBadge(); chatPeekOff();
  chatAway = 0; chatTitle();
}
function chatOpen(on) {
  $('#chat').hidden = !on;
  if (!on) return;
  chatUnread = 0; chatBadge(); chatPeekOff();
  $('#chatText').focus();
  const log = $('#chatLog'); log.scrollTop = log.scrollHeight;
}
function addChat(name, text, mine) {
  const log = $('#chatLog');
  const d = document.createElement('p');
  d.className = 'chat-msg' + (mine ? ' mine' : '');
  d.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
  log.appendChild(d);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
  if (mine) return;
  if ($('#chat').hidden) { chatUnread++; chatBadge(); chatPeek(name, text); }
  if (document.hidden || !document.hasFocus()) { chatAway++; chatTitle(); }
}
function chatBadge() {
  for (const n of [$('#chatN'), $('#chatN2')]) {
    n.textContent = chatUnread > 99 ? '99+' : chatUnread;
    n.hidden = !chatUnread;
    if (!chatUnread) continue;
    n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
  }
}
function chatPeek(name, text) {
  const p = $('#chatPeek');
  p.innerHTML = `<b>${esc(name)}</b>${esc(text)}`;
  p.classList.remove('bye'); p.hidden = false;
  p.style.animation = 'none'; void p.offsetWidth; p.style.animation = '';
  clearTimeout(chatPeekT);
  chatPeekT = setTimeout(() => { p.classList.add('bye'); chatPeekT = setTimeout(chatPeekOff, 260); },
    Math.min(6000, Math.max(3000, 1200 + 70 * text.length)));
}
function chatPeekOff() { clearTimeout(chatPeekT); const p = $('#chatPeek'); p.hidden = true; p.classList.remove('bye'); }
function chatTitle() { document.title = (chatAway ? `(${chatAway > 99 ? '99+' : chatAway}) ` : '') + chatTitle0; }
function chatBack() { if (chatAway && !document.hidden && document.hasFocus()) { chatAway = 0; chatTitle(); } }
document.addEventListener('visibilitychange', chatBack);
window.addEventListener('focus', chatBack);
function syncChatVisible() {
  const humans = S ? S.players.filter(p => !p.bot).length + (S.specs ? S.specs.length : 0) : 0;
  const on = !!S && screen !== 'title' && screen !== 'setup';
  $('#chatBtn').hidden = !on;
  if (!on) { $('#chat').hidden = true; chatPeekOff(); }
  else $('#chatWho').textContent = humans > 1 ? `${humans}명` : '지금은 나 혼자 — 초대 링크로 불러 보세요';
}
$('#chatBtn').onclick = () => chatOpen($('#chat').hidden);
$('#bChatBar').onclick = () => chatOpen($('#chat').hidden);
$('#chatPeek').onclick = () => chatOpen(true);
$('#chatX').onclick = () => chatOpen(false);
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const box = $('#chatText');
  const text = box.value.trim();
  if (!text) return;
  send({ t: 'chat', text });
  box.value = '';
});

/* ─────────────────────────── 그리기 ─────────────────────────── */

let gameAt = 0;
function countGame(m) {
  if (m.role === 'spec') { if (window.norara && norara.live) norara.live(false); return; }
  const my = m.you != null ? m.you : me;
  if (window.norara && norara.live) norara.live(m.phase === 'playing');
  if (!window.norara || !m.players || m.hostId !== my) return;
  const humans = m.players.filter(p => !p.bot).length;
  if (m.phase === 'playing' && (!S || S.phase !== 'playing')) {
    gameAt = Date.now();
    norara.ev('start', { n: humans, rounds: m.cfg.rounds });
  } else if (m.phase === 'over' && (!S || S.phase !== 'over') && gameAt) {
    norara.ev('end', { n: humans, sec: Math.round((Date.now() - gameAt) / 1000) });
    gameAt = 0;
  }
}

function render(prev) {
  if (!S) return;
  document.body.classList.toggle('spec', isSpec());
  syncChatVisible();
  if (S.phase === 'lobby') { show('lobby'); renderLobby(); }
  else if (S.phase === 'playing') { if (screen !== 'game') show('game'); renderGame(prev); }
  else if (S.phase === 'over') {
    if (prev && prev.phase === 'playing') {
      renderGame(prev);
      setTimeout(() => { if (S.phase === 'over') { show('over'); renderOver(); } }, 400);
    } else { show('over'); renderOver(); }
  }
}

/* ── 대기실 ── */

function rulesSummary(c) {
  const on = RULE_INFO.filter(([k]) => c[k]).map(([, n]) => n);
  return `조커 ${c.jokers}장 · ` + (on.length ? on.join(' · ') : '특수 규칙 없음');
}

function renderLobby() {
  $('#lCode').textContent = S.code;
  const spec = isSpec();
  $('#lCount').textContent = `${S.players.length} / ${S.max}명` + (S.cfg.priv ? ' · 비공개' : '')
    + (S.specs && S.specs.length ? ` · 관전 ${S.specs.length}명` : '');
  $('#lSpecNote').hidden = !spec;
  const n = S.players.length;
  const titles = DR.titles(Math.max(2, n));
  $('#lRule').innerHTML = n < 2 ? '두 명 이상이면 시작할 수 있어요'
    : `${n}명 · <b>${S.cfg.rounds}판</b> · 계급 ${titles.filter((t, i) => titles.indexOf(t) === i).join(' · ')}<br><small>${esc(rulesSummary(S.cfg))}${n === 2 ? ' · 2인은 33장 중 13장씩' : ''}</small>`;
  const isHost = !spec && S.hostId === me;

  let html = '';
  for (const p of S.players) {
    const mine = p.id === me;
    html += `<li class="seat-card${mine ? ' mine' : ''}" data-id="${p.id}">
      <div class="face"><img src="${faceImg(p.face)}" alt=""></div>
      <span class="nm">${esc(p.name)}</span>
      <span class="badges">${p.id === S.hostId ? '<span class="badge host">방장</span>' : ''}${p.bot ? '<span class="badge">봇</span>' : ''}${!p.bot && !p.connected ? '<span class="badge off">끊김</span>' : ''}${mine ? '<span class="badge">나</span>' : ''}</span>
      ${isHost && p.id !== S.hostId ? `<button class="kick" data-kick="${p.id}" title="내보내기">✕</button>` : ''}
    </li>`;
  }
  for (let i = S.players.length; i < S.max; i++) html += '<li class="seat-card empty">빈 자리</li>';
  $('#lPlayers').innerHTML = html;

  $('#lHostBox').classList.toggle('hidden', !isHost);
  $('#lWait').classList.toggle('hidden', isHost);
  $('#lWait').textContent = spec ? '관전 대기 중 — 방장이 시작하면 구경하고, 자리가 나면 같이 해요' : '방장이 시작하기를 기다리는 중';

  $('#tPriv').setAttribute('aria-checked', String(!!S.cfg.priv));
  $('#tSpec').setAttribute('aria-checked', String(S.cfg.spec !== false));
  $$('#segTime button').forEach(b => b.classList.toggle('on', Number(b.dataset.ms) === S.cfg.turnLimit));
  $$('#segRounds button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === S.cfg.rounds));
  $$('#segJoker button').forEach(b => b.classList.toggle('on', Number(b.dataset.j) === S.cfg.jokers));
  $('#rulesSum').textContent = RULE_INFO.filter(([k]) => S.cfg[k]).length + '/' + RULE_INFO.length + '개 켬';
  $('#ruleToggles').innerHTML = RULE_INFO.map(([k, nm, d]) => `<button class="rt${S.cfg[k] ? ' on' : ''}" data-rule="${k}" role="switch" aria-checked="${!!S.cfg[k]}"><b>${nm}</b><small>${d}</small></button>`).join('');
  if (!isHost) return;
  $('#bStart').disabled = S.players.length < S.min;
  $('#bBot').disabled = S.players.length >= S.max;
}

$('#lPlayers').addEventListener('click', e => {
  const k = e.target.closest('[data-kick]');
  if (k) send({ t: 'kick', id: Number(k.dataset.kick) });
});
$('#ruleToggles').addEventListener('click', e => {
  const b = e.target.closest('[data-rule]');
  if (!b || !S) return;
  send({ t: 'cfg', [b.dataset.rule]: !S.cfg[b.dataset.rule] });
  sfx.pop();
});

/* ── 게임 ── */

let sel = new Set();          // 고른 카드 id
let selKey = '';
let hintI = -1;
let lastFx = 0;
let lastStep = '';

const ctxNow = () => ({ rev: S.rev !== S.jrev, lock: S.lock, rules: S.cfg });
const myP = () => playerOf(me);

/** 지금 내가 할 일 — play | back | null */
function myMode() {
  if (!S || S.phase !== 'playing' || isSpec()) return null;
  if (S.step === 'exchange') {
    const d = S.exchange && S.exchange.deals.find(x => x.rich === me && !x.done);
    return d ? 'back' : null;
  }
  if (S.step === 'play' && S.turn === me) return 'play';
  return null;
}
function myDeal() { return S.exchange && S.exchange.deals.find(x => x.rich === me || x.poor === me); }

function oppOrder() {
  const list = S.players.slice();
  const i = list.findIndex(p => p.id === me);
  return i >= 0 ? list.slice(i + 1).concat(list.slice(0, i)) : list;
}

const RING_R = 26, RING_C = 2 * Math.PI * RING_R;
const ringSVG = `<svg class="ring" viewBox="0 0 60 60"><circle class="bg" cx="30" cy="30" r="${RING_R}"/><circle class="fg" cx="30" cy="30" r="${RING_R}" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`;

/** 이번 판에서 몇 등으로 끝났나 */
function placeOf(p) {
  if (!p.out) return null;
  const i = S.order.indexOf(p.id);
  const n = S.players.length;
  if (i >= 0) return i;
  const j = S.bottom.indexOf(p.id);
  return j >= 0 ? n - 1 - j : null;
}
function outLabel(p) {
  const i = placeOf(p);
  if (i == null) return '';
  const t = DR.titles(S.players.length)[i];
  const how = p.howOut === 'miyako' ? '도시 추락' : p.howOut === 'foul' ? '반칙' : `${i + 1}등`;
  return `<span class="outtag ${p.howOut || ''}">${how} · ${t}</span>`;
}

function seatHTML(p, act) {
  const passed = S.step === 'play' || S.step === 'clear' ? S.passed.includes(p.id) : false;
  const title = S.prevTitles && S.prevTitles[p.id];
  const n = Math.min(p.hand, 7);
  const fan = Array.from({ length: n }, (_, i) => `<i style="--i:${i - (n - 1) / 2}"></i>`).join('');
  return `<div class="seat-top">
      <span class="av">${p.id === act ? ringSVG : ''}<img src="${avatarOf(p)}" alt=""></span>
      <div class="seat-id">
        <p class="seat-nm">${esc(p.name)}${!p.bot && !p.connected ? ' <span class="dc">끊김</span>' : ''}</p>
        <p class="seat-sub">${title ? `<span class="ttl t-${TITLE_FACE[title]}">${title}</span>` : ''}<span class="pts">${p.score}점</span></p>
      </div>
    </div>
    <div class="seat-hand">${p.out ? outLabel(p) : `<span class="mini-fan">${fan}</span><b class="hn">${p.hand}</b>`}${passed && !p.out ? '<span class="passtag">패스</span>' : ''}</div>`;
}

function renderSeats() {
  const opps = oppOrder();
  const box = $('#opps');
  const wide = innerWidth > 760;
  const n = opps.length;
  const act = S.step === 'play' ? S.turn : null;
  box.innerHTML = opps.map((p, i) => {
    const a = n === 1 ? 270 : 192 + (156 * i) / (n - 1);
    const tw = box.clientWidth || innerWidth, half = 92 / tw * 100 + 0.8;
    const x = Math.min(100 - half, Math.max(half, 50 + 42 * Math.cos(a * Math.PI / 180)));
    const y = 50 + 40 * Math.sin(a * Math.PI / 180);
    const cls = ['seat'];
    if (p.id === act) cls.push('now');
    if (p.out) cls.push('done');
    if (S.lastBy === p.id && S.field) cls.push('lead');
    return `<div class="${cls.join(' ')}" data-seat="${p.id}" style="${wide ? `--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%` : ''}">${seatHTML(p, act)}</div>`;
  }).join('');
}

function renderMe() {
  const mine = myP();
  $('#meZone').hidden = !mine;
  if (!mine) return;
  const act = S.step === 'play' && S.turn === me;
  $('#meZone').classList.toggle('now', act);
  $('#meAv').innerHTML = (act ? ringSVG : '') + `<img src="${avatarOf(mine)}" alt="">`;
  const title = S.prevTitles && S.prevTitles[me];
  $('#meName').innerHTML = `${esc(mine.name)} <small>(나)</small>`;
  $('#meSub').innerHTML = (title ? `<span class="ttl t-${TITLE_FACE[title]}">${title}</span> ` : '') + `<span class="pts">${mine.score}점</span> · 손에 ${mine.hand}장` + (mine.out ? ' · ' + outLabel(mine) : '');
}

/** 이번 바닥에 나온 카드들 — 지난 수 기록에서 마지막 치우기 뒤의 것 */
function trickPlays() {
  const out = [];
  for (const e of S.log || []) {
    if (e.k === 'clear' || e.k === 'round' || e.k === 'tax' || e.k === 'end') break;
    if (e.k === 'play') out.push(e);
  }
  return out.reverse();
}

function renderPile() {
  const pile = $('#pile');
  const status = $('#status');
  if (S.step === 'exchange') {
    pile.innerHTML = exchangeHTML();
    status.innerHTML = '';
    return;
  }
  const plays = S.field ? trickPlays().slice(-4) : [];
  if (S.field && (!plays.length || plays[plays.length - 1].by !== S.field.by)) plays.push({ by: S.field.by, cards: S.field.cards });
  pile.classList.toggle('clearing', S.step === 'clear');
  pile.innerHTML = plays.map((pl, i) => {
    const top = i === plays.length - 1;
    const k = plays.length - 1 - i;
    return `<div class="play${top ? ' top' : ''}" style="--k:${k}" data-by="${pl.by}">
      <div class="cards">${pl.cards.map(c => cardHTML(c)).join('')}</div>
      ${top ? `<p class="by">${esc(nameOf(pl.by))}</p>` : ''}
    </div>`;
  }).join('') || '<div class="empty-field">바닥이 비었어요</div>';

  if (S.step === 'clear') {
    const why = { eight: '✂️ 8 자르기!', s3: '♠ 3 되치기!', pass: '모두 패스' }[S.clearWhy] || '';
    status.innerHTML = `<b>${why}</b> 바닥을 치웁니다`;
  } else if (S.step === 'play') {
    const t = S.turn;
    const lead = !S.field;
    if (t === me) status.innerHTML = lead ? '<b class="you">내 차례</b> — 아무 꼴이나 새로 내세요'
      : DR.legalPlays(S.hand, S.field, ctxNow()).length ? '<b class="you">내 차례</b> — 더 센 카드를 내거나 패스' : '<b class="you">내 차례</b> — 낼 수 있는 카드가 없어요. 패스!';
    else status.innerHTML = `<b>${esc(nameOf(t))}</b> 차례${lead ? ' · 새로 낸다' : ''}`;
  } else if (S.step === 'roundEnd') {
    status.innerHTML = `${S.round}판 끝`;
  } else status.innerHTML = '';
}

function exchangeHTML() {
  const ex = S.exchange;
  if (!ex) return '';
  const mine = myDeal();
  const rows = ex.deals.map(d => {
    const rich = playerOf(d.rich), poor = playerOf(d.poor);
    const tR = S.prevTitles[d.rich], tP = S.prevTitles[d.poor];
    return `<li><span class="xp"><img src="${avatarOf(poor)}" alt=""><b>${esc(nameOf(d.poor))}</b><small>${tP}</small></span>
      <span class="xa">→ 가장 센 ${d.k}장 →<br>← 아무 ${d.k}장 ← ${d.done ? '✓' : '<i class="dots">…</i>'}</span>
      <span class="xp"><img src="${avatarOf(rich)}" alt=""><b>${esc(nameOf(d.rich))}</b><small>${tR}</small></span></li>`;
  }).join('');
  let mineHTML = '';
  if (mine && mine.got) {
    const cards = mine.got;
    if (mine.rich === me) {
      mineHTML = mine.done ? '<div class="xmine">돌려줬어요. 다른 사람을 기다리는 중…</div>'
        : `<div class="xmine">${esc(nameOf(mine.poor))}에게서 받은 카드 <span class="xcards">${cards.map(c => cardHTML(c, 'mini')).join('')}</span><br><b>돌려줄 카드 ${mine.k}장</b>을 손패에서 골라 주세요</div>`;
    } else {
      mineHTML = `<div class="xmine">가장 센 카드 <span class="xcards">${cards.map(c => cardHTML(c, 'mini')).join('')}</span> 를 ${esc(nameOf(mine.rich))}에게 바쳤어요 😢${mine.done ? '' : '<br>무엇을 돌려받을까…'}</div>`;
    }
  }
  const left = Math.max(0, Math.ceil((ex.endsAt - (Date.now() + skew)) / 1000));
  return `<div class="xbox"><p class="xhead">💰 세금 — 카드 바꾸기 <small class="xleft" data-ends="${ex.endsAt}">${left}초</small></p><ul class="xlist">${rows}</ul>${mineHTML}</div>`;
}

/** 손패 — 겹쳐서 부채꼴로. 내 차례에는 낼 수 없는 카드를 흐리게 */
function renderHand(mode) {
  const box = $('#hand');
  $('#handWrap').hidden = isSpec();
  if (isSpec()) return;
  const hand = DR.sortCards(S.hand, S.rev);
  if (!hand.length) { box.innerHTML = `<p class="hand-empty">${myP() && myP().out ? '다 털었어요! 다른 사람을 기다리는 중' : '손에 카드가 없어요'}</p>`; return; }
  let usable = null;
  if (mode === 'play') {
    usable = new Set();
    for (const p of DR.legalPlays(S.hand, S.field, ctxNow())) for (const c of p.cards) usable.add(c.id);
  }
  const W = box.clientWidth || innerWidth - 24;
  const cw = cardW();
  const step = hand.length > 1 ? Math.min(cw * 0.72, (W - cw - 8) / (hand.length - 1)) : 0;
  box.style.setProperty('--cw', cw + 'px');
  box.innerHTML = `<div class="fan" style="width:${cw + step * (hand.length - 1)}px">${hand.map((c, i) => {
    const cls = ['hc'];
    if (sel.has(c.id)) cls.push('sel');
    if (usable && !usable.has(c.id)) cls.push('dim');
    const got = (S.lastTax || []).some(d => d.rich === me ? (d.got || []).includes(c.id) : (d.back || []).includes(c.id));
    if (got && S.round && newTaxRound === S.round) cls.push('new');
    return `<button class="${cls.join(' ')}" data-cid="${c.id}" style="left:${(i * step).toFixed(1)}px;z-index:${i + 1}">${cardHTML(c)}</button>`;
  }).join('')}</div>`;
}
let newTaxRound = 0;
const cardW = () => (innerWidth <= 420 ? 66 : innerWidth <= 760 ? 84 : Math.round(Math.max(90, Math.min(132, innerHeight * 0.155))));

$('#hand').addEventListener('click', e => {
  const b = e.target.closest('[data-cid]');
  if (!b || !S) return;
  const id = Number(b.dataset.cid);
  const mode = myMode();
  if (!mode) return;
  if (sel.has(id)) sel.delete(id); else sel.add(id);
  if (mode === 'back') {
    const d = S.exchange.deals.find(x => x.rich === me);
    while (d && sel.size > d.k) sel.delete(sel.values().next().value);
  }
  hintI = -1;
  sfx.pop();
  renderHand(mode); renderActs(mode);
});

function selCards() { return [...sel].map(id => S.hand.find(c => c.id === id)).filter(Boolean); }

function renderActs(mode) {
  const play = $('#bPlay'), pass = $('#bPass'), hint = $('#bHint');
  const acts = $('#meActs');
  acts.hidden = !mode;
  if (!mode) return;
  if (mode === 'back') {
    const d = S.exchange.deals.find(x => x.rich === me);
    pass.hidden = true; hint.hidden = true;
    play.disabled = sel.size !== d.k;
    play.textContent = `돌려주기 (${sel.size}/${d.k})`;
    play.classList.remove('warn');
    return;
  }
  pass.hidden = false; hint.hidden = false;
  pass.disabled = !S.field;
  // 낼 게 없으면 패스 단추를 앞세운다
  const none = !!S.field && !DR.legalPlays(S.hand, S.field, ctxNow()).length;
  pass.classList.toggle('gold', none);
  pass.classList.toggle('ghost', !none);
  hint.hidden = none;
  const cards = selCards();
  const it = cards.length ? DR.judge(cards, S.field, ctxNow()) : null;
  play.disabled = !it;
  const foul = it && cards.length === S.hand.length && DR.foulWhy(cards, it, ctxNow().rev, S.cfg);
  play.classList.toggle('warn', !!foul);
  play.textContent = !cards.length ? '내기' : !it ? '낼 수 없음' : foul ? `반칙 마무리! (${foul})` : `내기 · ${playName(cards, it)}`;
}

function playName(cards, it) {
  if (it.type === 'stair') return `계단 ${it.n}장`;
  if (it.rank === 16 && it.n === 1) return '조커';
  const r = rn(it.rank === 16 ? 16 : it.rank);
  return it.n === 1 ? r : `${r} ${['', '', '둘', '셋', '넷', '다섯', '여섯'][it.n] || it.n + '장'}`;
}

$('#bPlay').onclick = () => {
  const mode = myMode();
  if (mode === 'back') { send({ t: 'back', ids: [...sel] }); sel.clear(); return; }
  if (mode !== 'play' || !sel.size) return;
  send({ t: 'play', ids: [...sel] });
  sel.clear();
};
$('#bPass').onclick = () => { if (myMode() === 'play') { send({ t: 'pass' }); sel.clear(); } };
$('#bHint').onclick = () => {
  if (myMode() !== 'play') return;
  const ctx = ctxNow();
  // 조커를 덜 쓰고, 약하고, 많이 터는 것부터. 맨 앞은 봇이 고를 수
  const jk = p => p.cards.filter(c => c.s === 'X').length;
  const list = DR.legalPlays(S.hand, S.field, ctx)
    .sort((a, b) => jk(a) - jk(b) || DR.power(a.it, ctx.rev) - DR.power(b.it, ctx.rev) || b.cards.length - a.cards.length);
  const others = S.players.filter(p => p.id !== me && !p.out).map(p => p.hand);
  const bot = DR.botPlay(S.hand, S.field, ctx, { minOpp: others.length ? Math.min(...others) : 9 });
  if (bot) {
    const key = p => p.cards.map(c => c.id).sort().join();
    const i = list.findIndex(p => key(p) === key(bot));
    if (i > 0) list.unshift(list.splice(i, 1)[0]);
  }
  if (!list.length) { toast('낼 수 있는 카드가 없어요 — 패스하세요'); return; }
  hintI = (hintI + 1) % list.length;
  sel = new Set(list[hintI].cards.map(c => c.id));
  sfx.pop();
  renderHand('play'); renderActs('play');
};

/** 세기 순서 — 약한 것부터 강한 것까지. 혁명(J 백 포함)이면 숫자 쪽이 뒤집히고, 조커는 늘 맨 끝(가장 셈) */
let ladderRev = null;
function renderLadder() {
  const rev = S.rev !== S.jrev;
  const ranks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const order = rev ? ranks.slice().reverse() : ranks;
  const on = new Set();
  if (S.field) {
    const it = S.field.it;
    if (it.type === 'group') on.add(it.rank === 16 ? 16 : it.rank);
    else for (let r = it.lo; r <= it.hi; r++) on.add(r);
  }
  const box = $('#ladder');
  const flip = ladderRev !== null && ladderRev !== rev;
  ladderRev = rev;
  box.className = 'ladder' + (rev ? ' rev' : '') + (flip ? ' flip' : '');
  box.innerHTML = `<span class="lh">약</span>${order.map((r, i) => `<i class="${on.has(r) ? 'on' : ''}" style="--i:${i}">${rn(r)}</i>`).join('')}<span class="lsep">·</span><i class="jk${on.has(16) ? ' on' : ''}" style="--i:13">JOKER</i><span class="lh">강</span>`
    + (rev ? `<b class="lrev">${S.rev ? '혁명 중' : 'J 백'}</b>` : '');
}

function renderBar() {
  $('#gRound').textContent = `${S.round} / ${S.cfg.rounds}판`;
  $('#gRev').hidden = !S.rev;
  $('#gJb').hidden = !S.jrev;
  const lk = $('#gLock');
  lk.hidden = !S.lock;
  if (S.lock) lk.innerHTML = '🔒 ' + S.lock.split('').map(s => sv(s, 'lk ' + (isRed(s) ? 'red' : 'blk'))).join('');
  const sn = $('#gSpecN');
  sn.hidden = !(S.specs && S.specs.length) && !isSpec();
  sn.textContent = isSpec() ? '관전 중' : `관전 ${S.specs ? S.specs.length : 0}명`;
  document.body.classList.toggle('revo', S.rev !== S.jrev);
}

function renderGame(prev) {
  if (!S || (S.phase !== 'playing' && S.phase !== 'over')) return;
  const mode = myMode();
  const key = mode + '|' + S.step + '|' + S.turn + '|' + (S.field ? S.field.cards.map(c => c.id).join() : '') + '|' + S.round;
  if (key !== selKey) {
    selKey = key; sel.clear(); hintI = -1;
    if (prev && mode && (prev.turn !== S.turn || prev.step !== S.step)) sfx.turn();
  }
  if (S.lastTax && S.step !== 'exchange' && lastStep === 'exchange') newTaxRound = S.round;
  lastStep = S.step;
  renderBar();
  renderLadder();
  renderSeats();
  renderMe();
  renderPile();
  renderHand(mode);
  renderActs(mode);
  renderRoundEnd();
  renderLog();
  playFx(prev);
  $('#reacts').hidden = isSpec();
}

/* ── 연출 ── */

let bannerT = 0;
function banner(html, cls = '') {
  const b = $('#banner');
  b.className = 'banner ' + cls;
  b.innerHTML = html;
  b.hidden = false;
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerT);
  bannerT = setTimeout(() => { b.hidden = true; }, 1700);
}

function anchorOf(pid) {
  if (pid === me) return $('#meAv');
  const s = document.querySelector(`[data-seat="${pid}"]`);
  return s ? (s.querySelector('.av') || s) : null;
}

function playFx(prev) {
  const fx = S.fx;
  if (!fx || fx.seq === lastFx) return;
  const first = !lastFx && !prev;
  lastFx = fx.seq;
  if (first) return;
  if (fx.kind === 'tax') { sfx.coin(); return; }
  if (fx.kind !== 'play') return;
  // 낸 카드가 낸 사람 자리에서 날아와 앉는다
  const top = $('#pile .play.top .cards');
  const from = anchorOf(fx.by);
  if (top && from) {
    const a = from.getBoundingClientRect(), b = top.getBoundingClientRect();
    top.style.setProperty('--fx', `${(a.left + a.width / 2) - (b.left + b.width / 2)}px`);
    top.style.setProperty('--fy', `${(a.top + a.height / 2) - (b.top + b.height / 2)}px`);
    top.classList.add('land');
  }
  sfx.card(fx.n);
  if (fx.rev != null) { banner(fx.rev ? '<b>革命</b><span>혁명! 세기가 뒤집혔다</span>' : '<b>反革命</b><span>반혁명! 세기가 돌아왔다</span>', 'rev'); sfx.rev(); }
  else if (fx.s3) { banner('<b>♠3</b><span>스페이드 3 되치기!</span>', 's3'); sfx.cut(); }
  else if (fx.eight) { banner('<b>八切</b><span>8 자르기!</span>', 'eight'); sfx.cut(); }
  else if (fx.jback != null) banner(`<b>J</b><span>J 백! ${fx.jback ? '잠깐 뒤집힌다' : '다시 돌아왔다'}</span>`, 'jb');
  else if (fx.lock) banner(`<b>縛</b><span>문양 묶기 ${fx.lock.split('').map(s => sv(s, 'lk ' + (isRed(s) ? 'red' : 'blk'))).join('')}</span>`, 'lock');
  if (fx.done) {
    const p = playerOf(fx.by);
    if (fx.done === 'foul') { setTimeout(() => banner(`<b>反則</b><span>${esc(nameOf(fx.by))} 반칙 마무리 — ${esc(fx.foulWhy || '')}, 꼴찌로!</span>`, 'foul'), 900); sfx.fall(); }
    else if (p) { const i = placeOf(p); toast(`${nameOf(fx.by)}${josa(nameOf(fx.by), '이', '가')} 손을 다 털었다! ${i != null ? (i + 1) + '등' : ''}`); if (fx.by === me) sfx.win(); }
  }
  if (fx.miyako) setTimeout(() => { banner(`<b>都落</b><span>도시 추락! 지난 판 대부호 ${esc(nameOf(fx.miyako))}, 1등을 놓쳐 바로 대빈민</span>`, 'foul'); sfx.fall(); }, 1100);
}

/* ── 판 결과 ── */

function renderRoundEnd() {
  const ovl = $('#ovl');
  if (S.step !== 'roundEnd' || !S.ranking) { ovl.hidden = true; return; }
  if (!ovl.hidden && ovl.dataset.round === String(S.round)) return;
  ovl.hidden = false;
  ovl.dataset.round = String(S.round);
  const titles = DR.titles(S.players.length);
  const last = S.round >= S.cfg.rounds;
  $('#ovlIn').innerHTML = `<h3>${S.round}판 결과</h3><ol class="rlist">${S.ranking.map((id, i) => {
    const p = playerOf(id); const t = titles[i];
    const how = p.howOut === 'miyako' ? '<small class="how">도시 추락 — 지난 판 대부호가 1등을 놓침</small>' : p.howOut === 'foul' ? `<small class="how">반칙 마무리${p.foulWhy ? ' — ' + esc(p.foulWhy) : ''}</small>` : '';
    return `<li class="${id === me ? 'mine' : ''}"><img src="${faceImg(TITLE_FACE[t])}" alt=""><span class="rt-t t-${TITLE_FACE[t]}">${t}</span><span class="rn"><b>${esc(p.name)}${id === me ? ' (나)' : ''}</b>${how}</span><span class="rp">+${DR.TITLE_PTS[t]} · ${p.score}점</span></li>`;
  }).join('')}</ol><p class="muted small">${last ? '곧 최종 순위가 나와요' : `곧 ${S.round + 1}판 — 세금을 내고 시작해요`}</p>`;
  const myI = S.ranking.indexOf(me);
  if (myI === 0) sfx.win(); else if (myI === S.ranking.length - 1 && myI > 0) sfx.fall();
}

/* ── 지난 수 ── */

function renderLog() {
  const ol = $('#logList');
  const rows = (S.log || []).map(e => {
    if (e.k === 'play') {
      const tags = [e.rev && '혁명', e.eight && '8 자르기', e.s3 && '♠3 되치기', e.lock && '묶기', e.jback && 'J 백'].filter(Boolean).join(' · ');
      return `<li><b>${esc(nameOf(e.by))}</b> <span class="lc">${e.cards.map(c => `<span class="${isRed(c.s) ? 'r' : ''}">${DR.cardName(c)}</span>`).join(' ')}</span>${tags ? ` <em>${tags}</em>` : ''}</li>`;
    }
    if (e.k === 'pass') return `<li class="dim">${esc(nameOf(e.by))} 패스</li>`;
    if (e.k === 'clear') return `<li class="sep">— 바닥 치움${e.why === 'eight' ? ' (8 자르기)' : e.why === 's3' ? ' (♠3)' : ''} —</li>`;
    if (e.k === 'round') return `<li class="sep">${e.round}판 시작</li>`;
    if (e.k === 'tax') return '<li class="sep">세금 — 카드 바꿈</li>';
    if (e.k === 'miyako') return `<li class="bad">${esc(nameOf(e.by))} 도시 추락</li>`;
    if (e.k === 'foul') return `<li class="bad">${esc(nameOf(e.by))} 반칙 마무리${e.why ? ` — ${esc(e.why)}` : ''}</li>`;
    if (e.k === 'end') return `<li class="sep">${e.round}판 끝</li>`;
    return '';
  });
  ol.innerHTML = rows.join('') || '<li class="dim">아직 아무도 안 냈어요</li>';
}
$('#bLog').onclick = () => { $('#logBox').hidden = !$('#logBox').hidden; };
$('#logX').onclick = () => { $('#logBox').hidden = true; };

/* ── 표정 ── */

function floatEmo(pid, e) {
  const el = anchorOf(pid) || $('#pile');
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float-emo';
  d.textContent = EMO[e] || '❓';
  d.style.left = `${r.left + r.width / 2}px`;
  d.style.top = `${r.top - 6}px`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1900);
}
$('#reacts').addEventListener('click', e => {
  const b = e.target.closest('[data-e]');
  if (b) send({ t: 'react', e: Number(b.dataset.e) });
});

/* ── 끝 ── */

function renderOver() {
  const spec = isSpec();
  const ranked = S.players.slice().sort((a, b) => b.score - a.score || countTop(b) - countTop(a));
  const top = ranked[0];
  $('#oArt').src = faceImg('king');
  $('#oTitle').textContent = top && top.id === me ? '내가 진짜 대부호!' : `${top ? top.name : ''} 최종 우승`;
  $('#oSub').textContent = `${S.cfg.rounds}판 계급 점수 합계`;
  $('#oFinal').innerHTML = ranked.map((p, i) => `
    <li class="${p.id === me ? 'mine' : ''}"><span class="no">${i + 1}</span><span class="av"><img src="${faceImg(TITLE_FACE[p.hist[p.hist.length - 1]] || 'mid')}" alt=""></span>
      <div><b>${esc(p.name)}${p.id === me ? ' (나)' : ''}</b><div class="hist">${p.hist.map(t => `<span class="ttl t-${TITLE_FACE[t]}">${t}</span>`).join('')}</div></div>
      <span class="res">${p.score}점</span></li>`).join('');
  $('#bAgain').classList.toggle('hidden', spec || S.hostId !== me);
  $('#oWait').textContent = !spec && S.hostId !== me ? '방장이 한 번 더 하기를 기다리는 중' : '';
  $('#oWait').hidden = spec || S.hostId === me;
  $('#oSpecNote').hidden = !spec;
}
const countTop = p => p.hist.filter(t => t === '대부호').length;

/* ─────────────────────────── 타이머 ─────────────────────────── */

function tick() {
  requestAnimationFrame(tick);
  if (!S || S.phase !== 'playing') return;
  const xl = document.querySelector('.xleft');
  if (xl) xl.textContent = Math.max(0, Math.ceil((Number(xl.dataset.ends) - (Date.now() + skew)) / 1000)) + '초';
  if (!S.turnEndsAt) return;
  const total = S.cfg.turnLimit || 1;
  const left = Math.max(0, S.turnEndsAt - (Date.now() + skew));
  const p = Math.min(1, left / total);
  for (const fg of document.querySelectorAll('.ring .fg')) {
    fg.style.strokeDashoffset = String(RING_C * (1 - p));
    fg.classList.toggle('warn', p <= .5 && p > .2);
    fg.classList.toggle('hot', p <= .2);
  }
}
requestAnimationFrame(tick);

let rsT = 0;
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (S && S.phase === 'playing') renderGame(); }, 120); });

/* ─────────────────────────── 조작 ─────────────────────────── */

const myName = () => ($('#gName').value || '').trim().slice(0, 12);

$('#bBegin').onclick = () => { show('setup'); setTimeout(() => $('#gName').focus(), 60); ac(); };
$('#bBack').onclick = () => show('title');

let entering = 0;
function enter(msg) {
  if (Date.now() - entering < 4000) return;
  entering = Date.now();
  store.removeItem('code'); store.removeItem('token');
  ls.set('name', myName());
  connect(() => send(msg));
}
$('#bCreate').onclick = () => enter({ t: 'create', name: myName(), priv: $('#gPriv').checked, spec: $('#gSpec').checked });

function doJoin() {
  const code = ($('#gCode').value || '').trim().toUpperCase();
  if (code.length !== 4) return toast('네 글자 코드를 넣어 주세요.');
  enter({ t: 'join', code, name: myName() });
}
$('#bJoin').onclick = doJoin;

let watching = false;
function watchRooms(on) {
  watching = on;
  if (on) connect(() => { if (watching && !store.getItem('code')) send({ t: 'rooms' }); });
  else send({ t: 'unwatch' });
}
document.addEventListener('visibilitychange', () => {
  if (!watching || resting || store.getItem('code') || Date.now() - entering < 4000) return;
  if (document.hidden) {
    if (!ws) return;
    const s = ws; ws = null;
    s.onopen = s.onmessage = s.onclose = null;
    clearInterval(pingT);
    try { s.close(); } catch (_) {}
  } else watchRooms(true);
});

const ROOM_STATE = { wait: '자리 있음', full: '가득 참', playing: '게임 중' };
function roomRow(r) {
  if (r.priv) return { off: true, spec: false, label: ROOM_STATE[r.state] || '' };
  if (r.state === 'wait') return { off: false, spec: false, label: ROOM_STATE.wait };
  if (r.spec !== false) {
    if (r.state === 'playing') return { off: false, spec: true, label: r.n < r.max ? '게임 중 · 관전' : '관전만' };
    if (r.state === 'full') return { off: false, spec: true, label: '가득 참 · 관전' };
  }
  return { off: true, spec: false, label: ROOM_STATE[r.state] || '' };
}
function renderRooms(list) {
  const open = list.filter(r => r.state === 'wait' && !r.priv).length;
  $('#roomCount').textContent = list.length ? `${open}곳` : '';
  $('#roomEmpty').hidden = list.length > 0;
  $('#roomList').innerHTML = list.map(r => {
    const v = roomRow(r);
    return `<li><button class="room-row" ${r.priv ? '' : `data-code="${esc(r.code)}"`}${v.off ? ' disabled' : ''}>
      <span class="rr-av"><img src="${faceImg(r.face || 'king')}" alt=""></span>
      <span class="rr-main"><span class="rr-host">${esc(r.host || '이름 없음')}의 판</span>
        <span class="rr-meta">${r.priv ? '비공개' : `<span class="rr-code">${esc(r.code)}</span>`} · ${r.rounds}판 · ${r.n}/${r.max}명${r.watching ? ` · 관전 ${r.watching}` : ''}</span></span>
      <span class="rr-st ${v.spec ? 'spec' : esc(r.state)}">${v.label}</span>
    </button></li>`;
  }).join('');
}
$('#roomList').addEventListener('click', e => {
  const b = e.target.closest('.room-row');
  if (!b || b.disabled || !b.dataset.code) return;
  $('#gCode').value = b.dataset.code;
  doJoin();
});
$('#gCode').onkeydown = e => { if (e.key === 'Enter') doJoin(); };
$('#gName').onkeydown = e => { if (e.key === 'Enter') $('#bCreate').click(); };

$('#bCopy').onclick = async () => {
  const url = `${location.origin}${location.pathname}?r=${S.code}`;
  try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요'); }
  catch (_) { toast(url); }
};

$('#tPriv').onclick = () => send({ t: 'cfg', priv: S.cfg.priv !== true });
$('#tSpec').onclick = () => send({ t: 'cfg', spec: S.cfg.spec === false });
$$('#segTime button').forEach(b => { b.onclick = () => send({ t: 'cfg', turnLimit: Number(b.dataset.ms) }); });
$$('#segRounds button').forEach(b => { b.onclick = () => send({ t: 'cfg', rounds: Number(b.dataset.n) }); });
$$('#segJoker button').forEach(b => { b.onclick = () => send({ t: 'cfg', jokers: Number(b.dataset.j) }); });
$('#bBot').onclick = () => send({ t: 'addBot' });
$('#bStart').onclick = () => { send({ t: 'start' }); ac(); };
$('#bAgain').onclick = () => send({ t: 'again' });

const leave = () => {
  const code = store.getItem('code'), token = store.getItem('token');
  store.removeItem('code'); store.removeItem('token');
  specCtx = null; specId = null; specRejoin = false;
  resting = false; wokeUp = false;
  $('#toast').classList.remove('on');
  if (ws && ws.readyState === 1) send({ t: 'leave' });
  else if (code && token) {
    leaving = true;
    connect(() => { send({ t: 'resume', code, token }); send({ t: 'leave' }); });
  }
  history.replaceState(null, '', location.pathname);
  S = null;
  show('title');
};
$('#bLeave1').onclick = leave;
$('#bLeave2').onclick = () => { if (isSpec() || confirm('정말 나갈까요? 내 자리는 봇이 이어받아요.')) leave(); };
$('#bLeave3').onclick = leave;

/* 규칙 */
const openHelp = () => $('#help').classList.remove('hidden');
$$('[data-help]').forEach(b => b.onclick = openHelp);
$('#bHelpX').onclick = () => $('#help').classList.add('hidden');
$('#help').onclick = e => { if (e.target.id === 'help') $('#help').classList.add('hidden'); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { $('#help').classList.add('hidden'); $('#logBox').hidden = true; if (!$('#chat').hidden) chatOpen(false); }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === '?') openHelp();
  if (screen === 'game' && myMode() === 'play') {
    if (e.key === 'Enter' && !$('#bPlay').disabled) $('#bPlay').click();
    else if (e.key === 'p' || e.key === 'P') $('#bPass').click();
  }
});
$$('#helpTabs button').forEach(b => {
  b.onclick = () => {
    $$('#helpTabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.tabpage').forEach(p => p.classList.toggle('on', p.dataset.page === b.dataset.tab));
  };
});

/* ─────────────────────────── 시작 ─────────────────────────── */

$('#gName').value = ls.get('name') || '';
const invited = new URLSearchParams(location.search).get('r');
if (invited) $('#gCode').value = invited.toUpperCase().slice(0, 4);

if (store.getItem('code') && store.getItem('token')) {
  connect(() => send({ t: 'resume', code: store.getItem('code'), token: store.getItem('token') }));
} else if (invited) {
  show('setup');
} else {
  show('title');
}
