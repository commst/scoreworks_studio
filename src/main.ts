// ScoreWorks Studio — 첫 화면: MusicXML 열기 → .swc → 그리기(Verovio) → 국악기 녹음으로 재생
import { parseMusicXml } from './io/musicxml-in.ts';
import { unzipMxl } from './io/mxl.ts';
import { parsePdf } from './io/pdf-in.ts';
import { saveLast, loadLast, toSwcFile, fromSwcFile } from './io/store.ts';
import { toMusicXml, multiRestGroups } from './io/musicxml-out.ts';
import { engrave } from './view/engrave.ts';
import { renderScore, defaultInst, banksOf, loadBank, type PlayLine } from './play/player.ts';
// @ts-ignore
import { INSTRUMENTS } from '../shared/scoreworks/melody-engine.js';
import type { Score, Pitch } from './swc/model.ts';
import { transpose, setLetter, toRest, setDur, toggleDot, undo as undoEd, redo as redoEd, step as stepSel, refind, evOf, type Sel, type Edit } from './edit/ops.ts';
import type { Frac } from './swc/frac.ts';
import { typeOf } from './io/musicxml-out.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const INST: Record<string, any> = INSTRUMENTS;
const INST_OPTIONS = Object.entries(INST).filter(([k]) => !k.endsWith('_pizz')).map(([k, v]) => [k, String(v.name)]);

const state = {
  score: null as Score | null, fileName: '', zoom: 100,
  lines: {} as Record<string, PlayLine>,
  rendered: null as null | { sig: string; plan: any; url: string },
  warnings: [] as string[],
  view: -1,   // 보기: -1 총보, 0… 파트 하나
  sel: null as Sel | null, undo: [] as Edit[], redo: [] as Edit[],
  measureEls: [] as Element[], elOf: [] as number[],   // 마디(0부터) → 화면 마디 요소 번호 (여러 마디 쉼표는 한 요소)
};
(window as any).__studio = state;   // 시험용

function status(s: string) { $('status').textContent = s; }

// ── 열기 ──
const pick = () => $<HTMLInputElement>('file').click();
$('btnOpen').onclick = pick; $('btnOpen2').onclick = pick; $('tbSong').onclick = pick;
$<HTMLInputElement>('file').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) openFile(f); (e.target as HTMLInputElement).value = ''; };
const scoreEl = $('score');
scoreEl.addEventListener('dragover', e => { e.preventDefault(); scoreEl.classList.add('drag'); });
scoreEl.addEventListener('dragleave', () => scoreEl.classList.remove('drag'));
scoreEl.addEventListener('drop', e => { e.preventDefault(); scoreEl.classList.remove('drag'); const f = e.dataTransfer?.files[0]; if (f) openFile(f); });

async function openFile(f: File) {
  if (/\.pdf$/i.test(f.name)) return openPdf(f);
  if (/\.swc$/i.test(f.name)) { try { const { score, studio } = fromSwcFile(await f.text()); await openScore(score, (studio && studio.fileName) || f.name, [], studio); } catch (e: any) { alert('.swc 파일을 열지 못했습니다: ' + (e && e.message || e)); } return; }
  if (!/\.(musicxml|xml|mxl)$/i.test(f.name)) { alert('PDF, MusicXML(.musicxml, .xml, .mxl) 또는 .swc 악보를 여세요.'); return; }
  status('여는 중…');
  try { await openXml(/\.mxl$/i.test(f.name) ? unzipMxl(await f.arrayBuffer()) : await f.text(), f.name); }
  catch (e: any) { console.error(e); status(''); alert('악보를 읽지 못했습니다: ' + (e && e.message || e)); }
}

// PDF: ScoreWorks 해석기로 읽어 .swc로 (pdf.js는 처음 PDF를 열 때 받음)
let pdfjsP: Promise<any> | null = null;
function pdfjs() {
  if (!pdfjsP) pdfjsP = (async () => {
    const [lib, w] = await Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = (w as any).default;
    return lib;
  })();
  return pdfjsP;
}
async function openPdf(f: File) {
  status('PDF 여는 중…');
  try {
    const lib = await pdfjs();
    const { score, warnings } = await parsePdf(lib, new Uint8Array(await f.arrayBuffer()), (m, x) => status(m + (x != null ? ` ${Math.round(x * 100)}%` : '') + '…'), f.name);
    await openScore(score, f.name, warnings);
  } catch (e: any) { console.error(e); status(''); alert('PDF 악보를 읽지 못했습니다: ' + (e && e.message || e)); }
}

export async function openXml(xml: string, name = '') { return openScore(parseMusicXml(xml), name, []); }

async function openScore(score: Score, name: string, warnings: string[], restore?: { lines?: Record<string, any>; view?: number }) {
  document.documentElement.dataset.drawn = '0'; document.documentElement.dataset.drawnOk = 'false'; ($('btnPlay') as HTMLButtonElement).disabled = true;
  stop(); state.score = score; state.fileName = name.replace(/\.[^.]+$/, ''); state.rendered = null;
  state.lines = {};
  for (const p of score.parts) state.lines[p.id] = { inst: defaultInst(p), vol: 1, on: true, oct: 0, ...(restore && restore.lines && restore.lines[p.id] || {}) };
  const t0 = score.measures.find(m => m.tempo);
  if (t0 && t0.tempo) { $<HTMLInputElement>('bpm').value = String(t0.tempo.bpm); $<HTMLSelectElement>('unit').value = t0.tempo.unit; }
  state.warnings = warnings; state.sel = null; state.undo = []; state.redo = [];
  state.view = restore && restore.view != null && restore.view < score.parts.length ? restore.view : -1;
  autosave();
  viewUi(); partsUi(); infoUi(); $('editbar').hidden = false; editUi();
  const d = draw();   // 그리는 동안에도 재생·저장 가능
  for (const L of Object.values(state.lines)) for (const b of banksOf(L.inst)) loadBank(b);   // 녹음은 미리 받아 둔다
  ($('btnPlay') as HTMLButtonElement).disabled = false; ($('btnXml') as HTMLButtonElement).disabled = false; ($('btnSwc') as HTMLButtonElement).disabled = false;
  await d;
  document.title = (score.meta.title || state.fileName || '악보') + ' — ScoreWorks Studio';
  $('tbSongName').textContent = score.meta.title || state.fileName || '제목 없음';
  $('tbSongInfo').textContent = `${score.parts.length}파트 · ${score.measures.length}마디`;
}

// ── 그리기 ──
// 악보를 마디 조각으로 나눠 차례로 그린다: 큰 총보도 첫 조각이 바로 보이고, 음을 고치면 그 조각만 다시 그림
interface Chunk { from: number; to: number; el: HTMLDivElement }
let chunks: Chunk[] = [], drawTok = 0, mrNow = new Map<number, number>();
function chunkEnd(sc: Score, mr: Map<number, number>, a: number): number {
  const staves = sc.parts.reduce((n, p) => n + p.staves, 0), size = Math.max(4, Math.min(40, Math.round(200 / Math.max(1, staves))));
  const N = sc.measures.length;
  let b = Math.min(N, a + size);
  for (const [g, n] of mr) if (g < b && g + n > b) b = g + n;   // 여러 마디 쉼표를 자르지 않게
  if (N - b < size / 3) b = N;   // 끝에 너무 작은 조각이 남지 않게
  return b;
}
// 조각 그리기. decide: 마지막 단(줄)이 덜 찬 채 끝나지 않게, 마지막 단은 잘라 내고 다음 조각이 그 마디부터 시작
async function renderChunk(c: Chunk, sc: Score, w: number, decide: boolean) {
  const xml = toMusicXml(sc, { multiRest: mrNow.size > 0, ids: true, shortNames: true, pidx: state.view < 0 ? undefined : [state.view], from: c.from, to: c.to });
  const eng = await engrave(xml, { width: w, zoom: state.zoom, first: c.from === 0 });
  let h = ''; for (let p = 1; p <= eng.pages; p++) h += eng.svg(p);
  c.el.style.height = ''; c.el.innerHTML = h;
  if (!decide || c.to >= sc.measures.length) return;
  const sys = c.el.querySelectorAll('g.system');
  if (sys.length < 2) return;
  const last = sys[sys.length - 1], before = c.el.querySelectorAll('g.measure').length - last.querySelectorAll('g.measure').length;
  const k0 = state.elOf[c.from] + before, m = state.elOf.indexOf(k0);
  if (m <= c.from) return;
  const top = c.el.getBoundingClientRect().top, cut = last.getBoundingClientRect().top - top;
  last.remove(); c.to = m;
  c.el.style.height = Math.max(0, Math.round(cut)) + 'px';
}
function afterDraw() {
  state.measureEls = Array.from(scoreEl.querySelectorAll('g.measure'));
  cur = -1; showSel();
  document.documentElement.dataset.drawn = String(state.measureEls.length);
  document.documentElement.dataset.drawnOk = String(state.measureEls.length === (state.elOf.length ? state.elOf[state.elOf.length - 1] + 1 : 0));
  document.documentElement.dataset.drawSeq = String(++drawSeq);
}
async function draw() {
  if (!state.score) return;
  const tok = ++drawTok, t = performance.now();
  const w = scoreEl.clientWidth - 32, sc = viewScore();
  // 파트보(파트 하나)는 쉬는 마디들을 여러 마디 쉼표로 묶어 그린다(피날레 파트보처럼)
  mrNow = sc.parts.length === 1 ? multiRestGroups(sc) : new Map<number, number>();
  state.elOf = []; for (let i = 0, k = 0; i < sc.measures.length;) { const n = mrNow.get(i) || 1; for (let j = 0; j < n; j++) state.elOf[i + j] = k; i += n; k++; }
  const top = scoreEl.scrollTop, N = sc.measures.length;
  const sheet = document.createElement('div'); sheet.className = 'sheet';
  scoreEl.innerHTML = ''; scoreEl.appendChild(sheet);
  chunks = [];
  for (let a = 0, i = 0; a < N; i++) {
    const el = document.createElement('div'); el.className = 'chunk'; sheet.appendChild(el);
    const c: Chunk = { from: a, to: chunkEnd(sc, mrNow, a), el }; chunks.push(c);
    status(`악보 그리는 중 ${Math.round(a / N * 100)}%…`);
    await renderChunk(c, sc, w, true);
    if (tok !== drawTok) return;
    a = c.to;
    if (i === 0) scoreEl.scrollTop = top;
    if (i === 0 || performance.now() - t > 500 * (i + 1)) { afterDraw(); await new Promise(r => setTimeout(r, 0)); if (tok !== drawTok) return; }
  }
  scoreEl.scrollTop = top; afterDraw();
  status(`${state.score.measures.length}마디 · ${state.score.parts.length}파트 · ${((performance.now() - t) / 1000).toFixed(1)}초`);
}
// 고친 마디가 든 조각만 다시 그림(조각 나눔이 그대로일 때). 아니면 전체
async function redrawMeasures(mis: number[]) {
  if (!state.score || !chunks.length) return draw();
  const sc = viewScore(), mr = sc.parts.length === 1 ? multiRestGroups(sc) : new Map<number, number>();
  if (JSON.stringify([...mr]) !== JSON.stringify([...mrNow])) return draw();
  const tok = ++drawTok, w = scoreEl.clientWidth - 32, t = performance.now();
  for (const c of chunks.filter(c => mis.some(m => m >= c.from && m < c.to))) { await renderChunk(c, sc, w, false); if (tok !== drawTok) return; }
  afterDraw();
  status(`다시 그림 ${Math.round(performance.now() - t)}ms`);
}
// 보기: 총보 또는 파트 하나(파트 하나는 빨리 그려져 고치기 편함)
function viewScore(): Score { const sc = state.score!; return state.view < 0 ? sc : { ...sc, parts: [sc.parts[state.view]] }; }
function viewUi() {
  const v = $<HTMLSelectElement>('view');
  v.innerHTML = '<option value="-1">총보 (모든 파트)</option>' + state.score!.parts.map((p, i) => `<option value="${i}">${esc(p.name || p.id)}</option>`).join('');
  v.value = String(state.view); v.disabled = state.score!.parts.length < 2;
}
$<HTMLSelectElement>('view').onchange = () => { state.view = +$<HTMLSelectElement>('view').value; autosave(); if (state.sel && state.view >= 0 && state.sel.pi !== state.view) state.sel = null; editUi(); draw(); };
let resizeT = 0, drawSeq = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = window.setTimeout(draw, 300); });
function zoom(d: number) { state.zoom = Math.max(50, Math.min(200, state.zoom + d)); $('zoomLbl').textContent = state.zoom + '%'; draw(); }
$('zoomIn').onclick = () => zoom(10); $('zoomOut').onclick = () => zoom(-10);

// ── 왼쪽 탭 ──
document.querySelectorAll<HTMLButtonElement>('.tab2').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tab2').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
  $('tab-' + b.dataset.tab).classList.add('on');
});
function esc(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
// 악기 갈래(카드 왼쪽 띠 색): 관악·찰현·발현·타악·그 밖
const FAM: Record<string, [string, string]> = { wind: ['관악', 'var(--fam-wind)'], bow: ['찰현', 'var(--fam-bow)'], pluck: ['발현', 'var(--fam-pluck)'], perc: ['타악', 'var(--fam-perc)'], etc: ['그 밖', 'var(--fam-etc)'] };
function famOf(inst: string) {
  if (inst === 'perc') return 'perc';
  if (/daegeum|sogeum|piri|daepiri|taepyeongso|saenghwang|danso|flute|clar/.test(inst)) return 'wind';
  if (/haegeum|ajaeng|cello|violin|bass/.test(inst)) return 'bow';
  if (/gayageum|geomungo|yanggeum|harp/.test(inst)) return 'pluck';
  return 'etc';
}
function partsUi() {
  const box = $('tab-parts'); box.innerHTML = '';
  for (const p of state.score!.parts) {
    const L = state.lines[p.id], d = document.createElement('div');
    const paint = () => { const [fn, fc] = FAM[famOf(L.inst)]; d.style.setProperty('--fam', fc); (d.querySelector('.fam') as HTMLElement).textContent = fn; d.classList.toggle('off', !L.on); };
    d.className = 'pcard';
    const opts = (L.inst === 'perc' ? [['perc', '타악 (장구 소리)']] : INST_OPTIONS).map(([k, n]) => `<option value="${k}"${k === L.inst ? ' selected' : ''}>${esc(n)}</option>`).join('');
    d.innerHTML = `<div class="top"><span class="nm" title="${esc(p.name || p.id)}">${esc(p.name || p.id)}</span><span class="fam"></span><input class="switch" type="checkbox"${L.on ? ' checked' : ''} title="소리 켜기·끄기" aria-label="${esc(p.name)} 소리 켜기"></div>
      <select title="소리" aria-label="${esc(p.name)} 소리">${opts}</select>
      <div class="vol"><span>크기</span><input type="range" min="0" max="2" step="0.05" value="${L.vol}" aria-label="${esc(p.name)} 크기"><b>${Math.round(L.vol * 100)}%</b></div>`;
    const [on, sel, vol] = [d.querySelector('.switch') as HTMLInputElement, d.querySelector('select') as HTMLSelectElement, d.querySelector('input[type=range]') as HTMLInputElement];
    on.onchange = () => { L.on = on.checked; paint(); changed(); autosave(); };
    sel.onchange = () => { L.inst = sel.value; paint(); for (const b of banksOf(L.inst)) loadBank(b); changed(); autosave(); };
    vol.oninput = () => { (d.querySelector('.vol b') as HTMLElement).textContent = Math.round(+vol.value * 100) + '%'; };
    vol.onchange = () => { L.vol = +vol.value; changed(); autosave(); };
    box.appendChild(d); paint();
  }
}
function infoUi() {
  const m = state.score!.meta;
  $('tab-info').innerHTML = `<dl class="info"><dt>제목</dt><dd>${esc(m.title || '(없음)')}</dd>${m.composer ? `<dt>작곡</dt><dd>${esc(m.composer)}</dd>` : ''}${m.arranger ? `<dt>편곡</dt><dd>${esc(m.arranger)}</dd>` : ''}<dt>마디</dt><dd>${state.score!.measures.length}</dd><dt>파일</dt><dd>${esc(state.fileName)}</dd><dt>파트</dt><dd>${state.score!.parts.length}</dd>${state.warnings.length ? `<div class="wt">해석을 확인할 곳 ${state.warnings.length}</div><div class="warns">${state.warnings.slice(0, 200).map(w => `<div>${esc(w)}</div>`).join('')}</div>` : ''}</dl>`;
}
function changed() { if (playing()) { stop(); } }

// ── 음 고치기 ──
const DUR_NAME: Record<string, string> = { whole: '온음표', half: '2분음표', quarter: '4분음표', eighth: '8분음표', '16th': '16분음표', '32nd': '32분음표', '64th': '64분음표', '128th': '128분음표' };
const ACC_SIGN: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };
const pName = (n: Pitch) => n.step + ACC_SIGN[n.alter] + n.oct;
function durName(e: any) {
  const w: Frac = e.tuplet ? [e.dur[0] * e.tuplet.actual, e.dur[1] * e.tuplet.normal] : e.dur, t = typeOf(w);
  return t ? (t.dots ? '점'.repeat(t.dots) : '') + DUR_NAME[t.type] + (e.tuplet ? ` (${e.tuplet.actual}잇단)` : '') : '';
}
const idOf = (s: Sel) => `e${s.pi}-${s.mi}-${s.ei}-${s.ni || 0}`;
function showSel() {
  scoreEl.querySelectorAll('g.sel').forEach(x => x.classList.remove('sel'));
  const s = state.sel; if (!s) return;
  const e = evOf(state.score!, s); if (!e) return;
  const ids = s.ni != null || !e.notes ? [idOf(s)] : e.notes.map((_, i) => idOf({ ...s, ni: i }));
  let first: Element | null = null;
  for (const id of ids) { const el = scoreEl.querySelector(`[data-id="${id}"]`); if (el) { el.classList.add('sel'); first = first || el; } }
  if (first) { const r = first.getBoundingClientRect(), b = scoreEl.getBoundingClientRect(); if (r.top < b.top + 20 || r.bottom > b.bottom - 20) scoreEl.scrollBy({ top: r.top - b.top - b.height * 0.35 }); }
}
function editUi() {
  const s = state.sel, e = s && state.score ? evOf(state.score, s) : null, p = s ? state.score!.parts[s.pi] : null;
  $('selChip').classList.toggle('on', !!e);
  $('selInfo').textContent = !e ? '음을 누르면 고칠 수 있습니다' :
    `${p!.name} · ${state.score!.measures[s!.mi].number}마디 · ${e.rest ? '쉼표' : p!.kind === 'perc' ? '타악' : (s!.ni != null ? [e.notes![s!.ni]] : e.notes!).map(pName).join('·')} · ${e.measureRest ? '온마디' : durName(e)}`;
  document.querySelectorAll<HTMLButtonElement>('#editbar [data-ed], #editbar [data-dur]').forEach(b => b.disabled = !e);
  ($('undo') as HTMLButtonElement).disabled = !state.undo.length; ($('redo') as HTMLButtonElement).disabled = !state.redo.length;
}
let drawT = 0;
function afterEdit(ed: Edit, keep?: { staff: number; voice: number; t: Frac }) {
  if (!ed.length) return;
  state.undo.push(ed); if (state.undo.length > 200) state.undo.shift(); state.redo = [];
  edited(ed.map(c => c.mi), keep);
}
let dirtyMs = new Set<number>();
function edited(mis: number[], keep?: { staff: number; voice: number; t: Frac }) {
  if (keep && state.sel) state.sel = refind(state.score!, state.sel, keep.staff, keep.voice, keep.t);
  state.rendered = null; changed(); editUi(); autosave();
  for (const m of mis) dirtyMs.add(m);
  clearTimeout(drawT); drawT = window.setTimeout(() => { const m = [...dirtyMs]; dirtyMs = new Set(); redrawMeasures(m); }, 30);
}
function doEdit(f: (sc: Score, s: Sel) => Edit) {
  const s = state.sel; if (!s || !state.score) return;
  const e = evOf(state.score, s); if (!e) return;
  const keep = { staff: e.staff, voice: e.voice, t: e.t };
  afterEdit(f(state.score, s), keep);
}
function undoRedo(u: boolean) {
  const from = u ? state.undo : state.redo, to = u ? state.redo : state.undo, ed = from.pop(); if (!ed) return;
  (u ? undoEd : redoEd)(state.score!, ed); to.push(ed);
  state.sel = null; edited(ed.map(c => c.mi));
}
$('undo').onclick = () => undoRedo(true); $('redo').onclick = () => undoRedo(false);
const parseDur = (v: string): Frac => { const [a, b] = v.split('/').map(Number); return [a, b]; };
document.querySelectorAll<HTMLButtonElement>('#editbar [data-dur]').forEach(b => b.onclick = () => doEdit((sc, s) => setDur(sc, s, parseDur(b.dataset.dur!))));
const ED: Record<string, (sc: Score, s: Sel) => Edit> = {
  up: (sc, s) => transpose(sc, s, 1), down: (sc, s) => transpose(sc, s, -1), oup: (sc, s) => transpose(sc, s, 12), odown: (sc, s) => transpose(sc, s, -12),
  dot: toggleDot, rest: toRest,
};
document.querySelectorAll<HTMLButtonElement>('#editbar [data-ed]').forEach(b => b.onclick = () => doEdit(ED[b.dataset.ed!]));
// 음 누르기: Verovio가 옮긴 id(e파트-마디-사건-음)
scoreEl.addEventListener('click', ev => {
  let g = (ev.target as Element).closest('g.note, g.rest, g.mRest, g.multiRest');
  if (!g) {   // 음 바로 옆을 눌러도: 12px 안의 가장 가까운 음·쉼표
    let bd = 12;
    for (const x of scoreEl.querySelectorAll('g.note, g.rest, g.mRest')) {
      const r = x.getBoundingClientRect();
      const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom), d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; g = x; }
    }
  }
  const id = g && g.getAttribute('data-id'), m = id && /^e(\d+)-(\d+)-(\d+)-(\d+)$/.exec(id);
  if (!m) { if (state.sel) { state.sel = null; showSel(); editUi(); } return; }
  const s: Sel = { pi: +m[1], mi: +m[2], ei: +m[3] }, e = evOf(state.score!, s);
  // 화음: 같은 음을 다시 누르면 그 음 하나만
  if (e && e.notes && e.notes.length > 1 && state.sel && state.sel.pi === s.pi && state.sel.mi === s.mi && state.sel.ei === s.ei && state.sel.ni == null) s.ni = +m[4];
  state.sel = s; showSel(); editUi();
});
const DUR_KEY: Record<string, Frac> = { '1': [1, 64], '2': [1, 32], '3': [1, 16], '4': [1, 8], '5': [1, 4], '6': [1, 2], '7': [1, 1] };
document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLElement;
  if (!state.score || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'checkbox' && (t as HTMLInputElement).type !== 'range') return;
  const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key;
  if (ctrl && (k === 'z' || k === 'Z')) { ev.preventDefault(); undoRedo(!ev.shiftKey); return; }
  if (ctrl && (k === 'y' || k === 'Y')) { ev.preventDefault(); undoRedo(false); return; }
  if (!state.sel) return;
  let f: ((sc: Score, s: Sel) => Edit) | null = null;
  if (k === 'ArrowUp') f = ctrl ? ED.oup : ED.up;
  else if (k === 'ArrowDown') f = ctrl ? ED.odown : ED.down;
  else if (k === 'ArrowLeft' || k === 'ArrowRight') { const n = stepSel(state.score, state.sel, k === 'ArrowRight' ? 1 : -1); if (n) { state.sel = n; showSel(); editUi(); } ev.preventDefault(); return; }
  else if (k === 'Escape') { state.sel = null; showSel(); editUi(); return; }
  else if (k === 'Delete' || k === 'Backspace') f = toRest;
  else if (k === '.') f = toggleDot;
  else if (!ctrl && /^[a-gA-G]$/.test(k)) { const st = k.toUpperCase() as Pitch['step']; f = (sc, s) => setLetter(sc, s, st); }
  else if (!ctrl && DUR_KEY[k]) { const d = DUR_KEY[k]; f = (sc, s) => setDur(sc, s, d); }
  if (f) { ev.preventDefault(); doEdit(f); }
});

// ── 재생 ──
const audio = $<HTMLAudioElement>('audio');
const playing = () => !audio.paused;
function playOpts() {
  return { lines: state.lines, speed: +$<HTMLInputElement>('speed').value / 100, bpm: +$<HTMLInputElement>('bpm').value || 90,
    unit: $<HTMLSelectElement>('unit').value as any, repeats: $<HTMLInputElement>('repeats').checked };
}
['bpm', 'unit', 'repeats'].forEach(id => $(id).addEventListener('change', changed));
// 속도: − / + (10%씩, 30~200%)
function setSpeed(v: number) { v = Math.max(30, Math.min(200, v)); $<HTMLInputElement>('speed').value = String(v); $('spdLbl').textContent = v + '%'; changed(); }
$('spdDn').onclick = () => setSpeed(+$<HTMLInputElement>('speed').value - 10);
$('spdUp').onclick = () => setSpeed(+$<HTMLInputElement>('speed').value + 10);
let building = false;
$('btnPlay').onclick = async () => {
  if (!state.score || building) return;
  if (playing()) { audio.pause(); setPlayBtn(); return; }
  const o = playOpts(), sig = JSON.stringify(o);
  if (!state.rendered || state.rendered.sig !== sig) {
    building = true; $('btnPlay').classList.add('busy');
    try {
      const r = await renderScore(state.score, { ...o, onProgress: f => status(`소리 만드는 중 ${Math.round(f * 100)}%`) });
      if (state.rendered) URL.revokeObjectURL(state.rendered.url);
      state.rendered = { sig, plan: r.plan, url: URL.createObjectURL(r.blob) };
      audio.src = state.rendered.url; status('');
    } catch (e: any) { console.error(e); status('소리를 만들지 못했습니다: ' + (e && e.message || e)); return; }
    finally { building = false; $('btnPlay').classList.remove('busy'); }
  }
  await audio.play(); setPlayBtn(); follow();
};
function stop() { audio.pause(); try { audio.currentTime = 0; } catch (e) { } setPlayBtn(); mark(-1); }
$('btnStop').onclick = stop;
audio.onended = () => { setPlayBtn(); mark(-1); };
function setPlayBtn() {
  const p = playing();
  $('playIcon').setAttribute('href', p ? '#i-pause' : '#i-play'); $('btnPlay').setAttribute('aria-label', p ? '멈춤' : '재생');
  ($('btnStop') as HTMLButtonElement).disabled = !state.rendered; showPos();
}
// 위치 표시: 마디·시간, 막대를 눌러 옮기기
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function showPos() {
  const d = audio.duration, t = audio.currentTime || 0;
  $('posBar').textContent = cur >= 0 && state.score ? `${state.score.measures[cur].number}마디` : playing() ? '재생 중' : t > 0 ? '멈춤' : '정지';
  $('posTime').textContent = d > 0 && isFinite(d) ? `${mmss(t)} / ${mmss(d)}` : '';
  $('seekFill').style.width = d > 0 && isFinite(d) ? (t / d * 100).toFixed(2) + '%' : '0';
}
audio.addEventListener('timeupdate', showPos);
$('seek').addEventListener('click', ev => {
  const d = audio.duration; if (!(d > 0) || !isFinite(d)) return;
  const r = $('seek').getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(d, (ev.clientX - r.left) / r.width * d)); showPos();
  if (!playing()) { const bt = state.rendered ? state.rendered.plan.barTimes as { t: number; idx: number }[] : []; let k = -1; for (let i = 0; i < bt.length && bt[i].t <= audio.currentTime; i++) k = i; mark(k >= 0 ? bt[k].idx : -1); showPos(); }
});
// Space: 재생·멈춤
document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLElement;
  if (ev.key !== ' ' || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName) || !state.score) return;
  ev.preventDefault(); $('btnPlay').click();
});

// 따라가기: 지금 소리 나는 마디를 빨갛게, 화면 밖이면 스크롤
let cur = -1;
function mark(i: number) {
  if (i === cur) return;
  if (cur >= 0 && state.measureEls[state.elOf[cur]]) state.measureEls[state.elOf[cur]].classList.remove('now');
  cur = i;
  const el = i >= 0 ? state.measureEls[state.elOf[i]] : null;
  if (!el) return;
  el.classList.add('now');
  const r = el.getBoundingClientRect(), s = scoreEl.getBoundingClientRect();
  if (r.top < s.top || r.bottom > s.bottom) scoreEl.scrollBy({ top: r.top - s.top - s.height * 0.25, behavior: 'smooth' });
}
function follow() {
  if (!playing() || !state.rendered) return;
  const bt = state.rendered.plan.barTimes as { t: number; idx: number }[], t = audio.currentTime;
  let k = -1; for (let i = 0; i < bt.length && bt[i].t <= t; i++) k = i;
  mark(k >= 0 ? bt[k].idx : -1); showPos();
  requestAnimationFrame(follow);
}

// ── MusicXML 저장 ──
$('btnXml').onclick = () => {
  if (!state.score) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toMusicXml(state.score)], { type: 'application/vnd.recordare.musicxml+xml' }));
  a.download = (state.fileName || state.score.meta.title || 'score') + '.musicxml'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ── 저장 ──
// 자동 저장: 고칠 때마다(0.8초 모아서) 이 브라우저에. 다음에 열면 '이어서 열기'
let saveT = 0;
function autosave() {
  clearTimeout(saveT);
  saveT = window.setTimeout(async () => {
    if (!state.score) return;
    const ok = await saveLast({ score: state.score, fileName: state.fileName, lines: state.lines, view: state.view, at: Date.now() });
    document.documentElement.dataset.saved = ok ? String(Date.now()) : 'fail';
  }, 800);
}
function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function saveSwc() {
  if (!state.score) return;
  download((state.fileName || state.score.meta.title || 'score') + '.swc', toSwcFile({ score: state.score, fileName: state.fileName, lines: state.lines, view: state.view }), 'application/json');
}
$('btnSwc').onclick = saveSwc;
document.addEventListener('keydown', ev => { if ((ev.ctrlKey || ev.metaKey) && (ev.key === 's' || ev.key === 'S')) { ev.preventDefault(); saveSwc(); } });
// 처음 화면: 지난번 악보 이어서 열기
(async () => {
  const last = await loadLast(); if (!last || state.score) return;
  const box = scoreEl.querySelector('.empty'); if (!box) return;
  const d = new Date(last.at), when = `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const p = document.createElement('p'); p.className = 'resume';
  p.innerHTML = `<button class="btn" id="btnResume" type="button">이어서 열기</button><span class="hint">${esc(last.score.meta.title || last.fileName || '악보')} · ${when}에 고친 것</span>`;
  box.appendChild(p);
  $('btnResume').onclick = () => openScore(last.score, last.fileName, [], { lines: last.lines, view: last.view });
})();
