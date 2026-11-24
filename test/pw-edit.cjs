// 화면 시험: 음 누르기 → ↑ → 되돌리기 → 길이(8분) → 점 → 쉼표 → C → 보기(파트 하나). 그릴 때마다 걸린 시간
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-edit.cjs <파일>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
(async () => {
  const f = process.argv[2] || path.join(__dirname, 'fixtures/timeonly-tie.musicxml');
  const srv = spawn('npx', ['vite', 'preview', '--port', '4320', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); let bad = 0;
  const ok = (c, m) => { console.log(c ? 'ok ' : 'BAD', m); if (!c) bad++; };
  try {
    const pg = await br.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });   // 글꼴 CDN이 막힌 시험 환경은 빼고
    await pg.goto('http://localhost:4320/');
    const tmp = '/tmp/edit-' + Date.now() + path.extname(f); fs.copyFileSync(f, tmp);
    await pg.setInputFiles('#file', tmp);
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 180000 });
    const redraw = async () => { const t = Date.now(); await pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n, await pg.evaluate(() => document.documentElement.dataset.drawSeq), { timeout: 120000 }); return Date.now() - t; };
    // 첫 음(쉼표 아닌)
    const id = await pg.evaluate(() => { const g = [...document.querySelectorAll('#score g.note')].find(g => /^e\d+-\d+-\d+-0$/.test(g.getAttribute('data-id'))); return g && g.getAttribute('data-id'); });
    ok(!!id, '누를 음 ' + id);
    const [pi, mi, ei] = id.slice(1).split('-').map(Number);
    const pitch = () => pg.evaluate(([pi, mi, ei]) => { const e = __studio.score.parts[pi].measures[mi].events[ei]; return e && e.notes ? e.notes.map(n => n.step + n.alter + n.oct).join() : 'rest'; }, [pi, mi, ei]);
    const p0 = await pitch();
    await pg.click(`[data-id="${id}"] .notehead`);
    ok(await pg.evaluate(() => document.querySelectorAll('#score g.sel').length > 0) && /마디/.test(await pg.textContent('#selInfo')), '선택 표시: ' + await pg.textContent('#selInfo'));
    let t = redraw(); await pg.keyboard.press('ArrowUp'); const t1 = await t;
    const p1 = await pitch(); ok(p1 !== p0, `↑ ${p0} → ${p1} (다시 그리기 ${t1}ms)`);
    ok(await pg.evaluate(() => document.querySelectorAll('#score g.sel').length > 0), '고친 뒤에도 선택 유지');
    t = redraw(); await pg.keyboard.press('Control+z'); await t;
    ok(await pitch() === p0, '되돌리기 ' + await pitch());
    t = redraw(); await pg.keyboard.press('Control+y'); await t;
    ok(await pitch() === p1, '다시 ' + await pitch());
    await pg.click(`[data-id="${id}"] .notehead`);
    t = redraw(); await pg.keyboard.press('4'); await t;
    ok(/8분음표/.test(await pg.textContent('#selInfo')), '길이 8분: ' + await pg.textContent('#selInfo'));
    t = redraw(); await pg.keyboard.press('.'); await t;
    ok(/점8분음표/.test(await pg.textContent('#selInfo')), '점: ' + await pg.textContent('#selInfo'));
    t = redraw(); await pg.keyboard.press('Delete'); await t;
    ok(/쉼표/.test(await pg.textContent('#selInfo')), '쉼표로: ' + await pg.textContent('#selInfo'));
    t = redraw(); await pg.keyboard.press('c'); await t;
    ok(/C/.test(await pg.textContent('#selInfo')), 'C 입력: ' + await pg.textContent('#selInfo'));
    await pg.keyboard.press('ArrowRight');
    ok(/마디/.test(await pg.textContent('#selInfo')), '→ ' + await pg.textContent('#selInfo'));
    const nParts = await pg.evaluate(() => __studio.score.parts.length);
    if (nParts > 1) { t = redraw(); await pg.selectOption('#view', '0'); const tv = await t; ok(await pg.evaluate(() => __studio.view === 0), `파트 하나 보기 (${tv}ms)`); }
    // MusicXML 저장이 고친 악보로
    const dl = pg.waitForEvent('download'); await pg.click('#btnXml'); const d = await dl; const x = fs.readFileSync(await d.path(), 'utf8');
    ok(x.includes('<score-partwise') && !x.includes(' id="e'), 'MusicXML 저장(음 id 없이)');
    await pg.screenshot({ path: '/tmp/studio-edit.png' });
    ok(!errs.length, '콘솔 오류 ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
