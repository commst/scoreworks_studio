// 사용설명서 그림 찍기: 빌드한 앱(vite preview)에 예시곡(test/fixtures/demo.musicxml)을 열고 화면을 찍어 tools/manual/img/
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node tools/manual/mancap.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), IMG = path.join(__dirname, 'img');
(async () => {
  fs.mkdirSync(IMG, { recursive: true });
  const srv = spawn('npx', ['vite', 'preview', '--port', '4330', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const shot = async (name, clip) => { await pg.waitForTimeout(350); await pg.screenshot({ path: path.join(IMG, name + '.png'), ...(clip ? { clip } : {}) }); console.log('찍음', name); };
    const box = async sel => { const b = await (await pg.$(sel)).boundingBox(); return { x: Math.max(0, b.x - 4), y: Math.max(0, b.y - 4), width: b.width + 8, height: b.height + 8 }; };
    const seq = () => pg.evaluate(() => document.documentElement.dataset.drawSeq);
    const waitDraw = async s0 => pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n && document.documentElement.dataset.drawnOk === 'true', s0, { timeout: 120000 });
    await pg.goto('http://localhost:4330/');
    await pg.evaluate(() => { try { indexedDB.deleteDatabase('scoreworks-studio'); localStorage.clear(); } catch (e) { } });
    await pg.reload(); await pg.waitForTimeout(1200);
    await shot('01_start');
    await pg.setInputFiles('#file', path.join(ROOT, 'test/fixtures/demo.musicxml'));
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 120000 });
    await shot('02_main');
    await shot('03_topbar', await box('.topbar'));
    await shot('04_ribbon', await box('#editbar'));
    // 음 고르기
    const nb = await (await pg.$('[data-id="e0-1-0-0"] .notehead')).boundingBox();
    await pg.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await shot('05_select', { x: 300, y: 50, width: 980, height: 420 });
    await pg.keyboard.press('Escape');
    // 음표판에서 끌기(놓기 전)
    const cb = await (await pg.$('#palette [data-pal="1/8"]')).boundingBox();
    const tgt = await pg.evaluate(() => { const m = document.querySelectorAll('#score g.measure')[2]; const ps = [...m.querySelector('g.staff').children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect()); const r = m.getBoundingClientRect(); return { x: r.left + r.width * 0.62, y: ps[1].top + ps[1].height / 2 }; });
    await pg.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await pg.mouse.down();
    await pg.mouse.move(cb.x + 30, cb.y + 60, { steps: 4 }); await pg.mouse.move(tgt.x, tgt.y, { steps: 10 });
    await shot('06_drag', { x: 300, y: 50, width: 980, height: 420 });
    await pg.mouse.move(150, 600, { steps: 3 }); await pg.mouse.up();   // 악보 밖에 놓아 넣지 않음
    // 파트 칸
    await shot('07_parts', await box('.sidebar'));
    // 연주 막대(재생 중)
    await pg.click('#btnPlay'); await pg.waitForFunction(() => !document.getElementById('audio').paused, null, { timeout: 120000 }); await pg.waitForTimeout(2200);
    await shot('08_play');
    await shot('09_dock', await box('.dock'));
    await pg.click('#btnPlay'); await pg.click('#btnStop');
    // 율명·구음
    let s0 = await seq(); await pg.click('#modeSeg [data-mode="yul"]'); await waitDraw(s0);
    await shot('10_yul', { x: 300, y: 100, width: 980, height: 700 });
    await pg.click('.tab2[data-tab="look"]'); await shot('11_yul_tab', await box('.sidebar'));
    await pg.click('.tab2[data-tab="parts"]');
    // 구음 적기
    const nb2 = await (await pg.$('[data-id="e0-0-0-0"] .notehead')).boundingBox();
    await pg.mouse.click(nb2.x + nb2.width / 2, nb2.y + nb2.height / 2);
    await pg.selectOption('#tab-parts .pcard:nth-child(1) select.lab', 'gu');
    await pg.click('#guIn'); await pg.keyboard.type('나'); s0 = await seq(); await pg.keyboard.press('Enter'); await waitDraw(s0);
    await pg.keyboard.type('니'); s0 = await seq(); await pg.keyboard.press('Enter'); await waitDraw(s0);
    await pg.keyboard.type('나');
    await shot('12_gueum', { x: 0, y: 50, width: 1280, height: 400 });
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
    await pg.selectOption('#tab-parts .pcard:nth-child(1) select.lab', 'yul');
    // 정간보: 대금, 장구
    s0 = await seq(); await pg.click('#modeSeg [data-mode="jg"]'); await waitDraw(s0);
    await shot('13_jg', { x: 300, y: 100, width: 980, height: 620 });
    s0 = await seq(); await pg.selectOption('#view', '2'); await waitDraw(s0);
    await shot('14_jg_janggu', { x: 300, y: 100, width: 980, height: 520 });
    s0 = await seq(); await pg.selectOption('#view', '-1'); await waitDraw(s0);
    s0 = await seq(); await pg.click('#modeSeg [data-mode="staff"]'); await waitDraw(s0);
    // 사용법 · 이력 창
    await pg.click('#helpBtn'); await shot('15_help'); await pg.click('#helpClose');
    await pg.click('#histBtn'); await pg.waitForTimeout(300); await pg.click('#histView details summary'); await shot('16_hist'); await pg.keyboard.press('Escape');
    // 단축키 탭
    await pg.click('.tab2[data-tab="keys"]'); await shot('17_keys', await box('.sidebar'));
  } finally { await br.close(); srv.kill(); }
})();
