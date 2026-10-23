'use strict';
// 봇끼리 끝까지 — 멈춘 판 · 카드 수 어긋남 · 오류를 찾는다.  GAMES=200 node test/sim.js
process.env.DAIFUGO_FAST = '1';
const G = require('../game.js');
const R = require('../public/rules.js');
const T = G._test;
const GAMES = +process.env.GAMES || 120;

function oneGame(n, rules) {
  return new Promise((resolve, reject) => {
    const room = T.createRoom({});
    for (let i = 0; i < n; i++) T.addPlayer(room, { name: 'b' + i, bot: true });
    Object.assign(room.cfg, rules, { rounds: 3, turnLimit: 0 });
    let plays = 0;
    const origLog = room.log;
    T.startGame(room);
    const t0 = Date.now();
    const iv = setInterval(() => {
      // 매번 카드 수 확인 — 손패 + 이미 낸 카드 합이 덱과 같아야 하지만, 여기선 손패 중복만 본다
      const ids = room.players.flatMap(p => p.hand.map(c => c.id));
      if (new Set(ids).size !== ids.length) { clearInterval(iv); return reject(new Error('카드가 두 번 있다')); }
      if (room.phase === 'over') {
        clearInterval(iv);
        const titles = room.players.map(p => p.hist.length);
        if (titles.some(x => x !== 3)) return reject(new Error('판 수가 안 맞는다 ' + titles));
        G.rooms.delete(room.code);
        return resolve({ ms: Date.now() - t0, room });
      }
      if (Date.now() - t0 > 20000) { clearInterval(iv); reject(new Error(`멈춤 n=${n} step=${room.step} turn=${room.turn} round=${room.round} ` + JSON.stringify(rules))); }
    }, 5);
  });
}

(async () => {
  const variants = [
    {}, { jokers: 2 }, { jokers: 0, stairs: false }, { jback: true }, { lock: false, eight: false, foul: false, miyako: false },
  ];
  let done = 0;
  const stats = { foul: 0, miyako: 0, rev: 0 };
  for (let g = 0; g < GAMES; g++) {
    const n = 2 + (g % 5);
    const rules = Object.assign({}, R.DEFAULT_RULES, variants[g % variants.length]);
    const { room } = await oneGame(n, rules);
    for (const p of room.players) { if (p.howOut === 'foul') stats.foul++; if (p.howOut === 'miyako') stats.miyako++; }
    done++;
  }
  console.log(`시뮬레이션 ${done}판 끝까지 · 마지막 판 반칙 ${stats.foul} · 도시추락 ${stats.miyako}`);
  process.exit(0);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
