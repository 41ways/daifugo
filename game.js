'use strict';
/**
 * 대부호 — 판 진행과 방 관리.
 *  - 손패 · 바닥 · 차례 · 혁명 · 카드 바꾸기 · 타이머 · 봇은 전부 서버가 쥔다(권위 서버).
 *    클라이언트는 "이 카드들을 낸다 / 넘긴다 / 이 카드를 돌려준다" 만 보낸다.
 *  - 남의 손패는 장수만 내려간다.
 *  - 통신 방식은 모른다. 소켓은 send(문자열) · close() · readyState 만 있으면 된다.
 *    Node 서버(server.js)와 Cloudflare(worker.js)가 이 파일을 똑같이 쓴다. (바퀴벌레 포커와 같은 짜임)
 */
const R = require('./public/rules.js');

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const MAX_SPECS = 10;
const TURN_LIMITS = [15000, 30000, 60000, 0];   // 0 = 무제한
const ROUND_CHOICES = [1, 3, 5, 8];
const FAST = typeof process !== 'undefined' && !!process.env && process.env.DAIFUGO_FAST === '1';
const CLEAR_MS = FAST ? 20 : 1100;          // 바닥이 치워지는 걸 보여 주는 시간
const ROUND_END_MS = FAST ? 30 : 5200;      // 한 판 결과를 보여 주는 시간
const EXCHANGE_MS = FAST ? 300 : 25000;     // 카드 돌려주기 제한 시간
const DC_GRACE = FAST ? 200 : 6000;         // 접속 끊긴 사람 차례를 대신 두기까지
const LOBBY_GRACE = FAST ? 300 : 20_000;
const LOG_MAX = 40;

const BOT_NAMES = ['돈자루', '주판알', '엽전이', '쌀가마', '짚신이', '누룽지'];
const BOT_THINK = FAST ? [1, 3] : [900, 2000];

/* ─────────────────────────── 유틸 ─────────────────────────── */

const pick = a => a[Math.floor(Math.random() * a.length)];
const rnd = (min, max) => min + Math.random() * (max - min);
const clean = (s, max) => String(s == null ? '' : s)
  .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);
const token = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)),
  b => b.toString(16).padStart(2, '0')).join('');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─────────────────────────── 방 ─────────────────────────── */

const rooms = new Map();

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 4 }, () => pick(alphabet.split(''))).join('');
  while (rooms.has(code));
  return code;
}

function createRoom({ priv = false, spec = true } = {}) {
  const room = {
    code: makeCode(),
    phase: 'lobby',            // lobby | playing | over
    hostId: null,
    players: [],
    specs: [],
    nextId: 1,
    cfg: Object.assign({ turnLimit: 30000, rounds: 5, priv: !!priv, spec: spec !== false }, R.DEFAULT_RULES),

    round: 0,
    step: null,                // exchange | play | clear | roundEnd
    turn: null,                // 낼 차례인 사람
    field: null,               // 바닥 { cards, it, by }
    lastBy: null,              // 바닥에 마지막으로 낸 사람
    passes: 0,                 // 마지막으로 낸 뒤 이어진 넘기기 수
    passed: [],                // 이번 바닥에서 넘긴 사람들 (화면 표시용)
    rev: false,                // 혁명
    jrev: false,               // J 백 (바닥이 치워지면 풀린다)
    lock: null,                // 묶인 무늬
    order: [],                 // 이번 판 등수 — 위에서부터 (끝난 사람)
    bottom: [],                // 아래에서부터 (반칙 · 도시 추락)
    prevTitles: {},            // 지난 판 계급 { id: '대부호' … }
    exchange: null,            // { deals: [{rich, poor, k, got:[카드], back:null|[id]}], endsAt }
    hidden: 0,                 // 2인 — 덮어 둔 장수
    log: [],                   // 지난 수 (화면 기록 칸)
    fx: null, fxSeq: 0,        // 방금 일어난 일 (화면 연출용)
    turnEndsAt: 0,
    gameNo: 0,

    timers: { turn: null, bot: null, dc: null, step: null, host: null, ex: null },
    lastActive: Date.now(),
    madeAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function freeFace(room) {
  const used = new Set(room.players.map(p => p.face));
  const faces = ['king', 'rich', 'mid', 'poor', 'beggar'];
  return faces.find(k => !used.has(k)) || pick(faces);
}

function addPlayer(room, { name, bot }) {
  const p = {
    id: room.nextId++,
    token: token(),
    name: name || `플레이어 ${room.nextId - 1}`,
    bot: !!bot,
    ws: null,
    connected: !!bot,
    hand: [],
    score: 0,
    hist: [],                 // 판마다 계급
    out: false,               // 이번 판 끝남
    lastChat: 0, lastReact: 0,
  };
  room.players.push(p);
  if (!p.bot && room.hostId == null) room.hostId = p.id;
  return p;
}

const playerOf = (room, id) => room.players.find(p => p.id === id) || null;

function pickHost(room) {
  const next = room.players.find(p => !p.bot && p.connected) || room.players.find(p => !p.bot);
  room.hostId = next ? next.id : null;
}

/** 대기실에서 자리를 뺀다. 판 중에는 빼지 않고 봇이 이어받는다. */
function removePlayer(room, id) {
  const i = room.players.findIndex(p => p.id === id);
  if (i < 0) return;
  const p = room.players[i];
  clearTimeout(p.leaveT);
  if (room.phase === 'playing') {
    p.bot = true; p.ws = null; p.connected = true; p.stood = true;
    p.name = p.name.replace(/ \(봇\)$/, '') + ' (봇)';
    if (room.hostId === p.id) pickHost(room);
    nudge(room);
    if (room.step === 'exchange') botExchange(room);
  } else {
    room.players.splice(i, 1);
    if (room.hostId === p.id) pickHost(room);
  }
  listChanged();
  seatSpecs(room);
}

/* ─────────────────────────── 관전자 ─────────────────────────── */

const specOf = (room, ws) => room.specs.find(s => s.ws === ws) || null;

function addSpec(room, ws, name) {
  watchers.delete(ws);
  const sp = { id: room.nextId++, name, ws, lastChat: 0 };
  room.specs.push(sp);
  ws.roomCode = room.code; ws.playerId = null; ws.specId = sp.id;
  send(ws, { t: 'welcome', role: 'spec', you: null, specId: sp.id, code: room.code });
  pushState(room);
  listChanged();
  return sp;
}

function removeSpec(room, ws) {
  const i = room.specs.findIndex(s => s.ws === ws);
  if (i >= 0) room.specs.splice(i, 1);
  ws.specId = null;
  return i >= 0;
}

function seatSpecs(room) {
  if (room.phase !== 'lobby') return;
  let moved = false;
  while (room.specs.length && room.players.length < MAX_PLAYERS) {
    const sp = room.specs.shift();
    if (!sp.ws || sp.ws.readyState !== 1) continue;
    const p = addPlayer(room, { name: sp.name });
    p.face = freeFace(room);
    sp.ws.specId = null;
    attach(room, p, sp.ws, { seated: true });
    ev(room, { kind: 'joined', by: p.id });
    moved = true;
  }
  if (moved) listChanged();
}

function dropRoom(room) {
  clearAll(room);
  for (const sp of room.specs) {
    send(sp.ws, { t: 'err', msg: '방이 사라졌어요.', fatal: true });
    sp.ws.roomCode = null; sp.ws.specId = null;
    try { sp.ws.close(1000, 'room gone'); } catch (_) {}
  }
  room.specs = [];
  rooms.delete(room.code);
  listChanged();
}

/* ─────────────────────────── 판 ─────────────────────────── */

function clearTurn(room) {
  clearTimeout(room.timers.turn); room.timers.turn = null;
  clearTimeout(room.timers.bot); room.timers.bot = null;
  clearTimeout(room.timers.dc); room.timers.dc = null;
}
function clearAll(room) {
  clearTurn(room);
  clearTimeout(room.timers.step); room.timers.step = null;
  clearTimeout(room.timers.ex); room.timers.ex = null;
}

const active = room => room.players.filter(p => !p.out);
const ctxOf = room => ({ rev: room.rev !== room.jrev, lock: room.lock, rules: room.cfg });

/** id 다음 자리부터 돌며 아직 안 끝난 사람 */
function nextActive(room, id) {
  const ps = room.players;
  const i = ps.findIndex(p => p.id === id);
  for (let k = 1; k <= ps.length; k++) {
    const q = ps[(i + k) % ps.length];
    if (!q.out) return q;
  }
  return null;
}

function actorOf(room) {
  if (room.phase !== 'playing' || room.step !== 'play') return null;
  return playerOf(room, room.turn);
}

function pushLog(room, e) {
  room.log.unshift(e);
  if (room.log.length > LOG_MAX) room.log.length = LOG_MAX;
}

/** 할 사람이 바뀔 때마다 — 제한 시간, 봇, 끊긴 사람 대신 두기를 다시 건다 */
function nudge(room) {
  clearTurn(room);
  const p = actorOf(room);
  if (!p) { pushState(room); return; }
  room.turnEndsAt = room.cfg.turnLimit ? Date.now() + room.cfg.turnLimit : 0;
  pushState(room);

  if (p.bot) {
    room.timers.bot = setTimeout(() => { if (actorOf(room) === p) autoAct(room, p); }, rnd(...BOT_THINK));
    return;
  }
  if (room.turnEndsAt) {
    room.timers.turn = setTimeout(() => {
      if (actorOf(room) === p) { ev(room, { kind: 'timeout', by: p.id }); autoAct(room, p); }
    }, Math.max(0, room.turnEndsAt - Date.now()) + 250);
  }
  if (!p.connected) {
    room.timers.dc = setTimeout(() => { if (actorOf(room) === p && !p.connected) autoAct(room, p); }, DC_GRACE);
  }
}

function startGame(room) {
  clearAll(room);
  room.phase = 'playing';
  room.gameNo++;
  room.round = 0;
  room.prevTitles = {}; room.prevRank = null; room.exchangeDone = null;
  for (const p of room.players) { p.score = 0; p.hist = []; }
  listChanged();
  startRound(room);
}

function startRound(room) {
  clearAll(room);
  const n = room.players.length;
  room.round++;
  room.rev = false; room.jrev = false; room.lock = null;
  room.field = null; room.lastBy = null; room.passes = 0; room.passed = [];
  room.order = []; room.bottom = [];
  room.log = [];
  room.fx = null;
  const { hands, hidden } = R.deal(shuffle(R.makeDeck(n, room.cfg.jokers)), n);
  // 남는 장은 자리 순서와 상관없이 고르게 — 앞자리가 늘 한 장 더 받지 않게 섞어서 나눈다
  const seats = shuffle(room.players.slice());
  seats.forEach((p, i) => { p.hand = R.sortCards(hands[i], false); p.out = false; p.title = null; p.foulWhy = null; p.howOut = null; });
  room.hidden = hidden.length;
  pushLog(room, { k: 'round', round: room.round });

  const prev = room.prevTitles;
  const hasPrev = room.round > 1 && Object.keys(prev).length === n;
  if (hasPrev && n >= 2) return startExchange(room);
  // 첫 판은 ♦3 을 가진 사람부터 (2인이라 ♦3 이 덮였으면 아무나)
  const d3 = room.players.find(p => p.hand.some(c => c.s === 'D' && c.r === 3));
  beginPlay(room, (d3 || pick(room.players)).id);
}

/** 카드 바꾸기 — 아랫사람은 가장 센 카드를 바로 바치고, 윗사람은 고른 카드를 돌려준다 */
function startExchange(room) {
  const n = room.players.length;
  const byTitle = rank => room.players.filter(p => room.prevRank && room.prevRank[p.id] === rank)[0];
  const deals = [];
  for (const [hi, lo, k] of R.exchangePairs(n)) {
    const rich = byTitle(hi), poor = byTitle(lo);
    if (!rich || !poor) continue;
    const got = R.strongest(poor.hand, k);
    poor.hand = poor.hand.filter(c => !got.includes(c));
    rich.hand = R.sortCards(rich.hand.concat(got), false);
    deals.push({ rich: rich.id, poor: poor.id, k, got: got.map(c => c.id), gotCards: got.map(c => ({ id: c.id, s: c.s, r: c.r })), back: null });
  }
  room.step = 'exchange';
  room.exchange = { deals, endsAt: Date.now() + EXCHANGE_MS };
  room.fxSeq++;
  room.fx = { seq: room.fxSeq, kind: 'tax', deals: deals.map(d => ({ rich: d.rich, poor: d.poor, k: d.k })) };
  pushState(room);
  room.timers.ex = setTimeout(() => finishExchange(room, true), EXCHANGE_MS + 300);
  botExchange(room);
}

function botExchange(room) {
  if (room.step !== 'exchange') return;
  for (const d of room.exchange.deals) {
    const p = playerOf(room, d.rich);
    if (d.back || !p || !(p.bot || !p.connected)) continue;
    setTimeout(() => {
      if (room.step !== 'exchange' || d.back) return;
      giveBack(room, p, R.botGiveBack(p.hand, d.k).map(c => c.id));
    }, p.bot ? (FAST ? 5 : rnd(800, 1800)) : DC_GRACE);
  }
}

/** 윗사람이 돌려줄 카드를 골랐다 */
function giveBack(room, p, ids) {
  if (room.step !== 'exchange') return;
  const d = room.exchange.deals.find(x => x.rich === p.id && !x.back);
  if (!d || !Array.isArray(ids)) return;
  ids = [...new Set(ids.map(x => x | 0))];
  if (ids.length !== d.k || ids.some(id => !p.hand.some(c => c.id === id))) {
    return send(p.ws, { t: 'err', msg: `돌려줄 카드 ${d.k}장을 골라 주세요.` });
  }
  const poor = playerOf(room, d.poor);
  const back = p.hand.filter(c => ids.includes(c.id));
  p.hand = p.hand.filter(c => !ids.includes(c.id));
  poor.hand = R.sortCards(poor.hand.concat(back), false);
  d.back = ids;
  pushState(room);
  // 다 돌려줬으면 잠깐 보여 주고 시작 — 누가 누구에게 바쳤는지 읽을 틈
  if (room.exchange.deals.every(x => x.back)) {
    clearTimeout(room.timers.ex);
    room.timers.ex = setTimeout(() => finishExchange(room, false), FAST ? 0 : 1800);
  }
}

function finishExchange(room, timeout) {
  if (room.step !== 'exchange') return;
  if (timeout) {
    for (const d of room.exchange.deals) if (!d.back) giveBack(room, playerOf(room, d.rich), R.botGiveBack(playerOf(room, d.rich).hand, d.k).map(c => c.id));
    if (room.step !== 'exchange') return;
  }
  clearTimeout(room.timers.ex); room.timers.ex = null;
  pushLog(room, { k: 'tax', deals: room.exchange.deals.map(d => ({ rich: d.rich, poor: d.poor, k: d.k })) });
  room.exchangeDone = room.exchange;   // 화면에서 무엇을 주고받았는지 잠깐 보여 준다
  room.exchange = null;
  // 대빈민이 먼저 낸다
  const n = room.players.length;
  const beggar = room.players.find(p => room.prevRank[p.id] === n - 1);
  beginPlay(room, (beggar || room.players[0]).id);
}

function beginPlay(room, firstId) {
  room.step = 'play';
  room.turn = firstId;
  listChanged();
  nudge(room);
}

/** 바닥을 치운다 — 잠깐 보여 준 뒤 leader 가 새로 낸다 */
function clearField(room, leaderId, why) {
  clearTurn(room);
  room.step = 'clear';
  room.turnEndsAt = 0;
  room.clearWhy = why;
  pushState(room);
  room.timers.step = setTimeout(() => {
    room.timers.step = null;
    if (room.phase !== 'playing') return;
    room.field = null; room.lastBy = null; room.passes = 0; room.passed = [];
    room.lock = null; room.jrev = false; room.clearWhy = null;
    pushLog(room, { k: 'clear', why });
    let lead = playerOf(room, leaderId);
    if (!lead || lead.out) lead = nextActive(room, leaderId);
    room.step = 'play';
    room.turn = lead ? lead.id : null;
    nudge(room);
  }, CLEAR_MS);
}

/** p 가 손을 다 털었다 (또는 도시 추락 · 반칙으로 밀려났다) */
function finishPlayer(room, p, how) {
  p.out = true;
  if (how === 'win') room.order.push(p.id);
  else room.bottom.push(p.id);     // 먼저 밀려난 사람이 더 아래
  p.howOut = how;
}

/** 이번 판이 끝났나 — 남은 사람이 한 명 이하 */
function checkRoundEnd(room) {
  const left = active(room);
  if (left.length > 1) return false;
  for (const p of left) { p.out = true; room.order.push(p.id); p.howOut = 'last'; }
  endRound(room);
  return true;
}

function endRound(room) {
  clearTurn(room);
  const n = room.players.length;
  const ranking = room.order.concat(room.bottom.slice().reverse());
  const titles = R.titles(n);
  room.prevRank = {};
  room.prevTitles = {};
  ranking.forEach((id, i) => {
    const p = playerOf(room, id);
    p.title = titles[i];
    p.score += R.TITLE_PTS[titles[i]] || 0;
    p.hist.push(titles[i]);
    room.prevRank[id] = i;
    room.prevTitles[id] = titles[i];
  });
  room.ranking = ranking;
  room.step = 'roundEnd';
  room.turn = null;
  room.turnEndsAt = 0;
  pushLog(room, { k: 'end', round: room.round });
  room.roundEndsAt = Date.now() + ROUND_END_MS;
  pushState(room);
  room.timers.step = setTimeout(() => {
    room.timers.step = null;
    if (room.phase !== 'playing') return;
    if (room.round >= room.cfg.rounds) return finishGame(room);
    room.exchangeDone = null;
    startRound(room);
  }, ROUND_END_MS);
}

function finishGame(room) {
  clearAll(room);
  room.phase = 'over';
  room.step = null;
  room.turnEndsAt = 0;
  pushState(room);
  listChanged();
}

/** 카드를 낸다 */
function play(room, p, ids) {
  if (actorOf(room) !== p || !Array.isArray(ids) || !ids.length || ids.length > 16) return;
  ids = [...new Set(ids.map(x => x | 0))];
  const cards = ids.map(id => p.hand.find(c => c.id === id));
  if (cards.some(c => !c)) return;
  const ctx = ctxOf(room);
  const it = R.judge(cards, room.field, ctx);
  if (!it) return send(p.ws, { t: 'err', msg: room.field ? '바닥보다 센 같은 꼴로 내야 해요.' : '낼 수 없는 꼴이에요.' });
  clearTurn(room);

  const ef = R.effects(cards, it, room.field, room.cfg);
  const foulWhy = cards.length === p.hand.length ? R.foulWhy(cards, it, ctx.rev, room.cfg) : null;
  const foul = !!foulWhy;
  p.hand = p.hand.filter(c => !ids.includes(c.id));
  room.field = { cards: R.sortCards(cards, false).map(c => ({ id: c.id, s: c.s, r: c.r })), it, by: p.id };
  room.lastBy = p.id;
  room.passes = 0; room.passed = [];
  if (ef.lock && !room.lock) room.lock = ef.lock;
  if (ef.revolution) room.rev = !room.rev;
  if (ef.jback) room.jrev = !room.jrev;

  room.fxSeq++;
  room.fx = { seq: room.fxSeq, kind: 'play', by: p.id, n: cards.length, rev: ef.revolution ? room.rev : null, eight: ef.eight, s3: ef.s3, lock: ef.lock && room.lock === ef.lock ? ef.lock : null, jback: ef.jback ? room.jrev : null, foul, foulWhy };
  pushLog(room, { k: 'play', by: p.id, cards: room.field.cards, rev: ef.revolution, eight: ef.eight, s3: ef.s3, lock: !!(ef.lock), jback: ef.jback });

  // 손을 다 털었다
  let miyakoId = null;
  if (!p.hand.length) {
    finishPlayer(room, p, foul ? 'foul' : 'win');
    p.foulWhy = foulWhy;
    room.fx.done = foul ? 'foul' : 'win';
    // 도시 추락 — 지난 판 대부호가 아닌 사람이 처음으로 1등을 하면, 지난 판 대부호는 바로 꼴찌
    if (!foul && room.cfg.miyako && room.order.length === 1 && room.round > 1) {
      const king = room.players.find(q => room.prevRank && room.prevRank[q.id] === 0);
      if (king && king.id !== p.id && !king.out && room.players.length > 2) {
        finishPlayer(room, king, 'miyako');
        miyakoId = king.id;
        room.fx.miyako = king.id;
        pushLog(room, { k: 'miyako', by: king.id });
      }
    }
    if (foul) pushLog(room, { k: 'foul', by: p.id, why: foulWhy });
    if (checkRoundEnd(room)) return;
  }

  if (ef.eight || ef.s3) return clearField(room, p.id, ef.eight ? 'eight' : 's3');
  const nx = nextActive(room, p.id);
  room.turn = nx ? nx.id : null;
  // 낸 사람 말고 아무도 안 남았으면(다 끝남) 이미 판이 끝났다. 남은 사람이 한 명이면 그가 새로 낸다
  nudge(room);
  void miyakoId;
}

/** 넘긴다 */
function pass(room, p) {
  if (actorOf(room) !== p) return;
  if (!room.field) return send(p.ws, { t: 'err', msg: '새로 낼 차례에는 넘길 수 없어요.' });
  clearTurn(room);
  room.passes++;
  room.passed.push(p.id);
  pushLog(room, { k: 'pass', by: p.id });
  const lastP = playerOf(room, room.lastBy);
  const others = active(room).length - (lastP && !lastP.out ? 1 : 0);
  if (room.passes >= others) {
    // 모두 넘겼다 — 마지막으로 낸 사람이 새로 낸다(이미 끝났으면 그 다음 사람)
    return clearField(room, room.lastBy, 'pass');
  }
  const nx = nextActive(room, p.id);
  room.turn = nx ? nx.id : null;
  nudge(room);
}

/* ─────────────────────────── 봇 · 대신 두기 ─────────────────────────── */

function autoAct(room, p) {
  if (actorOf(room) !== p) return;
  const others = room.players.filter(q => q !== p && !q.out).map(q => q.hand.length);
  const choice = R.botPlay(p.hand, room.field, ctxOf(room), { minOpp: others.length ? Math.min(...others) : 9 });
  if (choice) return play(room, p, choice.cards.map(c => c.id));
  if (room.field) return pass(room, p);
  // 새로 낼 차례인데 고르지 못했다 — 가장 약한 한 장
  const c = R.sortCards(p.hand, ctxOf(room).rev)[0];
  if (c) play(room, p, [c.id]);
}

/* ─────────────────────────── 통신 ─────────────────────────── */

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_) {}
  }
}

function stateFor(room, me) {
  const ex = room.exchange;
  return {
    t: 'state',
    code: room.code,
    phase: room.phase,
    step: room.step,
    hostId: room.hostId,
    cfg: room.cfg,
    max: MAX_PLAYERS,
    min: MIN_PLAYERS,
    gameNo: room.gameNo,
    round: room.round,
    turn: room.turn,
    turnEndsAt: room.turnEndsAt,
    now: Date.now(),
    you: me ? me.id : null,
    role: me ? 'player' : 'spec',
    specs: room.specs.map(s => s.name),
    hand: me ? me.hand.map(c => ({ id: c.id, s: c.s, r: c.r })) : [],
    field: room.field,
    lastBy: room.lastBy,
    passed: room.passed,
    rev: room.rev, jrev: room.jrev, lock: room.lock,
    clearWhy: room.clearWhy || null,
    hidden: room.hidden,
    order: room.order, bottom: room.bottom,
    ranking: room.step === 'roundEnd' || room.phase === 'over' ? room.ranking : null,
    roundEndsAt: room.step === 'roundEnd' ? room.roundEndsAt : 0,
    // 카드 바꾸기 — 내가 낀 거래만 카드가 보인다
    exchange: ex ? {
      endsAt: ex.endsAt,
      deals: ex.deals.map(d => ({
        rich: d.rich, poor: d.poor, k: d.k, done: !!d.back,
        got: me && (me.id === d.rich || me.id === d.poor) ? d.gotCards : null,
      })),
    } : null,
    lastTax: room.exchangeDone && me ? room.exchangeDone.deals
      .filter(d => d.rich === me.id || d.poor === me.id)
      .map(d => ({ rich: d.rich, poor: d.poor, got: d.got, back: d.back })) : null,
    prevTitles: room.prevTitles,
    fx: room.fx,
    log: room.log,
    players: room.players.map(p => ({
      id: p.id, name: p.name, bot: p.bot, connected: p.connected, face: p.face,
      hand: p.hand.length, out: p.out, howOut: p.howOut || null, foulWhy: p.foulWhy || null, title: p.title || null,
      score: p.score, hist: p.hist,
    })),
  };
}

function pushState(room) {
  for (const p of room.players) if (!p.bot) send(p.ws, stateFor(room, p));
  if (room.specs.length) {
    const view = stateFor(room, null);
    for (const sp of room.specs) send(sp.ws, view);
  }
}
function broadcast(room, obj) {
  for (const p of room.players) if (!p.bot) send(p.ws, obj);
  for (const sp of room.specs) send(sp.ws, obj);
}
const ev = (room, obj) => broadcast(room, Object.assign({ t: 'ev' }, obj));

/* ─────────────────────────── 열린 방 목록 ─────────────────────────── */

const watchers = new Set();
let listT = null;

function listChanged() {
  if (listT || !watchers.size) return;
  listT = setTimeout(() => { listT = null; pushList(); }, 300);
}

function roomList() {
  const rs = [];
  for (const r of rooms.values()) {
    if (!r.players.some(p => !p.bot && p.connected)) continue;
    const state = r.phase !== 'lobby' ? 'playing' : r.players.length >= MAX_PLAYERS ? 'full' : 'wait';
    rs.push({ r, state });
  }
  const open = x => (x.state === 'wait' && !x.r.cfg.priv ? 0 : 1);
  rs.sort((a, b) => open(a) - open(b) || b.r.madeAt - a.r.madeAt);
  const list = rs.slice(0, 20).map(({ r, state }) => {
    const host = playerOf(r, r.hostId);
    const e = { rounds: r.cfg.rounds, host: host ? host.name : '', face: host ? host.face : 'king', n: r.players.length, max: MAX_PLAYERS, state, spec: r.cfg.spec, watching: r.specs.length };
    if (r.cfg.priv) { e.priv = true; return e; }
    return Object.assign({ code: r.code }, e);
  });
  return { t: 'rooms', list };
}

function pushList() {
  if (!watchers.size) return;
  const text = JSON.stringify(roomList());
  for (const ws of watchers) {
    if (ws.readyState !== 1) { watchers.delete(ws); continue; }
    try { ws.send(text); } catch (_) { watchers.delete(ws); }
  }
}

/* ─────────────────────────── 메시지 처리 ─────────────────────────── */

function attach(room, p, ws, { seated = false } = {}) {
  clearTimeout(p.leaveT);
  watchers.delete(ws);
  p.ws = ws; p.connected = true;
  const host = playerOf(room, room.hostId);
  if (!host || (!host.connected && host !== p)) room.hostId = p.id;
  ws.roomCode = room.code; ws.playerId = p.id;
  send(ws, Object.assign({ t: 'welcome', role: 'player', you: p.id, token: p.token, code: room.code }, seated ? { seated: true } : {}));
  if (actorOf(room) === p) { clearTimeout(room.timers.dc); room.timers.dc = null; }
  pushState(room);
  listChanged();
}

function detach(ws) {
  const room = rooms.get(ws.roomCode);
  if (room && ws.specId != null) {
    if (removeSpec(room, ws)) { pushState(room); listChanged(); }
  } else if (room) {
    const p = playerOf(room, ws.playerId);
    if (p && p.ws === ws) {
      if (room.phase === 'lobby') {
        removePlayer(room, p.id);
        if (!room.players.some(x => !x.bot)) dropRoom(room);
        else pushState(room);
      } else disconnect(ws);
    }
  }
  ws.roomCode = null; ws.playerId = null; ws.specId = null;
}

function chatText(room, who, msg, extra) {
  const text = clean(msg.text, 200);
  if (!text) return;
  const now = Date.now();
  if (now - (who.lastChat || 0) < 400) return;
  who.lastChat = now;
  broadcast(room, Object.assign({ t: 'chat', from: who.id, name: who.name, text }, extra || {}));
}

const REACTS = 6;
const FACES = ['king', 'rich', 'mid', 'poor', 'beggar'];

function handle(ws, msg) {
  if ((msg.t === 'create' || msg.t === 'join' || msg.t === 'resume') && ws.roomCode) detach(ws);
  switch (msg.t) {
    case 'rooms':
      if (!ws.roomCode) { watchers.add(ws); send(ws, roomList()); }
      return;
    case 'unwatch':
      watchers.delete(ws);
      return;
    case 'create': {
      const r = createRoom({ priv: msg.priv === true, spec: msg.spec !== false });
      const p = addPlayer(r, { name: clean(msg.name, 12) || '플레이어 1' });
      p.face = freeFace(r);
      attach(r, p, ws);
      return;
    }
    case 'join': {
      const code = clean(msg.code, 8).toUpperCase();
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'err', msg: '그런 방이 없어요. 코드를 확인해 주세요.' });
      if (r.phase !== 'lobby' || r.players.length >= MAX_PLAYERS) {
        if (!r.cfg.spec) {
          return send(ws, { t: 'err', msg: (r.phase !== 'lobby' ? '이미 시작한 방이에요.' : '방이 가득 찼어요.') + ' 관전을 허용하지 않는 방이에요.' });
        }
        if (r.specs.length >= MAX_SPECS) return send(ws, { t: 'err', msg: '관전석이 가득 찼어요.' });
        addSpec(r, ws, clean(msg.name, 12) || `관전자 ${r.specs.length + 1}`);
        return;
      }
      const p = addPlayer(r, { name: clean(msg.name, 12) || `플레이어 ${r.players.length + 1}` });
      p.face = freeFace(r);
      attach(r, p, ws);
      ev(r, { kind: 'joined', by: p.id });
      return;
    }
    case 'resume': {
      const r = rooms.get(clean(msg.code, 8).toUpperCase());
      if (!r) return send(ws, { t: 'err', msg: '방이 사라졌어요.', fatal: true });
      const p = r.players.find(x => x.token === msg.token && !x.bot);
      if (!p) return send(ws, { t: 'err', msg: '자리를 찾을 수 없어요.', fatal: true });
      if (p.ws && p.ws !== ws) { send(p.ws, { t: 'moved' }); try { p.ws.close(4001, 'moved'); } catch (_) {} }
      attach(r, p, ws);
      return;
    }
  }

  const room = rooms.get(ws.roomCode);
  if (!room) return;
  if (ws.specId != null) return handleSpec(room, ws, msg);
  const me = playerOf(room, ws.playerId);
  if (!me || me.bot) return;
  const isHost = room.hostId === me.id;
  room.lastActive = Date.now();

  switch (msg.t) {
    case 'cfg': {
      if (!isHost || room.phase === 'playing') return;
      const c = room.cfg;
      if (TURN_LIMITS.includes(msg.turnLimit)) c.turnLimit = msg.turnLimit;
      if (ROUND_CHOICES.includes(msg.rounds) && msg.rounds !== c.rounds) { c.rounds = msg.rounds; listChanged(); }
      if ([0, 1, 2].includes(msg.jokers)) c.jokers = msg.jokers;
      for (const k of R.RULE_KEYS) if (k !== 'jokers' && typeof msg[k] === 'boolean') c[k] = msg[k];
      if (typeof msg.priv === 'boolean' && msg.priv !== c.priv) { c.priv = msg.priv; listChanged(); }
      if (typeof msg.spec === 'boolean' && msg.spec !== c.spec) { c.spec = msg.spec; listChanged(); }
      pushState(room);
      break;
    }
    case 'face': {
      if (room.phase === 'playing' || !FACES.includes(msg.face)) return;
      if (room.players.some(p => p !== me && p.face === msg.face)) return;
      me.face = msg.face;
      pushState(room);
      break;
    }
    case 'addBot': {
      if (!isHost || room.phase === 'playing') return;
      if (room.players.length >= MAX_PLAYERS) return send(ws, { t: 'err', msg: '자리가 없어요.' });
      const used = new Set(room.players.map(p => p.name));
      const b = addPlayer(room, { name: BOT_NAMES.find(n => !used.has(n)) || `봇 ${room.players.length + 1}`, bot: true });
      b.face = freeFace(room);
      pushState(room); listChanged();
      break;
    }
    case 'kick': {
      if (!isHost || room.phase === 'playing') return;
      const target = playerOf(room, msg.id);
      if (!target || target.id === room.hostId) return;
      if (target.ws) send(target.ws, { t: 'err', msg: '방장이 내보냈어요.', fatal: true });
      removePlayer(room, target.id);
      pushState(room);
      break;
    }
    case 'start': {
      if (!isHost || room.phase === 'playing') return;
      if (room.players.length < MIN_PLAYERS) return send(ws, { t: 'err', msg: '두 명은 있어야 시작할 수 있어요. 봇을 불러 보세요.' });
      startGame(room);
      break;
    }
    case 'play': play(room, me, msg.ids); break;
    case 'pass': pass(room, me); break;
    case 'back': giveBack(room, me, msg.ids); break;

    case 'chat': chatText(room, me, msg); break;
    case 'react': {
      const e = msg.e | 0;
      const now = Date.now();
      if (e < 0 || e >= REACTS || now - me.lastReact < 700) return;
      me.lastReact = now;
      broadcast(room, { t: 'react', from: me.id, e });
      break;
    }
    case 'again': {
      if (!isHost || room.phase !== 'over') return;
      clearAll(room);
      room.phase = 'lobby';
      room.step = null; room.field = null; room.log = []; room.fx = null; room.exchange = null; room.exchangeDone = null;
      room.players = room.players.filter(p => !p.stood);
      for (const p of room.players) { p.hand = []; p.out = false; p.title = null; p.howOut = null; }
      for (const p of room.players) if (!p.bot && !p.connected) armLeave(room, p);
      if (!playerOf(room, room.hostId)) pickHost(room);
      seatSpecs(room);
      pushState(room);
      listChanged();
      break;
    }
    case 'leave':
      removePlayer(room, me.id);
      ws.roomCode = null; ws.playerId = null;
      send(ws, { t: 'left' });
      if (!room.players.some(x => !x.bot)) { if (room.phase === 'lobby') dropRoom(room); }
      else pushState(room);
      break;
  }
}

function handleSpec(room, ws, msg) {
  const sp = specOf(room, ws);
  if (!sp) return;
  if (msg.t === 'chat') chatText(room, sp, msg, { spec: true });
  else if (msg.t === 'leave') {
    removeSpec(room, ws);
    ws.roomCode = null; ws.playerId = null;
    send(ws, { t: 'left' });
    pushState(room);
    listChanged();
  }
}

function armLeave(room, p) {
  clearTimeout(p.leaveT);
  p.leaveT = setTimeout(() => {
    if (p.connected || room.phase !== 'lobby' || rooms.get(room.code) !== room) return;
    removePlayer(room, p.id);
    if (!room.players.some(x => !x.bot)) dropRoom(room);
    else pushState(room);
  }, LOBBY_GRACE);
}

function disconnect(ws, { keepSeat = false } = {}) {
  watchers.delete(ws);
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  if (ws.specId != null) {
    if (removeSpec(room, ws)) { pushState(room); listChanged(); }
    return;
  }
  const p = playerOf(room, ws.playerId);
  if (!p || p.ws !== ws) return;
  p.connected = false; p.ws = null;
  listChanged();
  room.lastActive = Date.now();

  if (room.hostId === p.id) {
    clearTimeout(room.timers.host);
    room.timers.host = setTimeout(() => {
      const h = playerOf(room, room.hostId);
      if (h && h.connected) return;
      const next = room.players.find(x => !x.bot && x.connected);
      if (next) { room.hostId = next.id; pushState(room); }
    }, LOBBY_GRACE);
  }

  if (room.phase === 'lobby') {
    clearTimeout(p.leaveT);
    if (!keepSeat) armLeave(room, p);
  } else if (actorOf(room) === p) {
    clearTimeout(room.timers.dc);
    room.timers.dc = setTimeout(() => { if (actorOf(room) === p && !p.connected) autoAct(room, p); }, DC_GRACE);
  } else if (room.step === 'exchange') {
    botExchange(room);
  }
  pushState(room);
}

/** 사람이 다 떠난 방을 치운다. 통신 쪽이 30초마다 부른다. */
function sweepRooms(now = Date.now()) {
  for (const room of [...rooms.values()]) {
    const humans = room.players.filter(p => !p.bot && p.connected).length;
    const seated = room.phase !== 'over' && room.players.some(p => !p.bot && !p.stood);
    if (humans === 0 && now - room.lastActive > (seated ? 10 * 60_000 : 90_000)) dropRoom(room);
  }
}

function selfCheck() {
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    for (const jk of [0, 1, 2]) {
      const deck = R.makeDeck(n, jk);
      const { hands, hidden } = R.deal(deck, n);
      if (hands.reduce((a, h) => a + h.length, 0) + hidden.length !== deck.length) throw new Error(`${n}인 조커 ${jk} 나누기가 어긋납니다`);
    }
  }
  console.log(`  대부호 ${MIN_PLAYERS}~${MAX_PLAYERS}인 · 조커 0~2장`);
}

module.exports = { rooms, handle, disconnect, sweepRooms, selfCheck, MAX_PLAYERS, MAX_SPECS, _test: { stateFor, autoAct, actorOf, createRoom, addPlayer, startGame, play, pass } };
