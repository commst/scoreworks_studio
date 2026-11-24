// 율명(12율)·구음 글자와 정간보 보기
// 율명: 황종을 어느 음으로 볼지(정악 E♭4 등)를 정하고, 소리 나는 높이(옮김 악기는 옮긴 뒤)를 율명으로.
// 옥타브: 하배(두 옥타브 아래) · 배 · (가운데) · 청 · 중청. 구음은 gueum.ts
import type { Score, Ev, Pitch } from '../swc/model.ts';
import { midiOf } from '../swc/pitch.ts';
import { cmp, type Frac } from '../swc/frac.ts';
import { type LabelMode, isJanggu, isGayageum, manualGu, jangguOnsets, gayageumGu } from './gueum.ts';

export const YUL_KO = ['황', '대', '태', '협', '고', '중', '유', '임', '이', '남', '무', '응'];
export const YUL_HJ = ['黃', '大', '太', '夾', '姑', '仲', '蕤', '林', '夷', '南', '無', '應'];
const OCT_KO: Record<number, string> = { [-2]: '하배', [-1]: '배', 0: '', 1: '청', 2: '중청' };
const OCT_HJ: Record<number, string> = { [-2]: '下倍', [-1]: '倍', 0: '', 1: '淸', 2: '重淸' };

export interface YulOpts { base: number; hanja: boolean }   // base: 황종(가운데)의 MIDI 번호 — 정악 E♭4 = 63
export function yulName(midi: number, o: YulOpts): string {
  const d = midi - o.base, i = ((d % 12) + 12) % 12, oc = Math.floor(d / 12);
  const pre = (o.hanja ? OCT_HJ : OCT_KO)[oc];
  const nm = (o.hanja ? YUL_HJ : YUL_KO)[i];
  return pre != null ? pre + nm : (oc > 0 ? '↑' : '↓') + nm;   // 두 옥타브를 넘으면 화살표
}
export const soundMidi = (score: Score, pi: number, n: Pitch) => {
  const t = score.parts[pi].transpose;
  return midiOf(n) + (t ? 12 * (t.octave || 0) + (t.chromatic || 0) : 0);
};

// 파트마다 무엇을 적을지(율명·구음·없음)와 악기(가야금 구음용), 산조가야금 징 높이
export interface LabelCtx extends YulOpts { jing: number; sanjo: boolean; mode: (pi: number) => LabelMode; inst: (pi: number) => string }   // sanjo: 가야금을 산조 12현으로(25현은 전통 구음이 없어 사람이 적은 구음만)
// 선율 음 하나의 글자: 구음 모드에서 사람이 적은 구음이 있으면 그것(사건마다 한 번 — first일 때만), 가야금은 줄 구음, 그 밖은 없음
export function noteLabel(score: Score, pi: number, e: Ev, n: Pitch, first: boolean, c: LabelCtx): string {
  const mode = c.mode(pi), part = score.parts[pi];
  if (mode === 'none') return '';
  if (mode === 'yul') return yulName(soundMidi(score, pi, n), c);
  const man = manualGu(e);
  if (man) return first ? man : '';
  if (c.sanjo && isGayageum(part, c.inst(pi))) return gayageumGu(soundMidi(score, pi, n), c.jing);
  return '';
}

// 오선보 위에 글자 적기: Verovio가 그린 음(id e파트-마디-사건-음)마다 그 오선 아래에. 붙임줄로 이어진 뒤 음은 빼고, 화음은 높은 음이 위
export function annotateLabels(root: Element, score: Score, c: LabelCtx) {
  root.querySelectorAll('text.yul').forEach(t => t.remove());
  const NS = 'http://www.w3.org/2000/svg';
  type Row = { x: number; key: string; items: [number, string][] };
  const rows = new Map<Element, Row[]>();
  const put = (st: Element, key: string, x: number, sortKey: number, text: string) => {
    if (!text) return;
    const L = rows.get(st) || rows.set(st, []).get(st)!;
    let r = L.find(q => q.key === key); if (!r) { r = { x, key, items: [] }; L.push(r); }
    if (!r.items.some(it => it[1] === text && it[0] === sortKey)) r.items.push([sortKey, text]);
  };
  const jcache = new Map<string, { t: Frac; gu: string }[]>();
  root.querySelectorAll('g.note[data-id]').forEach(g => {
    const m = /^e(\d+)-(\d+)-(\d+)-(\d+)$/.exec(g.getAttribute('data-id') || ''); if (!m) return;
    const pi = +m[1], mi = +m[2], part = score.parts[pi]; if (!part) return;
    const e = part.measures[mi]?.events[+m[3]], n = e && e.notes && e.notes[+m[4]];
    if (!e || !n || e.grace) return;
    const st = g.closest('g.staff'), head = g.querySelector('.notehead') as SVGGraphicsElement | null;
    if (!st || !head) return;
    let bb: DOMRect; try { bb = head.getBBox(); } catch (err) { return; }
    const x = bb.x + bb.width / 2;
    if (part.kind === 'perc') {
      if (c.mode(pi) === 'none') return;
      // 장구: 같은 시각의 모든 성부를 묶어 구음 하나
      const key = `${pi}-${mi}-${e.t[0]}/${e.t[1]}`;
      let gu = manualGu(e);
      if (!gu && isJanggu(part)) {
        const ck = pi + '-' + mi; if (!jcache.has(ck)) jcache.set(ck, jangguOnsets(part, mi));
        gu = (jcache.get(ck)!.find(o => cmp(o.t, e.t) === 0) || { gu: '' }).gu;
      }
      put(st, key, x, 0, gu);
      return;
    }
    if (n.tieStop) return;
    put(st, `${pi}-${mi}-${m[3]}`, x, -soundMidi(score, pi, n), noteLabel(score, pi, e, n, +m[4] === 0, c));
  });
  for (const [st, L] of rows) {
    const ys = Array.from(st.children).filter(ch => ch.tagName.toLowerCase() === 'path').slice(0, 5)
      .map(p => { const mm = /M\s*[-\d.]+\s+([-\d.]+)/.exec(p.getAttribute('d') || ''); return mm ? +mm[1] : NaN; }).filter(v => isFinite(v));
    if (!ys.length) continue;
    const top = Math.min(...ys), bot = Math.max(...ys), sp = ys.length >= 5 ? (bot - top) / 4 : 180;
    for (const r of L) r.items.sort((a, b) => a[0] - b[0]).forEach(([, text], k) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'yul'); t.setAttribute('x', String(r.x)); t.setAttribute('y', String(bot + sp * (2.9 + k * 1.55)));
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', String(sp * 1.4));
      t.textContent = text;
      st.appendChild(t);
    });
  }
}

// ── 정간보 ──
// 한 줄(행) = 한 마디, 정간 하나 = 박자표 분모의 음 길이(4/4 → 4분음표, 12/8 → 8분음표) 또는 고른 단위.
// 정간 안에서 시작하는 음이 여럿이면 정간을 2·3·4·6·8칸으로 나눔. 음이 계속되는 칸은 비우고, 쉼표는 △.
// 선율 악기는 율명(구음 모드면 구음), 장구는 구음(덩·쿵·덕·기덕)
export interface JgOpts extends LabelCtx { unit: Frac | null; staff: number }
const toV = (f: Frac) => f[0] / f[1];
const NN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteNameOf = (m: number) => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const escH = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function renderJeonggan(box: HTMLElement, score: Score, pi: number, o: JgOpts): HTMLElement[] {
  const part = score.parts[pi], cols: HTMLElement[] = [], jang = isJanggu(part), mode = o.mode(pi);
  box.innerHTML = '';
  const head = document.createElement('div'); head.className = 'jg-head';
  head.innerHTML = `<b></b><span></span>`;
  (head.querySelector('b') as HTMLElement).textContent = score.meta.title || '';
  (head.querySelector('span') as HTMLElement).textContent = `${part.name}${part.staves > 1 ? ` (${o.staff === 1 ? '윗' : '아랫'}줄)` : ''} · 정간보 · ${jang ? '장구 구음' : mode === 'gu' ? '구음' : `율명 (황종 = ${noteNameOf(o.base)})`}`;
  box.appendChild(head);
  const grid = document.createElement('div'); grid.className = 'jg'; box.appendChild(grid);
  let time: [number, number] | undefined;
  score.measures.forEach((M, mi) => {
    if (M.time) time = M.time;
    const unit: Frac = o.unit || (time ? [1, time[1]] : [1, 4]);
    const lenV = toV(M.len), uV = toV(unit), n = Math.max(1, Math.round(lenV / uV + 0.499));
    const col = document.createElement('div'); col.className = 'jg-col';
    const no = document.createElement('div'); no.className = 'jg-no'; no.textContent = M.number; col.appendChild(no);
    // 이 마디의 시작 자리들: 시각, 글자들(높은 음부터), 쉼표인가
    type On = { t: number; names: string[]; rest: boolean; cont?: boolean };
    let ons: On[] = [];
    if (jang) ons = jangguOnsets(part, mi).map(x => ({ t: toV(x.t), names: [x.evs.map(manualGu).find(Boolean) || x.gu], rest: false }));
    else if (part.kind !== 'perc') {
      const evs = (part.measures[mi]?.events || []).filter(e => e.staff === o.staff && e.voice === 1 && !e.grace && !e.hidden).sort((a, b) => cmp(a.t, b.t));
      ons = evs.map(e => {
        if (e.rest || !e.notes) return { t: toV(e.t), names: [], rest: true };
        const ns = e.notes.map((nn, i) => ({ nn, i })).filter(x => !x.nn.tieStop).sort((a, b) => soundMidi(score, pi, b.nn) - soundMidi(score, pi, a.nn));
        const lab = (x: { nn: Pitch; i: number }) => noteLabel(score, pi, e, x.nn, x.i === 0, o) || (mode === 'yul' || mode === 'none' ? yulName(soundMidi(score, pi, x.nn), o) : '');
        return { t: toV(e.t), names: ns.map(lab).filter(Boolean), rest: false };
      });
    }
    for (let i = 1; i < ons.length; i++) if (ons[i].rest && ons[i - 1].rest) ons[i].cont = true;   // 이어지는 쉼표는 처음만 △
    for (let j = 0; j < n; j++) {
      const a = j * uV, b = Math.min(lenV, (j + 1) * uV);
      const on = ons.filter(x => x.t >= a - 1e-9 && x.t < b - 1e-9);
      let k = 1;
      for (const c of [1, 2, 3, 4, 6, 8]) { k = c; if (on.every(x => Math.abs(((x.t - a) / uV) * c - Math.round(((x.t - a) / uV) * c)) < 1e-6)) break; }
      const cell = document.createElement('div'); cell.className = 'jg-cell' + (j % 3 === 0 && n % 3 === 0 && n > 3 ? ' g3' : '');
      for (let q = 0; q < k; q++) {
        const sb = document.createElement('div'); sb.className = 'jg-sub';
        const x = on.find(x => Math.round(((x.t - a) / uV) * k) === q);
        if (x && x.rest && !x.cont) sb.textContent = '△';
        else if (x && !x.rest) sb.innerHTML = x.names.map((s2, i) => `<span${i ? ' class="ch"' : ''}>${escH(s2)}</span>`).join('');
        cell.appendChild(sb);
      }
      col.appendChild(cell);
    }
    grid.appendChild(col); cols.push(col);
  });
  return cols;
}
