// 화면 시험: 고친 뒤 자동 저장 → 새로 고침 → '이어서 열기'로 고친 그대로, .swc 저장 → 다시 열기 같음
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-save.cjs <파일>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
(async () => {
  const f = process.argv[2] || path.join(__dirname, 'fixtures/timeonly-tie.musicxml');
  const srv = spawn('npx', ['vite', 'preview', '--port', '4321', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); let bad = 0;
  const ok = (c, m) => { console.log(c ? 'ok ' : 'BAD', m); if (!c) bad++; };
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });   // 글꼴 CDN이 막힌 시험 환경은 빼고
    await pg.goto('http://localhost:4321/');
    const tmp = '/tmp/save-' + Date.now() + path.extname(f); fs.copyFileSync(f, tmp);
    await pg.setInputFiles('#file', tmp);
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 180000 });
    const id = await pg.evaluate(() => [...document.querySelectorAll('#score g.note')].map(g => g.getAttribute('data-id')).find(i => /-0$/.test(i)));
    await pg.click(`[data-id="${id}"] .notehead`);
    await pg.keyboard.press('ArrowUp'); await pg.keyboard.press('ArrowUp');
    await pg.selectOption('#view', { index: 0 }).catch(() => {});
    const sig = () => pg.evaluate(() => JSON.stringify(__studio.score));
    const s1 = await sig();
    await pg.waitForFunction(() => +document.documentElement.dataset.saved > 0, null, { timeout: 10000 });
    await pg.waitForTimeout(1200);
    await pg.reload();
    await pg.waitForSelector('#btnResume', { timeout: 10000 });
    ok(/고친 것/.test(await pg.textContent('.resume')), '이어서 열기 안내: ' + (await pg.textContent('.resume')).trim());
    await pg.click('#btnResume');
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 180000 });
    ok(await sig() === s1, '새로 고침 뒤 이어서 열기 = 고친 악보');
    const dl = pg.waitForEvent('download'); await pg.keyboard.press('Control+s'); const d = await dl;
    ok(/\.swc$/.test(d.suggestedFilename()), '.swc 저장 ' + d.suggestedFilename());
    const swc = '/tmp/save-' + Date.now() + '.swc'; fs.copyFileSync(await d.path(), swc);
    await pg.evaluate(() => { document.documentElement.dataset.drawnOk = 'false'; });
    await pg.setInputFiles('#file', swc);
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 180000 });
    ok(await sig() === s1, '.swc 다시 열기 = 같은 악보');
    ok(!errs.length, '콘솔 오류 ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
