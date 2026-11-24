// ScoreWorks Studio — 첫 화면: MusicXML 열기 → .swc → 그리기(Verovio) → 국악기 녹음으로 재생
import { parseMusicXml } from './io/musicxml-in.ts';
import { toMusicXml } from './io/musicxml-out.ts';
import { engrave, type Engraved } from './view/engrave.ts';
import { renderScore, defaultInst, banksOf, loadBank, type PlayLine } from './play/player.ts';
// @ts-ignore
import { INSTRUMENTS } from '../shared/scoreworks/melody-engine.js';
import type { Score } from './swc/model.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const INST: Record<string, any> = INSTRUMENTS;
const INST_OPTIONS = Object.entries(INST).filter(([k]) => !k.endsWith('_pizz')).map(([k, v]) => [k, String(v.name)]);

const state = {
  score: null as Score | null, fileName: '', zoom: 100, eng: null as Engraved | null,
  lines: {} as Record<string, PlayLine>,
  rendered: null as null | { sig: string; plan: any; url: string },
  measureEls: [] as Element[],
};
(window as any).__studio = state;   // 시험용

function status(s: string) { $('status').textContent = s; }

// ── 열기 ──
$('btnOpen').onclick = () => $<HTMLInputElement>('file').click();
$<HTMLInputElement>('file').onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) openFile(f); (e.target as HTMLInputElement).value = ''; };
const scoreEl = $('score');
scoreEl.addEventListener('dragover', e => { e.preventDefault(); scoreEl.classList.add('drag'); });
scoreEl.addEventListener('dragleave', () => scoreEl.classList.remove('drag'));
scoreEl.addEventListener('drop', e => { e.preventDefault(); scoreEl.classList.remove('drag'); const f = e.dataTransfer?.files[0]; if (f) openFile(f); });

async function openFile(f: File) {
  if (!/\.(musicxml|xml)$/i.test(f.name)) { alert('지금은 MusicXML(.musicxml, .xml)만 열 수 있습니다. PDF는 다음 단계에서 됩니다.'); return; }
  status('여는 중…');
  try { openXml(await f.text(), f.name); }
  catch (e: any) { console.error(e); status(''); alert('악보를 읽지 못했습니다: ' + (e && e.message || e)); }
}

export async function openXml(xml: string, name = '') {
  const score = parseMusicXml(xml);
  document.documentElement.dataset.drawn = '0'; ($('btnPlay') as HTMLButtonElement).disabled = true;
  stop(); state.score = score; state.fileName = name.replace(/\.[^.]+$/, ''); state.rendered = null;
  state.lines = {};
  for (const p of score.parts) state.lines[p.id] = { inst: defaultInst(p), vol: 1, on: true, oct: 0 };
  const t0 = score.measures.find(m => m.tempo);
  if (t0 && t0.tempo) { $<HTMLInputElement>('bpm').value = String(t0.tempo.bpm); $<HTMLSelectElement>('unit').value = t0.tempo.unit; }
  partsUi(); infoUi();
  await draw();
  for (const L of Object.values(state.lines)) for (const b of banksOf(L.inst)) loadBank(b);   // 녹음은 미리 받아 둔다
  ($('btnPlay') as HTMLButtonElement).disabled = false; ($('btnXml') as HTMLButtonElement).disabled = false;
  document.title = (score.meta.title || state.fileName || '악보') + ' — ScoreWorks Studio';
}

// ── 그리기 ──
async function draw() {
  if (!state.score) return;
  status('악보 그리는 중…');
  const t = performance.now();
  const w = scoreEl.clientWidth - 32;
  state.eng = await engrave(toMusicXml(state.score), { width: w, zoom: state.zoom });
  scoreEl.innerHTML = '';
  for (let p = 1; p <= state.eng.pages; p++) { const d = document.createElement('div'); d.className = 'page'; d.innerHTML = state.eng.svg(p); scoreEl.appendChild(d); }
  state.measureEls = Array.from(scoreEl.querySelectorAll('g.measure'));
  status(`${state.score.measures.length}마디 · ${state.score.parts.length}파트 · ${((performance.now() - t) / 1000).toFixed(1)}초`);
  document.documentElement.dataset.drawn = String(state.measureEls.length);
}
let resizeT = 0;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = window.setTimeout(draw, 300); });
function zoom(d: number) { state.zoom = Math.max(50, Math.min(200, state.zoom + d)); $('zoomLbl').textContent = state.zoom + '%'; draw(); }
$('zoomIn').onclick = () => zoom(10); $('zoomOut').onclick = () => zoom(-10);

// ── 왼쪽 탭 ──
document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button, .tab').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $('tab-' + b.dataset.tab).classList.add('on');
});
function esc(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }
function partsUi() {
  const box = $('tab-parts'); box.innerHTML = '';
  for (const p of state.score!.parts) {
    const L = state.lines[p.id], d = document.createElement('div'); d.className = 'part';
    const opts = (L.inst === 'perc' ? [['perc', '타악(장구 소리)']] : INST_OPTIONS).map(([k, n]) => `<option value="${k}"${k === L.inst ? ' selected' : ''}>${esc(n)}</option>`).join('');
    d.innerHTML = `<div class="nm"><input type="checkbox"${L.on ? ' checked' : ''} title="소리 켜기">${esc(p.name || p.id)}</div>
      <div class="row"><select title="소리">${opts}</select></div>
      <div class="row"><span class="hint">크기</span><input type="range" min="0" max="2" step="0.05" value="${L.vol}"></div>`;
    const [on, sel, vol] = [d.querySelector('input[type=checkbox]') as HTMLInputElement, d.querySelector('select') as HTMLSelectElement, d.querySelector('input[type=range]') as HTMLInputElement];
    on.onchange = () => { L.on = on.checked; changed(); };
    sel.onchange = () => { L.inst = sel.value; for (const b of banksOf(L.inst)) loadBank(b); changed(); };
    vol.onchange = () => { L.vol = +vol.value; changed(); };
    box.appendChild(d);
  }
}
function infoUi() {
  const m = state.score!.meta;
  $('tab-info').innerHTML = `<dl class="info"><dt>제목</dt><dd>${esc(m.title || '(없음)')}</dd>${m.composer ? `<dt>작곡</dt><dd>${esc(m.composer)}</dd>` : ''}${m.arranger ? `<dt>편곡</dt><dd>${esc(m.arranger)}</dd>` : ''}<dt>마디</dt><dd>${state.score!.measures.length}</dd><dt>파일</dt><dd>${esc(state.fileName)}</dd></dl>`;
}
function changed() { if (playing()) { stop(); } }

// ── 재생 ──
const audio = $<HTMLAudioElement>('audio');
const playing = () => !audio.paused;
function playOpts() {
  return { lines: state.lines, speed: +$<HTMLSelectElement>('speed').value / 100, bpm: +$<HTMLInputElement>('bpm').value || 90,
    unit: $<HTMLSelectElement>('unit').value as any, repeats: $<HTMLInputElement>('repeats').checked };
}
['bpm', 'unit', 'speed', 'repeats'].forEach(id => $(id).addEventListener('change', changed));
let building = false;
$('btnPlay').onclick = async () => {
  if (!state.score || building) return;
  if (playing()) { audio.pause(); setPlayBtn(); return; }
  const o = playOpts(), sig = JSON.stringify(o);
  if (!state.rendered || state.rendered.sig !== sig) {
    building = true; ($('btnPlay') as HTMLButtonElement).disabled = true;
    try {
      const r = await renderScore(state.score, { ...o, onProgress: f => status(`소리 만드는 중 ${Math.round(f * 100)}%`) });
      if (state.rendered) URL.revokeObjectURL(state.rendered.url);
      state.rendered = { sig, plan: r.plan, url: URL.createObjectURL(r.blob) };
      audio.src = state.rendered.url; status('');
    } catch (e: any) { console.error(e); status('소리를 만들지 못했습니다: ' + (e && e.message || e)); return; }
    finally { building = false; ($('btnPlay') as HTMLButtonElement).disabled = false; }
  }
  await audio.play(); setPlayBtn(); follow();
};
function stop() { audio.pause(); try { audio.currentTime = 0; } catch (e) { } setPlayBtn(); mark(-1); }
$('btnStop').onclick = stop;
audio.onended = () => { setPlayBtn(); mark(-1); };
function setPlayBtn() { $('btnPlay').textContent = playing() ? '❚❚ 멈춤' : '▶ 재생'; ($('btnStop') as HTMLButtonElement).disabled = !state.rendered; }

// 따라가기: 지금 소리 나는 마디를 빨갛게, 화면 밖이면 스크롤
let cur = -1;
function mark(i: number) {
  if (i === cur) return;
  if (cur >= 0 && state.measureEls[cur]) state.measureEls[cur].classList.remove('now');
  cur = i;
  const el = i >= 0 ? state.measureEls[i] : null;
  if (!el) return;
  el.classList.add('now');
  const r = el.getBoundingClientRect(), s = scoreEl.getBoundingClientRect();
  if (r.top < s.top || r.bottom > s.bottom) scoreEl.scrollBy({ top: r.top - s.top - s.height * 0.25, behavior: 'smooth' });
}
function follow() {
  if (!playing() || !state.rendered) return;
  const bt = state.rendered.plan.barTimes as { t: number; idx: number }[], t = audio.currentTime;
  let k = -1; for (let i = 0; i < bt.length && bt[i].t <= t; i++) k = i;
  mark(k >= 0 ? bt[k].idx : -1);
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
