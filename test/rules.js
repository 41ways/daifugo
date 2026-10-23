'use strict';
// 규칙 판정 시험 — node test/rules.js
const R = require('../public/rules.js');
const rules = Object.assign({}, R.DEFAULT_RULES);
let id = 1000;
const C = s => s.split(' ').map(t => t === 'X' ? { id: id++, s: 'X', r: 16 } : { id: id++, s: t[0], r: { J: 11, Q: 12, K: 13, A: 14, '2': 15 }[t.slice(1)] || +t.slice(1) });
const field = (cards, ctx) => ({ cards, it: R.judge(cards, null, ctx) });
const ctx = (o = {}) => Object.assign({ rev: false, lock: null, rules }, o);
let fail = 0, n = 0;
const ok = (cond, msg) => { n++; if (!cond) { fail++; console.log('  ✗', msg); } };

ok(R.judge(C('S5'), field(C('H4'), ctx()), ctx()), '5 > 4 한 장');
ok(!R.judge(C('S4'), field(C('H5'), ctx()), ctx()), '4 < 5');
ok(!R.judge(C('S5'), field(C('H5'), ctx()), ctx()), '같은 숫자는 못 낸다');
ok(R.judge(C('S15'), field(C('HA'), ctx()), ctx()), '2 > A');
ok(R.judge(C('X'), field(C('S2'), ctx()), ctx()), '조커 > 2');
ok(!R.judge(C('S2'), field(C('X'), ctx()), ctx()), '2 < 조커');
ok(R.judge(C('S3'), field(C('X'), ctx()), ctx()).s3, '♠3 되치기');
ok(!R.judge(C('H3'), field(C('X'), ctx()), ctx()), '♥3 은 되치기 아님');
ok(R.judge(C('S3'), field(C('H4'), ctx({ rev: true })), ctx({ rev: true })), '혁명이면 3 > 4');
ok(!R.judge(C('S2'), field(C('H4'), ctx({ rev: true })), ctx({ rev: true })), '혁명이면 2 < 4');
ok(R.judge(C('X'), field(C('S3'), ctx({ rev: true })), ctx({ rev: true })), '혁명이어도 조커가 가장 세다');
ok(R.judge(C('S7 H7'), field(C('S6 D6'), ctx()), ctx()), '7 둘 > 6 둘');
ok(!R.judge(C('S7'), field(C('S6 D6'), ctx()), ctx()), '장수가 다르면 못 낸다');
ok(!R.judge(C('S7 H7 D7'), field(C('S6 D6'), ctx()), ctx()), '석 장으로 둘을 못 받는다');
ok(R.judge(C('S9 X'), field(C('S6 D6'), ctx()), ctx()), '조커가 짝을 채운다');
ok(R.judge(C('X X'), field(C('S2 D2'), ctx()), ctx()), '조커 둘 > 2 둘');
ok(!R.judge(C('S7 H8'), null, ctx()), '숫자가 다른 두 장은 꼴이 아니다');
// 계단
ok(R.judge(C('S4 S5 S6'), null, ctx()).type === 'stair', '♠456 계단');
ok(!R.judge(C('S4 H5 S6'), null, ctx()), '무늬 섞인 계단은 안 된다');
ok(R.judge(C('S4 X S6'), null, ctx()).type === 'stair', '조커가 계단 빈칸');
ok(R.judge(C('H5 H6 H7'), field(C('S4 S5 S6'), ctx()), ctx()), '567 > 456');
ok(!R.judge(C('H4 H5 H6'), field(C('S4 S5 S6'), ctx()), ctx()), '같은 높이 계단은 못 받는다');
ok(!R.judge(C('H5 H6 H7 H8'), field(C('S4 S5 S6'), ctx()), ctx()), '장수 다른 계단');
ok(!R.judge(C('S4 S5 S6'), null, ctx({ rules: Object.assign({}, rules, { stairs: false }) })), '계단 끄기');
ok(R.judge(C('SQ SK SA S2'), null, ctx()), 'QKA2 계단');
// 묶기
const lk = ctx({ lock: 'H' });
ok(R.judge(C('H9'), field(C('H5'), lk), lk), '묶인 하트');
ok(!R.judge(C('S9'), field(C('H5'), lk), lk), '묶이면 다른 무늬 못 냄');
ok(R.judge(C('X'), field(C('H5'), lk), lk), '조커는 묶여도 낼 수 있다');
const lk2 = ctx({ lock: 'DH' });
ok(R.judge(C('H9 D9'), field(C('H5 D5'), lk2), lk2), '♥♦ 묶음');
ok(!R.judge(C('H9 S9'), field(C('H5 D5'), lk2), lk2), '♥♠ 은 안 된다');
// 효과
const f1 = field(C('H5'), ctx());
const e1 = R.effects(C('H7'), R.judge(C('H7'), f1, ctx()), f1, rules);
ok(e1.lock === 'H', '하트에 하트 → 묶임');
const e2 = R.effects(C('S7'), R.judge(C('S7'), f1, ctx()), f1, rules);
ok(!e2.lock, '하트에 스페이드 → 안 묶임');
ok(R.effects(C('S8'), R.judge(C('S8'), null, ctx()), null, rules).eight, '8 자르기');
ok(R.effects(C('S8 H8'), R.judge(C('S8 H8'), null, ctx()), null, rules).eight, '8 둘도 자르기');
ok(!R.effects(C('S7 X'), R.judge(C('S7 X'), null, ctx()), null, rules).eight, '조커는 8 이 아니다');
ok(R.effects(C('S5 H5 D5 C5'), R.judge(C('S5 H5 D5 C5'), null, ctx()), null, rules).revolution, '같은 숫자 4장 혁명');
ok(R.effects(C('S5 H5 D5 X'), R.judge(C('S5 H5 D5 X'), null, ctx()), null, rules).revolution, '조커 섞인 4장 혁명');
ok(!R.effects(C('S4 S5 S6 S7'), R.judge(C('S4 S5 S6 S7'), null, ctx()), null, rules).revolution, '계단은 혁명 아님');
// 반칙 마무리
ok(R.foulFinish(C('X'), null, false, rules), '조커로 끝내면 반칙');
ok(R.foulFinish(C('S2'), null, false, rules), '2 로 끝내면 반칙');
ok(!R.foulFinish(C('S2'), null, true, rules), '혁명 중 2 는 반칙 아님');
ok(R.foulFinish(C('S3'), null, true, rules), '혁명 중 3 은 반칙');
ok(R.foulFinish(C('D8'), null, false, rules), '8 로 끝내면 반칙');
ok(!R.foulFinish(C('D9'), null, false, rules), '9 는 괜찮다');
// 계급
ok(R.titles(5).join() === '대부호,부호,평민,빈민,대빈민', '5인 계급');
ok(R.titles(3).join() === '대부호,평민,대빈민', '3인 계급');
// 덱
ok(R.makeDeck(4, 1).length === 53 && R.makeDeck(4, 2).length === 54 && R.makeDeck(2, 2).length === 33, '덱 장수');
// 낼 수 있는 것 목록
const hand = C('S3 H3 S4 S5 X D9');
const all = R.legalPlays(hand, null, ctx());
ok(all.some(p => p.cards.length === 3 && p.it.type === 'stair'), '목록에 ♠345 계단');
ok(all.some(p => p.cards.length === 3 && p.it.type === 'group'), '목록에 3 셋(조커)');

console.log(`규칙 ${n - fail}/${n}`);
if (fail) process.exit(1);
