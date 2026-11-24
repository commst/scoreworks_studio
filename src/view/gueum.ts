// 구음: 장구(덩·쿵·덕·기덕·더러러러)는 치는 자리로, 산조가야금(청·흥·둥·당·동·징·땅·지·찡·칭·쫑·쨍)은 줄 높이로 자동.
// 거문고·피리 등은 사람이 음마다 적은 구음(mark k='gueum')을 씀 — 자동으로 붙이면 틀리는 일이 많아서.
import type { Score, Ev, Part } from '../swc/model.ts';
import { midiOf } from '../swc/pitch.ts';
import { cmp, type Frac } from '../swc/frac.ts';

export type LabelMode = 'yul' | 'gu' | 'none';
export const isJanggu = (p: Part) => p.kind === 'perc' && /장구|장고|janggu|janggo/i.test(p.name);
export const isGayageum = (p: Part, inst: string) => inst === 'gayageum' || /가야금|가야|현금/.test(p.name);
export const manualGu = (e: Ev) => { const m = (e.marks || []).find(x => x.k === 'gueum' && x.text); return m ? m.text! : ''; };

// 장구: 한 시각에 치는 것들(모든 성부) → 구음
// 채편 = 첫 성부(또는 한 성부에 높이가 둘이면 높은 쪽), 북편 = 둘째 성부(또는 낮은 쪽). 꾸밈음 + 채편 = 기덕, 채편 트레몰로 = 더러러러
export function jangguAt(part: Part, evs: Ev[]): string {
  const sounding = evs.filter(e => !e.rest && e.notes && e.notes.length);
  if (!sounding.length) return '';
  const pitches = new Set(part.measures.flatMap(m => m.events).filter(e => e.voice === 1 && e.notes).flatMap(e => e.notes!.map(midiOf)));
  const split = pitches.size > 1 ? (Math.max(...pitches) + Math.min(...pitches)) / 2 : null;
  let chae = false, buk = false, grace = false, roll = false;
  for (const e of sounding) for (const n of e.notes!) {
    const side = e.voice >= 2 ? 'buk' : split != null && midiOf(n) < split ? 'buk' : 'chae';
    if (e.grace) { if (side === 'chae') grace = true; continue; }
    if (side === 'chae') { chae = true; if ((e.marks || []).some(m => m.k === 'tremolo' || m.k === 'trill')) roll = true; } else buk = true;
  }
  if (!chae && !buk) return '';
  if (roll && !buk) return '더러러러';
  if (chae && buk) return grace ? '기덩' : '덩';
  if (chae) return grace ? '기덕' : '덕';
  return '쿵';
}
// 장구 파트의 한 마디: 시각마다 [시각, 구음, 그 시각의 사건들]
export function jangguOnsets(part: Part, mi: number, staff = 0): { t: Frac; gu: string; evs: Ev[] }[] {
  const evs = (part.measures[mi]?.events || []).filter(e => !staff || e.staff === staff);
  const ts: Frac[] = [];
  for (const e of evs) if (!e.rest && e.notes && !e.grace && !ts.some(t => cmp(t, e.t) === 0)) ts.push(e.t);
  ts.sort(cmp);
  return ts.map(t => { const at = evs.filter(e => cmp(e.t, t) === 0); return { t, gu: jangguAt(part, at), evs: at }; }).filter(x => x.gu);
}

// 산조가야금 열두 줄: 징(6현) 기준 반음 거리. 지(8현)는 마1(+4)로(유파에 따라 바1)
export const SANJO_GU = ['청', '흥', '둥', '당', '동', '징', '땅', '지', '찡', '칭', '쫑', '쨍'];
const SANJO_OFF = [-17, -12, -10, -5, -3, 0, 2, 4, 7, 9, 12, 14];
// 높이 → 줄 구음. 줄 음과 같으면 그 줄, 아니면 바로 아래 줄을 눌러 올린 음(3반음 안)으로 보고 그 줄 + ˄ 표시
export function gayageumGu(midi: number, jing: number): string {
  let best = -1;
  for (let i = 0; i < 12; i++) if (jing + SANJO_OFF[i] <= midi) best = i;
  if (best < 0) return '';
  const d = midi - (jing + SANJO_OFF[best]);
  if (d === 0) return SANJO_GU[best];
  if (best === 11 && d > 3) return '';
  return d <= 3 ? SANJO_GU[best] + '˄' : '';
}
