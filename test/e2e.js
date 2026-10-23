'use strict';
// 소켓 둘(사람)과 봇 둘로 끝까지 — 남의 손패가 새지 않는지, 사람이 세금을 돌려주는지 본다.
//   DAIFUGO_FAST=1 PORT=8899 node server.js &   PORT=8899 node test/e2e.js
const WebSocket = require('ws');
const R = require('../public/rules.js');
// 배포본 확인: URL=wss://daifugo.41ways.workers.dev/ws ROUNDS=1 BOTS=0 node test/e2e.js
const URL = process.env.URL || `ws://127.0.0.1:${process.env.PORT || 8899}/ws`;
const ROUNDS = +process.env.ROUNDS || 5, BOTS = process.env.BOTS != null ? +process.env.BOTS : 2;

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, name, S: null, backs: 0, plays: 0, leaks: 0 };
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'state') {
      c.S = m;
      // 남의 손패는 장수(숫자)만
      if (m.players.some(p => typeof p.hand !== 'number')) c.leaks++;
      if (m.exchange && m.exchange.deals.some(d => d.got && d.rich !== m.you && d.poor !== m.you)) c.leaks++;
      act(c);
    }
    if (m.t === 'welcome') c.me = m.you;
    if (m.t === 'err') console.log('  err', name, m.msg);
  });
  return c;
}
const send = (c, o) => c.ws.send(JSON.stringify(o));
function act(c) {
  const S = c.S;
  if (S.phase !== 'playing') return;
  if (S.step === 'exchange') {
    const d = S.exchange.deals.find(x => x.rich === S.you && !x.done);
    if (d && !c.sentBack) { c.sentBack = true; c.backs++; setTimeout(() => send(c, { t: 'back', ids: R.botGiveBack(S.hand, d.k).map(x => x.id) }), 5); }
    return;
  }
  c.sentBack = false;
  if (S.step !== 'play' || S.turn !== S.you) return;
  const key = JSON.stringify([S.turn, S.round, S.hand.length, S.log.slice(0, 4)]);
  if (c.last === key) return;
  c.last = key;
  const ctx = { rev: S.rev !== S.jrev, lock: S.lock, rules: S.cfg };
  const p = R.botPlay(S.hand, S.field, ctx, { minOpp: 9 });
  setTimeout(() => {
    if (p) { c.plays++; send(c, { t: 'play', ids: p.cards.map(x => x.id) }); }
    else if (S.field) send(c, { t: 'pass' });
    else send(c, { t: 'play', ids: [R.sortCards(S.hand, ctx.rev)[0].id] });
  }, 3);
}

(async () => {
  const a = client('가'), b = client('나');
  await new Promise(r => a.ws.on('open', r));
  send(a, { t: 'create', name: '가' });
  await new Promise(r => setTimeout(r, 200));
  await new Promise(r => b.ws.readyState === 1 ? r() : b.ws.on('open', r));
  send(b, { t: 'join', code: a.S.code, name: '나' });
  await new Promise(r => setTimeout(r, 200));
  for (let i = 0; i < BOTS; i++) send(a, { t: 'addBot' });
  send(a, { t: 'cfg', rounds: ROUNDS, turnLimit: 0 });
  await new Promise(r => setTimeout(r, 200));
  send(a, { t: 'start' });
  const t0 = Date.now();
  while (!(a.S && a.S.phase === 'over')) {
    if (Date.now() - t0 > (process.env.URL ? 240000 : 60000)) { console.log('✗ 멈춤', a.S.step, a.S.turn, a.S.round, JSON.stringify({ bS: !!b.S, bme: b.me, field: a.S.field, players: a.S.players.map(p => [p.id, p.name, p.bot, p.connected, p.hand]) })); process.exit(1); }
    await new Promise(r => setTimeout(r, 50));
  }
  const ok = a.leaks + b.leaks === 0 && a.S.players.every(p => p.hist.length === ROUNDS);
  console.log(`e2e ${ok ? '통과' : '실패'} — ${ROUNDS}판 끝까지 ${((Date.now() - t0) / 1000).toFixed(1)}초 · 사람이 돌려준 세금 ${a.backs + b.backs}번 · 낸 수 ${a.plays + b.plays} · 새는 정보 ${a.leaks + b.leaks}`);
  console.log('  ', a.S.players.map(p => `${p.name} ${p.score}점 [${p.hist.join(' ')}]`).join(' / '));
  process.exit(ok ? 0 : 1);
})();
