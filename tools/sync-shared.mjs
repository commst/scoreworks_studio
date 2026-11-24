// ScoreWorks 공통 모듈 가져오기: node tools/sync-shared.mjs [ScoreWorks 저장소 폴더]
// ScoreWorks(https://github.com/commst/scoreworks)의 해석기·재생 엔진·MusicXML 읽기·녹음을 그대로 복사한다.
// 공통 모듈은 여기서 고치지 않는다 — ScoreWorks에서 고친 뒤 이 도구로 다시 가져온다(두 프로그램이 같은 결과를 내도록).
// 가져온 판(커밋)은 shared/scoreworks/SYNC.json에 적는다.
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
const SRC = path.resolve(process.argv[2] || process.env.SCOREWORKS || '../scoreworks');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODULES = ['score-parser.js', 'outline-glyphs.js', 'outline-templates.js', 'audio-engine.js', 'melody-engine.js', 'musicxml.js', 'samples.json'];
if (!fs.existsSync(path.join(SRC, 'src/score-parser.js'))) { console.error('ScoreWorks 저장소를 찾을 수 없습니다: ' + SRC); process.exit(1); }
const out = path.join(ROOT, 'shared/scoreworks'), banks = path.join(ROOT, 'public/banks');
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(banks, { recursive: true });
for (const f of MODULES) fs.copyFileSync(path.join(SRC, 'src', f), path.join(out, f));
const bankFiles = fs.readdirSync(path.join(SRC, 'banks')).filter(f => /\.(mp3|json)$/.test(f));
for (const f of fs.readdirSync(banks)) if (!bankFiles.includes(f)) fs.unlinkSync(path.join(banks, f));
for (const f of bankFiles) fs.copyFileSync(path.join(SRC, 'banks', f), path.join(banks, f));
let commit = '?'; try { commit = execSync('git rev-parse --short HEAD', { cwd: SRC }).toString().trim(); } catch (e) {}
const sync = { from: 'https://github.com/commst/scoreworks', commit, date: new Date().toISOString().slice(0, 10), modules: MODULES, banks: bankFiles.filter(f => f.endsWith('.mp3')).map(f => f.replace(/\.mp3$/, '')) };
fs.writeFileSync(path.join(out, 'SYNC.json'), JSON.stringify(sync, null, 2) + '\n');
console.log(`ScoreWorks ${commit}에서 모듈 ${MODULES.length}개, 녹음 ${sync.banks.length}개를 가져왔습니다.`);
