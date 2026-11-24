// 사용설명서 PDF 만들기: tools/manual/manual.html + img/ → public/manual.pdf (사이트에서 ./manual.pdf로 받음)
// 글꼴(Pretendard·Outfit, 둘 다 OFL)은 저장소에 넣지 않고 FONTS 폴더에서 복사: /home/claude/work/fonts 에서
//   npm i pretendard@1.3.9 @fontsource-variable/outfit
// 실행: (그림을 바꿨으면 먼저 mancap.cjs) NODE_PATH=/opt/npm-tools/node_modules node tools/manual/mkpdf.cjs
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const SRC = __dirname, OUT = path.join(__dirname, '..', '..', 'public', 'manual.pdf'), B = '/tmp/studio-manual';
const FONTS = process.env.FONTS || '/home/claude/work/fonts/node_modules';
(async () => {
  fs.rmSync(B, { recursive: true, force: true }); fs.mkdirSync(path.join(B, 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'manual.html'), path.join(B, 'manual.html'));
  fs.cpSync(path.join(SRC, 'img'), path.join(B, 'img'), { recursive: true });
  for (const [f, to] of [['pretendard/dist/web/variable/woff2/PretendardVariable.woff2', 'PretendardVariable.woff2'], ['@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2', 'outfit-latin-wght-normal.woff2']]) {
    try { fs.copyFileSync(path.join(FONTS, f), path.join(B, 'fonts', to)); } catch (e) { console.warn('글꼴 없음(대신 Noto Sans CJK):', f); }
  }
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + path.join(B, 'manual.html')); await p.waitForTimeout(1500);
  await p.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#8a90a0;text-align:center;font-family:Noto Sans CJK KR">ScoreWorks Studio 사용설명서 · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' } });
  await b.close();
  console.log(OUT, Math.round(fs.statSync(OUT).size / 1024) + 'KB');
})();
