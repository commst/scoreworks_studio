// 화면 시험: 새 판 알림 — version.json이 더 새 판이면 안내가 뜨고, [새로 고침]은 고친 악보를 저장한 뒤 새로 고쳐 그대로 다시 엶. [나중에]는 닫음
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-update.cjs
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const path = require('path');
(async () => {
  const srv = spawn('npx', ['vite', 'preview', '--port', '4327', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); let bad = 0; const ok = (c, m) => { console.log(c ? 'ok ' : 'BAD', m); if (!c) bad++; };
  try {
    const pg = await br.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e)));
    let newer = false;
    await pg.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: newer ? '2999-01-01 00:00' : '2000-01-01 00:00' }) }));
    await pg.goto('http://localhost:4327/');
    await pg.setInputFiles('#file', path.join(__dirname, 'fixtures/demo.musicxml'));
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 120000 });
    await pg.evaluate(() => window.__checkUpdate(true)); await pg.waitForTimeout(300);
    ok(await pg.isHidden('#updateBar'), '같거나 옛 판이면 알림 없음');
    newer = true;
    await pg.evaluate(() => window.__checkUpdate(true)); await pg.waitForSelector('#updateBar:not([hidden])', { timeout: 5000 });
    ok(/새 판\(2999-01-01 00:00\)/.test(await pg.textContent('#updateText')), '알림: ' + (await pg.textContent('#updateText')).slice(0, 60));
    await pg.click('#updateLater'); ok(await pg.isHidden('#updateBar'), '나중에 → 닫힘');
    await pg.evaluate(() => window.__checkUpdate(true)); await pg.waitForTimeout(300);
    ok(await pg.isHidden('#updateBar'), '나중에 한 판은 다시 띄우지 않음');
    // 음 하나 고친 뒤(자동 저장 0.8초를 기다리지 않고) 새로 고침
    const hb = await (await pg.$('[data-id="e0-0-0-0"] .notehead')).boundingBox(); await pg.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await pg.keyboard.press('ArrowUp');
    const sig = () => pg.evaluate(() => __studio.score && JSON.stringify(__studio.score.parts[0].measures[0].events[0].notes));
    const s1 = await sig();
    await pg.evaluate(() => { document.getElementById('updateBar').hidden = false; document.getElementById('updateBar').dataset.v = '2999-01-02 00:00'; });
    await Promise.all([pg.waitForNavigation(), pg.click('#updateGo')]);
    ok(/\?v=2999-01-02/.test(decodeURIComponent(pg.url())), '새로 고침 주소 ' + decodeURIComponent(pg.url()));
    await pg.waitForFunction(() => window.__studio && __studio.score && document.documentElement.dataset.drawnOk === 'true', null, { timeout: 120000 });
    ok(await sig() === s1, '고친 악보를 그대로 다시 엶');
    ok(!errs.length, '오류 ' + errs.join(' | '));
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
