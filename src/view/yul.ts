// 율명(12율)과 정간보 보기
// 율명: 황종을 어느 음으로 볼지(정악 E♭4 등)를 정하고, 소리 나는 높이(옮김 악기는 옮긴 뒤)를 율명으로.
// 옥타브: 하배(두 옥타브 아래) · 배 · (가운데) · 청 · 중청
import type { Score, Ev } from '../swc/model.ts';
import { midiOf } from '../swc/pitch.ts';
import { cmp, type Frac } from '../swc/frac.ts';

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
const soundMidi = (score: Score, pi: number, n: Parameters<typeof midiOf>[0]) => {
  const t = score.parts[pi].transpose;
  return midiOf(n) + (t ? 12 * (t.octave || 0) + (t.chromatic || 0) : 0);
};

// 오선보 위에 율명 적기: Verovio가 그린 음(id e파트-마디-사건-음)마다 그 오선 아래에. 붙임줄로 이어진 뒤 음은 적지 않음
export function annotateYul(root: Element, score: Score, o: YulOpts) {
  root.querySelectorAll('text.yul').forEach(t => t.remove());
  const NS = 'http://www.w3.org/2000/svg';
  const rows = new Map<Element, { x: number; key: string; names: string[] }[]>();
  root.querySelectorAll('g.note[data-id]').forEach(g => {
    const m = /^e(\d+)-(\d+)-(\d+)-(\d+)$/.exec(g.getAttribute('data-id') || ''); if (!m) return;
    const pi = +m[1], part = score.parts[pi]; if (!part || part.kind === 'perc') return;
    const e = part.measures[+m[2]]?.events[+m[3]], n = e && e.notes && e.notes[+m[4]];
    if (!e || !n || n.tieStop || e.grace) return;
    const st = g.closest('g.staff'), head = g.querySelector('.notehead') as SVGGraphicsElement | null;
    if (!st || !head) return;
    let bb: DOMRect; try { bb = head.getBBox(); } catch (err) { return; }
    const x = bb.x + bb.width / 2, key = m[1] + '-' + m[2] + '-' + m[3];
    const L = rows.get(st) || rows.set(st, []).get(st)!;
    let r = L.find(q => q.key === key); if (!r) { r = { x, key, names: [] }; L.push(r); }
    r.names.push(String(soundMidi(score, pi, n)));
  });
  for (const [st, L] of rows) {
    const ys = Array.from(st.children).filter(c => c.tagName.toLowerCase() === 'path').slice(0, 5)
      .map(p => { const mm = /M\s*[-\d.]+\s+([-\d.]+)/.exec(p.getAttribute('d') || ''); return mm ? +mm[1] : NaN; }).filter(v => isFinite(v));
    if (ys.length < 5) continue;
    const top = Math.min(...ys), bot = Math.max(...ys), sp = (bot - top) / 4;
    for (const r of L) {
      // 화음: 높은 음이 위로
      r.names.map(Number).sort((a, b) => b - a).forEach((mid, k) => {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('class', 'yul'); t.setAttribute('x', String(r.x)); t.setAttribute('y', String(bot + sp * (2.9 + k * 1.55)));
        t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', String(sp * 1.4));
        t.textContent = yulName(mid, o);
        st.appendChild(t);
      });
    }
  }
}

// ── 정간보 ──
// 한 줄(행) = 한 마디, 정간 하나 = 박자표 분모의 음 길이(4/4 → 4분음표, 12/8 → 8분음표) 또는 고른 단위.
// 정간 안에서 시작하는 음이 여럿이면 정간을 2·3·4·6칸으로 나눔. 음이 계속되는 칸은 비우고, 쉼표는 △
export interface JgOpts extends YulOpts { unit: Frac | null; staff: number }
const pick = (score: Score, pi: number, mi: number, staff: number): Ev[] =>
  (score.parts[pi].measures[mi]?.events || []).filter(e => e.staff === staff && e.voice === 1 && !e.grace && !e.hidden).sort((a, b) => cmp(a.t, b.t));
const toV = (f: Frac) => f[0] / f[1];

export function renderJeonggan(box: HTMLElement, score: Score, pi: number, o: JgOpts): HTMLElement[] {
  const part = score.parts[pi], cols: HTMLElement[] = [];
  box.innerHTML = '';
  const head = document.createElement('div'); head.className = 'jg-head';
  head.innerHTML = `<b></b><span></span>`;
  (head.querySelector('b') as HTMLElement).textContent = score.meta.title || '';
  (head.querySelector('span') as HTMLElement).textContent = `${part.name}${part.staves > 1 ? ` (${o.staff === 1 ? '윗' : '아랫'}줄)` : ''} · 정간보 · 황종 = ${noteNameOf(o.base)}`;
  box.appendChild(head);
  const grid = document.createElement('div'); grid.className = 'jg'; box.appendChild(grid);
  let time: [number, number] | undefined;
  score.measures.forEach((M, mi) => {
    if (M.time) time = M.time;
    const unit: Frac = o.unit || (time ? [1, time[1]] : [1, 4]);
    const lenV = toV(M.len), uV = toV(unit), n = Math.max(1, Math.round(lenV / uV + 0.499));
    const col = document.createElement('div'); col.className = 'jg-col';
    const no = document.createElement('div'); no.className = 'jg-no'; no.textContent = M.number; col.appendChild(no);
    const evs = part.kind === 'perc' ? [] : pick(score, pi, mi, o.staff);
    for (let j = 0; j < n; j++) {
      const a = j * uV, b = Math.min(lenV, (j + 1) * uV);
      const on = evs.filter(e => toV(e.t) >= a - 1e-9 && toV(e.t) < b - 1e-9);
      // 나눌 칸 수: 시작 자리가 모두 칸 경계에 오는 가장 작은 수
      let k = 1;
      for (const c of [1, 2, 3, 4, 6, 8]) { if (on.every(e => Math.abs(((toV(e.t) - a) / uV) * c - Math.round(((toV(e.t) - a) / uV) * c)) < 1e-6)) { k = c; break; } k = c; }
      const cell = document.createElement('div'); cell.className = 'jg-cell' + (j % 3 === 0 && n % 3 === 0 && n > 3 ? ' g3' : '');
      for (let q = 0; q < k; q++) {
        const sb = document.createElement('div'); sb.className = 'jg-sub';
        const e = on.find(e => Math.round(((toV(e.t) - a) / uV) * k) === q);
        if (e) {
          if (e.rest || !e.notes) sb.textContent = '△';
          else if (!e.notes.every(nn => nn.tieStop)) {
            const names = e.notes.filter(nn => !nn.tieStop).map(nn => soundMidi(score, pi, nn)).sort((x, y) => y - x).map(m => yulName(m, o));
            sb.innerHTML = names.map((s2, i) => `<span${i ? ' class="ch"' : ''}>${s2}</span>`).join('');
          }
        }
        cell.appendChild(sb);
      }
      col.appendChild(cell);
    }
    grid.appendChild(col); cols.push(col);
  });
  return cols;
}
const NN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteNameOf = (m: number) => NN[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
