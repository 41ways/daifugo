/**
 * 대부호 — 카드 · 족보 · 내기 판정 · 봇.
 *
 * 서버(game.js)와 화면(app.js)이 이 파일 하나를 똑같이 쓴다.
 * 서버는 낸 카드가 맞는지 판정하고, 화면은 "지금 낼 수 있는 카드"를 미리 보여 주는 데 쓴다.
 *
 * 카드 { id, s, r }
 *   s  무늬 'S'(♠) 'H'(♥) 'D'(♦) 'C'(♣), 조커는 'X'
 *   r  숫자 3..10, J=11, Q=12, K=13, A=14, 2=15, 조커=16
 * 세기는 3 < 4 < … < A < 2 < 조커. 혁명이면 숫자 쪽만 거꾸로(조커는 늘 가장 세다).
 *
 * 내는 꼴
 *   group  같은 숫자 n장 (1장이면 한 장 내기). 조커는 아무 숫자나 대신한다.
 *   stair  계단 — 같은 무늬로 숫자가 이어진 3장 이상. 조커가 빈 칸을 채운다.
 * 받아 낼 때는 꼴과 장수가 같고 더 세야 한다.
 */
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'D', 'C'];
  const JOKER = 16;
  const RANK_NAME = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JOKER' };
  const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣', X: '★' };
  const rankName = r => RANK_NAME[r] || String(r);
  const cardName = c => (c.s === 'X' ? '조커' : SUIT_SYM[c.s] + rankName(c.r));

  /** 규칙 고르기 — 대기실에서 방장이 바꾼다. 기본은 일본 대부호 연맹의 5대 공식 규칙 + 조커 1장 + 계단 */
  const DEFAULT_RULES = {
    jokers: 1,        // 0 · 1 · 2
    stairs: true,     // 계단
    eight: true,      // 8 자르기 — 8이 섞인 카드를 내면 바닥을 치우고 낸 사람이 다시 낸다
    lock: true,       // 문양 묶기 — 바로 앞 카드와 무늬가 같으면 그 무늬만 낼 수 있다
    spade3: true,     // 스페이드 3 되치기 — 조커 한 장에 ♠3 을 내면 바닥이 치워진다
    miyako: true,     // 도시 추락 — 지난 판 대부호가 1등을 못 하면 바로 대빈민
    foul: true,       // 반칙 마무리 — 조커 · 8 · 가장 센 숫자(2, 혁명이면 3)로 끝내면 꼴찌
    jback: false,     // J 백 — J 를 내면 그 바닥이 치워질 때까지 세기가 뒤집힌다
  };
  const RULE_KEYS = Object.keys(DEFAULT_RULES);

  function str(r, rev) {
    if (r >= JOKER) return 100;
    return rev ? 18 - r : r;
  }

  /* ─────────────────────────── 덱 ─────────────────────────── */

  /** 2인은 3·4·5·J·Q·K·A·2 각 4장 + 조커 1장(33장)으로 13장씩 나누고 7장은 덮어 둔다 (나무위키 2인 규칙) */
  function makeDeck(n, jokers) {
    const ranks = n === 2 ? [3, 4, 5, 11, 12, 13, 14, 15] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const deck = [];
    let id = 1;
    for (const r of ranks) for (const s of SUITS) deck.push({ id: id++, s, r });
    const jk = n === 2 ? 1 : Math.max(0, Math.min(2, jokers | 0));
    for (let i = 0; i < jk; i++) deck.push({ id: id++, s: 'X', r: JOKER });
    return deck;
  }

  /** 섞은 덱을 나눈다 — 남는 장은 앞자리부터 한 장씩 더 */
  function deal(deck, n) {
    const hands = Array.from({ length: n }, () => []);
    let hidden = [];
    let cards = deck;
    if (n === 2) { hidden = deck.slice(26); cards = deck.slice(0, 26); }
    cards.forEach((c, i) => hands[i % n].push(c));
    return { hands, hidden };
  }

  const isJoker = c => c.s === 'X';

  /** 손패 정렬 — 약한 것부터 (혁명이면 거꾸로), 같은 숫자는 무늬 순 */
  function sortCards(cards, rev) {
    return cards.slice().sort((a, b) => str(a.r, rev) - str(b.r, rev) || SUITS.indexOf(a.s) - SUITS.indexOf(b.s) || a.id - b.id);
  }

  /* ─────────────────────────── 족보 ─────────────────────────── */

  /**
   * 고른 카드가 무슨 꼴로 읽히는지 — 조커 때문에 여러 가지로 읽힐 수 있어 목록을 돌려준다.
   *  { type:'group', n, rank, suits, J }      rank 16 이면 조커만으로 된 묶음
   *  { type:'stair', n, lo, hi, suit, J }
   */
  function analyze(cards, rules) {
    const n = cards.length;
    if (!n) return [];
    const J = cards.filter(isJoker).length;
    const R = cards.filter(c => !isJoker(c));
    const out = [];
    if (!R.length || R.every(c => c.r === R[0].r)) {
      out.push({ type: 'group', n, rank: R.length ? R[0].r : JOKER, suits: R.map(c => c.s).sort().join(''), J });
    }
    if (rules.stairs && n >= 3 && R.length >= 1 && R.every(c => c.s === R[0].s)) {
      const rs = R.map(c => c.r).sort((a, b) => a - b);
      const distinct = rs.every((r, i) => !i || r !== rs[i - 1]);
      const min = rs[0], max = rs[rs.length - 1];
      if (distinct && max - min + 1 <= n && (max - min + 1) - R.length <= J) {
        for (let lo = Math.max(3, max - n + 1); lo <= min; lo++) {
          const hi = lo + n - 1;
          if (hi > 15) break;
          out.push({ type: 'stair', n, lo, hi, suit: R[0].s, J });
        }
      }
    }
    return out;
  }

  /** 꼴의 세기 — 가장 약한 장으로 잰다 */
  function power(it, rev) {
    if (it.type === 'group') return str(it.rank, rev);
    return Math.min(str(it.lo, rev), str(it.hi, rev));
  }

  /** 문양 묶기에 쓰는 무늬 열쇠 — 조커가 섞이면 묶기에 쓰지 않는다 */
  const suitKey = it => (it.J ? null : it.type === 'stair' ? it.suit : it.suits);

  /** 묶인 무늬를 지키나 — 조커는 빈 무늬를 아무거나 메운다 */
  function fitsLock(it, cards, lock) {
    if (!lock) return true;
    const real = cards.filter(c => !isJoker(c)).map(c => c.s);
    if (it.type === 'stair') return lock.length === 1 && real.every(s => s === lock);
    const want = lock.split('');
    return real.every(s => want.includes(s));
  }

  /**
   * 바닥(field) 위에 이 카드를 낼 수 있나. 낼 수 있으면 쓸 꼴을 돌려준다.
   * ctx { rev(지금 세기 방향 — 혁명 · J 백 포함), lock, rules }
   * field { cards, it } 또는 null(내가 새로 내는 차례)
   */
  function judge(cards, field, ctx) {
    const its = analyze(cards, ctx.rules);
    if (!its.length) return null;
    if (!field) {
      // 새로 낼 때 — 묶음으로 읽히면 묶음, 아니면 가장 센 계단
      const g = its.find(x => x.type === 'group');
      if (g) return g;
      return its.slice().sort((a, b) => power(b, ctx.rev) - power(a, ctx.rev))[0];
    }
    const F = field.it;
    // 스페이드 3 되치기 — 조커 한 장 위에 ♠3 한 장
    if (ctx.rules.spade3 && F.type === 'group' && F.n === 1 && F.rank === JOKER
        && cards.length === 1 && cards[0].s === 'S' && cards[0].r === 3) {
      return Object.assign({}, its[0], { s3: true });
    }
    const ok = its.filter(it => it.type === F.type && it.n === F.n
      && power(it, ctx.rev) > power(F, ctx.rev) && fitsLock(it, cards, ctx.lock));
    if (!ok.length) return null;
    return ok.sort((a, b) => power(b, ctx.rev) - power(a, ctx.rev))[0];
  }

  /** 낸 뒤에 생기는 일 */
  function effects(cards, it, field, rules) {
    const real = cards.filter(c => !isJoker(c));
    return {
      revolution: it.type === 'group' && it.n >= 4,
      eight: !!rules.eight && real.some(c => c.r === 8),
      jback: !!rules.jback && real.some(c => c.r === 11),
      s3: !!it.s3,
      // 바로 앞 카드와 무늬가 똑같으면 묶인다 (둘 다 조커 없이)
      lock: !!rules.lock && field && suitKey(it) && suitKey(it) === suitKey(field.it) ? suitKey(it) : null,
    };
  }

  /** 이 카드로 손을 털면 반칙인가 — 왜 반칙인지 짧은 말로, 아니면 null
   *  조커 · 8(8 자르기를 쓸 때) · 가장 센 숫자(평소 2, 혁명 중 3) · ♠3 되치기. 계단 · 짝 속에 섞여 있어도 반칙이다. */
  function foulWhy(cards, it, rev, rules) {
    if (!rules.foul) return null;
    if (it && it.s3) return '♠3 되치기로 끝냄';
    if (cards.some(isJoker)) return '조커로 끝냄';
    if (rules.eight && cards.some(c => c.r === 8)) return '8로 끝냄';
    const top = rev ? 3 : 15;
    if (cards.some(c => c.r === top)) return rev ? '혁명 중에 3으로 끝냄' : '2로 끝냄';
    return null;
  }
  const foulFinish = (cards, it, rev, rules) => !!foulWhy(cards, it, rev, rules);

  /* ─────────────────────────── 낼 수 있는 것 모두 ─────────────────────────── */

  function combos(arr, k, from = 0, cur = [], out = []) {
    if (cur.length === k) { out.push(cur.slice()); return out; }
    for (let i = from; i < arr.length; i++) { cur.push(arr[i]); combos(arr, k, i + 1, cur, out); cur.pop(); }
    return out;
  }

  /** 손에서 만들 수 있는 모든 꼴(카드 묶음) — 같은 카드 묶음은 한 번만 */
  function allPlays(hand, rules) {
    const jk = hand.filter(isJoker);
    const byRank = new Map();
    for (const c of hand) if (!isJoker(c)) { if (!byRank.has(c.r)) byRank.set(c.r, []); byRank.get(c.r).push(c); }
    const seen = new Set();
    const out = [];
    const add = cards => {
      const key = cards.map(c => c.id).sort((a, b) => a - b).join(',');
      if (seen.has(key)) return;
      seen.add(key); out.push(cards);
    };
    for (const c of hand) add([c]);
    for (const cs of byRank.values()) {
      for (let k = 1; k <= cs.length; k++) {
        for (const sub of combos(cs, k)) {
          for (let j = 0; j <= jk.length; j++) if (k + j >= 2) add(sub.concat(jk.slice(0, j)));
        }
      }
    }
    if (jk.length >= 2) add(jk.slice(0, 2));
    if (rules.stairs) {
      for (const s of SUITS) {
        const have = new Map(hand.filter(c => c.s === s).map(c => [c.r, c]));
        for (let lo = 3; lo <= 13; lo++) {
          for (let len = 3; lo + len - 1 <= 15; len++) {
            const cards = [];
            let miss = 0;
            for (let r = lo; r < lo + len; r++) { if (have.has(r)) cards.push(have.get(r)); else miss++; }
            if (miss > jk.length) break;
            if (!cards.length) continue;
            add(cards.concat(jk.slice(0, miss)));
          }
        }
      }
    }
    return out;
  }

  function legalPlays(hand, field, ctx) {
    const res = [];
    for (const cards of allPlays(hand, ctx.rules)) {
      const it = judge(cards, field, ctx);
      if (it) res.push({ cards, it });
    }
    return res;
  }

  /* ─────────────────────────── 계급 ─────────────────────────── */

  /** 등수(0=1등) → 계급 이름 */
  function titles(n) {
    if (n <= 1) return ['대부호'];
    if (n === 2) return ['대부호', '대빈민'];
    if (n === 3) return ['대부호', '평민', '대빈민'];
    const t = ['대부호', '부호'];
    for (let i = 0; i < n - 4; i++) t.push('평민');
    return t.concat(['빈민', '대빈민']);
  }
  /** 계급 점수 — 대부호 4 · 부호 3 · 평민 2 · 빈민 1 · 대빈민 0 */
  const TITLE_PTS = { 대부호: 4, 부호: 3, 평민: 2, 빈민: 1, 대빈민: 0 };
  const TITLE_KEY = { 대부호: 'king', 부호: 'rich', 평민: 'mid', 빈민: 'poor', 대빈민: 'beggar' };

  /** 카드 바꾸기 짝 — [윗사람 등수, 아랫사람 등수, 장수] */
  function exchangePairs(n) {
    if (n < 2) return [];
    const pairs = [[0, n - 1, 2]];
    if (n >= 4) pairs.push([1, n - 2, 1]);
    return pairs;
  }

  /** 아랫사람이 바치는 카드 — 가장 센 것부터(조커 > 2 > A …) */
  function strongest(hand, k) {
    return sortCards(hand, false).slice(-k);
  }

  /* ─────────────────────────── 봇 ───────────────────────────
     봇은 자기 손패 · 바닥 · 남들 손패 장수만 안다.
     기본 생각: 약한 카드부터 털고, 묶음은 깨지 않으며, 조커 · 2 · 8 은 바닥을 잡을 때 쓴다. */

  /** 손에 남은 카드를 털려면 몇 번 내야 하나(대략) — 적을수록 좋은 손 */
  function handCost(hand, rev) {
    const byRank = new Map();
    let jk = 0;
    for (const c of hand) { if (isJoker(c)) jk++; else byRank.set(c.r, (byRank.get(c.r) || 0) + 1); }
    let cost = 0;
    for (const [r, k] of byRank) {
      const s = str(r, rev);          // 3..15
      // 약한 숫자일수록 부담이 크다. 묶음이면 한 번에 턴다.
      cost += 1 + Math.max(0, (11 - s)) * 0.12 * (k >= 2 ? 0.6 : 1);
    }
    return cost - jk * 0.6;
  }

  function botPlay(hand, field, ctx, info) {
    const plays = legalPlays(hand, field, ctx);
    if (!plays.length) return null;
    const rev = ctx.rev;
    const rules = ctx.rules;
    const left = c => hand.filter(x => !c.includes(x));
    // 한 번에 다 털 수 있고 반칙이 아니면 바로
    const win = plays.find(p => p.cards.length === hand.length && !foulFinish(p.cards, p.it, rev, rules));
    if (win) return win;

    const minOpp = info && info.minOpp != null ? info.minOpp : 9;
    const urgent = minOpp <= 2;           // 누군가 곧 끝난다 — 바닥을 잡아야 한다
    const score = p => {
      const rest = left(p.cards);
      let s = -handCost(rest, rev) * 10;
      const pw = power(p.it, rev);
      const isTop = p.cards.some(c => isJoker(c) || c.r === (rev ? 3 : 15));
      // 남은 손이 반칙으로만 끝날 수 있으면 위험 — 센 카드는 일찍 써 둔다
      const restAllFoul = rest.length && rest.every(c => isJoker(c) || (rules.eight && c.r === 8) || c.r === (rev ? 3 : 15));
      if (restAllFoul && rules.foul) s -= 25;
      if (!field) {
        // 새로 낼 때: 약하고 많이 털리는 꼴
        s += p.cards.length * 4 - pw * 0.8;
        if (isTop) s -= 12;
      } else {
        // 받을 때: 가능한 한 약한 카드로
        s -= pw * (urgent ? 0.2 : 1.1);
        if (isTop && !urgent && hand.length > 4) s -= 14;
      }
      const ef = effects(p.cards, p.it, field, rules);
      if (ef.eight) s += field ? 6 : 3;              // 8 자르기면 바닥을 잡는다
      if (ef.revolution) {
        // 혁명 — 내 손이 약한 숫자 투성이면 좋다
        const weak = rest.filter(c => !isJoker(c) && str(c.r, rev) <= 8).length;
        const strong = rest.filter(c => !isJoker(c) && str(c.r, rev) >= 12).length;
        s += (weak - strong) * 6;
      }
      if (p.it.s3) s += 8;
      // 다 털게 되는데 반칙이면 피한다
      if (p.cards.length === hand.length) s -= 1000;
      return s + Math.random() * 3;
    };
    plays.sort((a, b) => score(b) - score(a));
    const best = plays[0];
    if (field && !urgent) {
      // 센 카드밖에 낼 게 없으면 대개 넘긴다
      const pw = power(best.it, rev);
      const isTop = best.cards.some(c => isJoker(c) || c.r === (rev ? 3 : 15));
      if ((isTop || pw >= 13) && hand.length > 3 && Math.random() < 0.7) return null;
    }
    // 반칙 마무리밖에 없으면 넘긴다 — 새로 낼 차례엔 넘길 수 없으니 그대로 낸다
    if (best.cards.length === hand.length && field) return null;
    return best;
  }

  /** 대부호 · 부호가 돌려줄 카드 — 가장 약한 외톨이부터 (묶음은 깨지 않게) */
  function botGiveBack(hand, k) {
    const cnt = new Map();
    for (const c of hand) cnt.set(c.r, (cnt.get(c.r) || 0) + 1);
    return hand.filter(c => !isJoker(c)).slice()
      .sort((a, b) => (cnt.get(a.r) > 1) - (cnt.get(b.r) > 1) || a.r - b.r)
      .slice(0, k);
  }

  const R = {
    SUITS, JOKER, SUIT_SYM, DEFAULT_RULES, RULE_KEYS, TITLE_PTS, TITLE_KEY,
    str, rankName, cardName, makeDeck, deal, isJoker, sortCards,
    analyze, power, judge, effects, foulFinish, foulWhy, allPlays, legalPlays,
    titles, exchangePairs, strongest, handCost, botPlay, botGiveBack,
  };

  if (typeof module === 'object' && module.exports) module.exports = R;
  else root.DR = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
