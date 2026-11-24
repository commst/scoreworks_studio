// 화면 시험: 율명·구음 보기 — 장구 구음 자동, 구음 칸에 적기(Enter로 다음 음), 장구 정간보
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-gueum.cjs <장구 파트가 있는 총보>
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
(async () => {
  const srv = spawn('npx', ['vite', 'preview', '--port', '4326', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); let bad = 0; const ok = (c, m) => { console.log(c ? 'ok ' : 'BAD', m); if (!c) bad++; };
  try {
    const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.goto('http://localhost:4326/');
    const f = process.argv[2], tmp = '/tmp/gu' + path.extname(f); fs.copyFileSync(f, tmp);
    await pg.setInputFiles('#file', tmp);
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 300000 });
    const seq = () => pg.evaluate(() => document.documentElement.dataset.drawSeq);
    const waitDraw = async s0 => pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n && document.documentElement.dataset.drawnOk === 'true', s0, { timeout: 300000 });
    let s0 = await seq(); await pg.click('#modeSeg [data-mode="yul"]'); await waitDraw(s0);
    const words = await pg.evaluate(() => { const c = {}; document.querySelectorAll('#score text.yul').forEach(t => { c[t.textContent] = (c[t.textContent] || 0) + 1; }); return c; });
    const jg = ['덩', '쿵', '덕', '기덕', '더러러러'].map(w => `${w} ${words[w] || 0}`).join(', ');
    ok((words['덩'] || 0) + (words['덕'] || 0) + (words['쿵'] || 0) > 10, '장구 구음 자동: ' + jg);
    ok((words['황'] || 0) > 10, '선율 악기 율명: 황 ' + (words['황'] || 0));
    // 구음 칸: 첫 선율 파트(소금 등)의 첫 음을 고르고 두 개 적기
    const pi = await pg.evaluate(() => __studio.score.parts.findIndex(p => p.kind !== 'perc'));
    await pg.selectOption('#view', String(pi)); await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true');
    await pg.waitForTimeout(500);
    const id = await pg.evaluate(() => [...document.querySelectorAll('#score g.note')].map(g => g.getAttribute('data-id')).find(i => /-0$/.test(i)));
    const hb = await (await pg.$(`[data-id="${id}"] .notehead`)).boundingBox(); await pg.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
    // 파트 글자를 구음으로
    await pg.selectOption(`#tab-parts .pcard:nth-child(${pi + 1}) select.lab`, 'gu');
    await pg.click('#guIn'); await pg.keyboard.type('슬기둥'); s0 = await seq(); await pg.keyboard.press('Enter'); await waitDraw(s0);
    await pg.keyboard.type('당'); s0 = await seq(); await pg.keyboard.press('Enter'); await waitDraw(s0);
    const g2 = await pg.evaluate(() => __studio.score.parts.flatMap(p => p.measures.flatMap(m => m.events)).filter(e => (e.marks || []).some(k => k.k === 'gueum')).map(e => e.marks.find(k => k.k === 'gueum').text).join(','));
    const shown = await pg.evaluate(() => [...document.querySelectorAll('#score text.yul')].map(t => t.textContent).filter(t => t === '슬기둥' || t === '당').join(','));
    ok(g2 === '슬기둥,당' && shown === '슬기둥,당', `구음 적기(Enter로 다음 음) 저장 ${g2} · 화면 ${shown}`);
    // 장구 정간보
    const ji = await pg.evaluate(() => __studio.score.parts.findIndex(p => /장구|장고/.test(p.name)));
    s0 = await seq(); await pg.click('#modeSeg [data-mode="jg"]'); await waitDraw(s0);
    s0 = await seq(); await pg.selectOption('#view', String(ji)); await waitDraw(s0);
    const cells = await pg.evaluate(() => { const c = {}; document.querySelectorAll('.jg-sub').forEach(x => { const t = x.textContent; if (t) c[t] = (c[t] || 0) + 1; }); return c; });
    ok(Object.keys(cells).some(k => /덩|덕|쿵/.test(k)), '장구 정간보: ' + JSON.stringify(cells).slice(0, 120) + ' · ' + await pg.textContent('.jg-head span'));
    await pg.screenshot({ path: '/tmp/gu-jg.png' });
    s0 = await seq(); await pg.click('#modeSeg [data-mode="yul"]'); await waitDraw(s0);
    await pg.screenshot({ path: '/tmp/gu-yul.png' });
    ok(!errs.length, '콘솔 오류 ' + errs.slice(0, 3).join(' | '));
    await pg.click('#modeSeg [data-mode="staff"]');
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
