// 화면 시험: 음표판에서 끌어 넣기, 넣기 상태로 눌러 넣기, 음을 위로 끌어 높이 바꾸기, 옆으로 끌어 옮기기, 되돌리기
// 실행: npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-drag.cjs <파일>
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
(async () => {
  const f = process.argv[2] || path.join(__dirname, 'fixtures/timeonly-tie.musicxml');
  const srv = spawn('npx', ['vite', 'preview', '--port', '4324', '--strictPort'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const br = await chromium.launch(); let bad = 0;
  const ok = (c, m) => { console.log(c ? 'ok ' : 'BAD', m); if (!c) bad++; };
  try {
    const pg = await br.newPage({ viewport: { width: 1280, height: 860 } });
    const errs = []; pg.on('pageerror', e => errs.push(String(e))); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.goto('http://localhost:4324/');
    const tmp = '/tmp/drag-' + Date.now() + path.extname(f); fs.copyFileSync(f, tmp);
    await pg.setInputFiles('#file', tmp);
    await pg.waitForFunction(() => document.documentElement.dataset.drawnOk === 'true', null, { timeout: 180000 });
    const seq = () => pg.evaluate(() => document.documentElement.dataset.drawSeq);
    const waitDraw = async s0 => pg.waitForFunction(n => document.documentElement.dataset.drawSeq !== n, s0, { timeout: 60000 });
    const notesIn = mi => pg.evaluate(mi => __studio.score.parts[0].measures[mi].events.filter(e => !e.rest).map(e => `${e.t[0]}/${e.t[1]}:${e.notes.map(n => n.step + n.oct).join('.')}`).join(' '), mi);
    // 1) 4마디(온음표) 가운데쯤 3번째 줄(B4 근처)에 8분음표 끌어 넣기
    const m3 = await pg.evaluate(() => { const m = document.querySelectorAll('#score g.measure')[3]; const st = m.querySelector('g.staff'); const ps = [...st.children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect()); const r = m.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: ps[2].top + ps[2].height / 2 }; });
    const before = await notesIn(3);
    const chip = await pg.$('#palette [data-pal="1/8"]'); const cb = await chip.boundingBox();
    let s0 = await seq();
    await pg.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2); await pg.mouse.down();
    await pg.mouse.move(cb.x + 40, cb.y + 60, { steps: 5 }); await pg.mouse.move(m3.x, m3.y, { steps: 10 });
    const lab = await pg.evaluate(() => document.querySelector('.ghost .lab').textContent);
    await pg.mouse.up(); await waitDraw(s0);
    const after = await notesIn(3);
    ok(after !== before && /B4/.test(after), `끌어 넣기 (표시 "${lab}") ${before} → ${after}`);
    // 2) 넣은 음을 위로 두 칸(온음 2) 끌기
    const id = await pg.evaluate(() => { const e = __studio.score.parts[0].measures[3].events; const i = e.findIndex(x => x.notes && x.notes[0].step === 'B'); return `e0-3-${i}-0`; });
    const nb = await (await pg.$(`[data-id="${id}"] .notehead`)).boundingBox();
    const sp = await pg.evaluate(() => { const ps = [...document.querySelectorAll('#score g.measure')[3].querySelector('g.staff').children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect().top); return (Math.max(...ps) - Math.min(...ps)) / 4; });
    s0 = await seq();
    await pg.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await pg.mouse.down();
    await pg.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2 - sp, { steps: 8 }); await pg.mouse.up(); await waitDraw(s0);
    const up = await notesIn(3);
    ok(/D5/.test(up) && !/B4/.test(up), '위로 끌어 높이 바꾸기 ' + up);
    // 3) 옆으로(오른쪽 끝 쪽) 끌어 옮기기
    const id2 = await pg.evaluate(() => { const e = __studio.score.parts[0].measures[3].events; const i = e.findIndex(x => x.notes && x.notes[0].step === 'D' && x.notes[0].oct === 5 && x.t[0] !== 0); return `e0-3-${i}-0`; });
    const nb2 = await (await pg.$(`[data-id="${id2}"] .notehead`)).boundingBox();
    const mr = await pg.evaluate(() => { const r = document.querySelectorAll('#score g.measure')[3].getBoundingClientRect(); return { r: r.right }; });
    s0 = await seq();
    await pg.mouse.move(nb2.x + nb2.width / 2, nb2.y + nb2.height / 2); await pg.mouse.down();
    await pg.mouse.move(mr.r - 30, nb2.y + nb2.height / 2, { steps: 10 }); await pg.mouse.up(); await waitDraw(s0);
    const moved = await notesIn(3);
    ok(moved !== up && /D5/.test(moved), '옆으로 옮기기 ' + up + ' → ' + moved);
    // 4) 넣기 상태: 4분음표 단추를 누르고 2마디를 누름
    await pg.keyboard.press('Escape');
    await pg.click('#palette [data-pal="1/4"]');
    ok(/넣습니다/.test(await pg.textContent('#selInfo')), '넣기 상태 안내: ' + await pg.textContent('#selInfo'));
    const m1 = await pg.evaluate(() => { const m = document.querySelectorAll('#score g.measure')[1]; const st = m.querySelector('g.staff'); const ps = [...st.children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect()); const r = m.getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: ps[4].top + ps[4].height / 2 }; });
    const b1 = await notesIn(1); s0 = await seq();
    await pg.mouse.click(m1.x, m1.y); await waitDraw(s0);
    const a1 = await notesIn(1);
    ok(a1 !== b1 && /E4/.test(a1), '눌러 넣기 ' + b1 + ' → ' + a1);
    await pg.keyboard.press('Escape');
    // 5) 되돌리기 네 번 → 처음과 같음
    for (let i = 0; i < 4; i++) { s0 = await seq(); await pg.keyboard.press('Control+z'); await waitDraw(s0); }
    ok(await notesIn(3) === before && await notesIn(1) === b1, '되돌리기로 처음대로');
    // 6) 음을 악보 밖(왼쪽 칸)으로 끌어 지우기
    const nb0 = await (await pg.$('[data-id="e0-0-0-0"] .notehead')).boundingBox();
    s0 = await seq();
    await pg.mouse.move(nb0.x + nb0.width / 2, nb0.y + nb0.height / 2); await pg.mouse.down();
    await pg.mouse.move(150, 500, { steps: 10 });
    const dl = await pg.evaluate(() => document.querySelector('.ghost .lab').textContent);
    await pg.mouse.up(); await waitDraw(s0);
    ok((await notesIn(0)) === '', `밖으로 끌어 지우기 (표시 "${dl}")`);
    // 7) 음을 고르고 휴지통 단추
    const b2 = await notesIn(2);
    const hb = await (await pg.$('[data-id="e0-2-0-0"] .notehead')).boundingBox(); await pg.mouse.click(hb.x + hb.width / 2, hb.y + hb.height / 2);   // 속이 빈 머리 가운데를 눌러도 잡히는지
    s0 = await seq(); await pg.click('#editbar [data-ed="del"]'); await waitDraw(s0);
    const a2 = await notesIn(2);
    ok(a2 !== b2 && a2.split(' ').length === b2.split(' ').length - 1, '휴지통 단추로 지우기 ' + b2 + ' → ' + a2);
    // 8) 둘째 성부로 넣기: 성부 2를 켜고 4마디(온음표)에 끌어 넣기
    await pg.keyboard.press('Escape');
    await pg.click('#voiceSeg [data-voice="2"]');
    const m4 = await pg.evaluate(() => { const m = document.querySelectorAll('#score g.measure')[3]; const ps = [...m.querySelector('g.staff').children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect()); const r = m.getBoundingClientRect(); return { x: r.left + r.width * 0.55, y: ps[4].top + ps[4].height / 2 }; });
    const cq = await (await pg.$('#palette [data-pal="1/4"]')).boundingBox();
    s0 = await seq();
    await pg.mouse.move(cq.x + cq.width / 2, cq.y + cq.height / 2); await pg.mouse.down(); await pg.mouse.move(m4.x, m4.y, { steps: 12 }); await pg.mouse.up(); await waitDraw(s0);
    const v2 = await pg.evaluate(() => __studio.score.parts[0].measures[3].events.filter(e => e.voice === 2 && !e.rest).map(e => e.notes.map(n => n.step + n.oct).join()).join());
    ok(/E4/.test(v2) && /D5/.test(await notesIn(3)), '둘째 성부 넣기 ' + v2 + ' / 첫 성부 ' + await notesIn(3));
    await pg.click('#voiceSeg [data-voice="1"]');
    // 9) 화음: Shift를 누른 채 3마디 첫 음 자리(아래 줄)에 놓기
    const nb3 = await pg.evaluate(() => { const g = document.querySelector('[data-id="e0-2-0-0"] .notehead') || document.querySelector('[data-id^="e0-2-"] .notehead'); const r = g.getBoundingClientRect(); const ps = [...g.closest('g.staff').children].filter(c => c.tagName === 'path').slice(0, 5).map(p => p.getBoundingClientRect()); return { x: r.left + r.width / 2, y: ps[4].top + ps[4].height / 2 }; });
    const b3 = await notesIn(2); s0 = await seq();
    await pg.mouse.move(cq.x + cq.width / 2, cq.y + cq.height / 2); await pg.keyboard.down('Shift'); await pg.mouse.down(); await pg.mouse.move(nb3.x, nb3.y, { steps: 12 }); await pg.mouse.up(); await pg.keyboard.up('Shift'); await waitDraw(s0);
    const a3 = await notesIn(2);
    ok(/\.E4|E4\./.test(a3), '화음 더하기 ' + b3 + ' → ' + a3);
    // 10) 마디 넣기·지우기
    const n0 = await pg.evaluate(() => __studio.score.measures.length);
    const anyNote = async mi => { const hb = await pg.evaluate(mi => { const g = [...document.querySelectorAll('#score [data-id^="e0-' + mi + '-"]')].find(x => x.classList.contains('note') || x.classList.contains('rest') || x.classList.contains('mRest')); const r = (g.querySelector('.notehead') || g).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, mi); await pg.mouse.click(hb.x, hb.y); };
    await anyNote(1);
    s0 = await seq(); await pg.click('#editbar [data-ms="after"]'); await waitDraw(s0);
    ok(await pg.evaluate(() => __studio.score.measures.length) === n0 + 1 && await pg.evaluate(() => document.querySelectorAll('#score g.measure').length) === n0 + 1, '마디 뒤에 넣기 → ' + (n0 + 1));
    await anyNote(0);
    s0 = await seq(); await pg.click('#editbar [data-ms="del"]'); await waitDraw(s0);
    ok(await pg.evaluate(() => __studio.score.measures.length) === n0 && await pg.evaluate(() => __studio.score.measures[0].time != null), '마디 지우기(첫 마디, 박자표는 다음 마디로)');
    s0 = await seq(); await pg.keyboard.press('Control+z'); await waitDraw(s0);
    s0 = await seq(); await pg.keyboard.press('Control+z'); await waitDraw(s0);
    ok(await pg.evaluate(() => __studio.score.measures.length) === n0, '마디 되돌리기');
    await pg.screenshot({ path: '/tmp/studio-drag.png' });
    ok(!errs.length, '콘솔 오류 ' + errs.slice(0, 3).join(' | '));
  } finally { await br.close(); srv.kill(); }
  process.exit(bad ? 1 : 0);
})();
