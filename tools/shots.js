'use strict';
/**
 * README 스크린샷 — 헤드리스 크롬을 DevTools 프로토콜로 조종해 실제 판을 열고 찍는다.
 *   node server.js &           (로컬 8812)
 *   node tools/shots.js        → docs/screens/*.webp
 * 봇과 한 판을 실제로 굴리고, 혁명 · 판 결과처럼 기다리기 어려운 장면만 화면 상태를 손으로 바꿔 찍는다.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.BASE || 'http://localhost:8812';
const OUT = path.join(__dirname, '..', 'docs', 'screens');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dfg-shot-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    let page;
    for (let i = 0; i < 60 && !page; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        page = list.find(t => t.type === 'page');
        if (!page && i > 10) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
      } catch (_) { /* 아직 안 떴다 */ }
      if (!page) await sleep(250);
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.addEventListener('open', r));
    let id = 0;
    const wait = new Map();
    ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
    const cdp = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const js = async expr => {
      const r = await cdp('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result && r.result.result ? r.result.result.value : undefined;
    };
    const size = (w, h, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    const shot = async name => {
      await sleep(250);
      const r = await cdp('Page.captureScreenshot', { format: 'webp', quality: 84 });
      fs.writeFileSync(path.join(OUT, name + '.webp'), Buffer.from(r.result.data, 'base64'));
      console.log('  찍음', name);
    };
    const NOANIM = `const st = document.createElement('style'); st.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.appendChild(st);`;
    const open = async (url) => { await cdp('Page.enable'); await cdp('Page.navigate', { url }); await sleep(1500); await js(NOANIM + `await document.fonts.ready;`); };
    const until = async (cond, ms = 90000) => { const t = Date.now(); while (!(await js(`return !!(${cond});`))) { if (Date.now() - t > ms) throw new Error('기다리다 지침: ' + cond); await sleep(300); } };

    // 1. 시작 화면
    await size(1440, 900);
    await open(BASE + '/');
    await shot('title');

    // 2. 대기실 — 봇 넷, 규칙 고르기 펼침
    await js(`sessionStorage.clear(); localStorage.setItem('daifugo.mute','1');
      document.querySelector('#bBegin').click(); document.querySelector('#gName').value = '한결'; document.querySelector('#bCreate').click();
      await new Promise(r => setTimeout(r, 900));
      for (let i = 0; i < 4; i++) { document.querySelector('#bBot').click(); await new Promise(r => setTimeout(r, 200)); }
      await new Promise(r => setTimeout(r, 400)); document.querySelector('#rulesBox').open = true; scrollTo(0, 0);`);
    await shot('lobby');

    // 3. 판 — 바닥에 카드가 있고 내 차례일 때 추천 패를 골라 둔 모습
    await js(`document.querySelector('#bStart').click();`);
    await until(`window.__S() && window.__S().step === 'play' && window.__S().turn === window.__S().you && window.__S().field && DR.legalPlays(window.__S().hand, window.__S().field, {rev:false,lock:window.__S().lock,rules:window.__S().cfg}).length && !window.__S().rev`);
    await js(`document.querySelector('#bHint').click();`);
    await shot('game');

    // 4. 혁명 — 화면 상태만 바꿔서
    await js(`const S = window.__S(); sel.clear(); S.rev = true; renderGame();
      const b = document.getElementById('banner'); b.className = 'banner rev'; b.innerHTML = '<b>革命</b><span>혁명! 세기가 뒤집혔다</span>'; b.hidden = false; b.style.transform = 'translate(-50%,-50%)';
      clearTimeout(bannerT);`);
    await shot('revolution');
    await js(`document.getElementById('banner').hidden = true; window.__S().rev = false; renderGame();`);

    // 5. 판 결과
    await js(`const S = window.__S(); const T = DR.titles(S.players.length);
      S.step = 'roundEnd'; S.ranking = S.players.map(p => p.id).sort(() => Math.random() - .5);
      S.ranking.forEach((id, i) => { const p = S.players.find(x => x.id === id); p.score = DR.TITLE_PTS[T[i]]; p.howOut = i === S.ranking.length - 1 ? 'foul' : 'win'; p.foulWhy = i === S.ranking.length - 1 ? '8로 끝냄' : null; });
      renderGame();`);
    await shot('round');

    // 6. 폰
    await js(`const S = window.__S(); S.step = 'play'; S.ranking = null; renderGame();`);
    await size(390, 844, true);
    await js(`renderGame();`);
    await shot('phone-game');
    await js(`sessionStorage.clear();`);
    await open(BASE + '/');
    await shot('phone-title');

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
