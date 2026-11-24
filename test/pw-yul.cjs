// 화면 시험: 율명 보기(오선 아래 율명 글자 수)·정간보 보기(행·칸)·정간보에서 재생 따라가기. 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-yul.cjs <파일>
const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs'), path = require('path');
(async () => {
  const srv = spawn('npx', ['vite', 'preview', '--port', '4325', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('http://localhost:4325/');
  const f = process.argv[2], tmp = '/tmp/yul' + path.extname(f); fs.copyFileSync(f, tmp);
  await pg.setInputFiles('#file', tmp);
  await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 300000 });
  let s0 = await pg.evaluate(() => document.documentElement.dataset.drawSeq);
  await pg.click('#modeSeg [data-mode="yul"]');
  await pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n && document.documentElement.dataset.drawnOk === 'true', s0, { timeout: 300000 });
  const ny = await pg.evaluate(() => document.querySelectorAll('#score text.yul').length);
  await pg.evaluate(() => { document.getElementById('score').scrollTop = 250; });
  await pg.screenshot({ path: '/tmp/yul1.png' });
  s0 = await pg.evaluate(() => document.documentElement.dataset.drawSeq);
  await pg.click('#modeSeg [data-mode="jg"]');
  await pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n, s0, { timeout: 60000 });
  const nj = await pg.evaluate(() => [document.querySelectorAll('.jg-col').length, document.querySelectorAll('.jg-sub').length, [...document.querySelectorAll('.jg-sub')].filter(x => x.textContent).length]);
  await pg.click('#btnPlay'); await pg.waitForFunction(() => !document.getElementById('audio').paused, null, { timeout: 120000 }); await pg.waitForTimeout(2500);
  const nowCol = await pg.evaluate(() => document.querySelectorAll('.jg-col.now').length);
  await pg.screenshot({ path: '/tmp/yul2.png' });
  console.log('yul labels', ny, 'jg cols/subs/filled', nj, 'now', nowCol, 'errs', errs);
  await br.close(); srv.kill();
})();
