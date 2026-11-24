// 화면 시험(Playwright): 빌드한 dist를 띄워 MusicXML 열기 → 그리기 → 재생 소리 만들기
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-smoke.cjs <파일.musicxml…>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
(async () => {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(__dirname, 'fixtures/timeonly-tie.musicxml')];
  const srv = spawn('npx', ['vite', 'preview', '--port', '4319', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let bad = 0;
  try {
    const pg = await br.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto('http://localhost:4319/');
    for (const f of files) {
      const t = Date.now();
      await pg.setInputFiles('#file', f);
      await pg.waitForFunction(() => +document.documentElement.dataset.drawn > 0 && !document.getElementById('btnPlay').disabled, null, { timeout: 60000 });
      const info = await pg.evaluate(() => ({ drawn: +document.documentElement.dataset.drawn, measures: __studio.score.measures.length, parts: __studio.score.parts.length, insts: Object.values(__studio.lines).map(l => l.inst) }));
      const tDraw = Date.now() - t;
      await pg.click('#btnPlay');
      await pg.waitForFunction(() => __studio.rendered && !document.getElementById('audio').paused, null, { timeout: 240000 });
      await pg.waitForTimeout(1500);
      const pl = await pg.evaluate(() => ({ notes: __studio.rendered.plan.notes.length, total: __studio.rendered.plan.total, cur: document.getElementById('audio').currentTime, now: document.querySelectorAll('g.measure.now').length, banks: Object.keys(document.documentElement.dataset).filter(k => k.startsWith('bank')) }));
      await pg.screenshot({ path: `/tmp/studio-${path.basename(f)}.png` });
      await pg.click('#btnStop');
      const ok = info.drawn === info.measures && pl.notes > 0 && pl.cur > 0.5 && pl.now === 1;
      if (!ok) bad++;
      console.log(ok ? 'ok ' : 'BAD', path.basename(f), JSON.stringify({ ...info, tDraw, ...pl }));
    }
    if (errs.length) { bad++; console.log('오류:', errs.slice(0, 5)); }
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
