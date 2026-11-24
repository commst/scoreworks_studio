// .swc → ScoreWorks 마디·음 사건 (브라우저 없이도 돌아감 — 시험에서 씀)
// @ts-ignore — 공통 모듈은 자바스크립트(ScoreWorks 그대로)
import { Fr } from '../../shared/scoreworks/score-parser.js';
// @ts-ignore
import { guessInstrument } from '../../shared/scoreworks/melody-engine.js';
import type { Score, Pitch, Part } from '../swc/model.ts';
import { add, ZERO, type Frac } from '../swc/frac.ts';

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midiOf = (p: Pitch) => 12 * (p.oct + 1) + STEP[p.step] + (p.alter || 0);
const F = (f: Frac) => new Fr(f[0], f[1]);

// 파트 이름으로 처음 소리 (ScoreWorks 줄 이름 규칙과 같음). 타악은 'perc'
export function defaultInst(p: Part): string {
  if (p.kind === 'perc') return 'perc';
  return guessInstrument(p.name || '') || 'gayageum';
}

export interface PlayLine { inst: string; vol: number; on: boolean; oct: number }

// .swc를 ScoreWorks 마디 목록으로: 줄 = 파트, 성부 = 오선(1 → R, 2 → L) — 타악은 성부(1 → R, 2 → L)
export function toEngineBars(score: Score) {
  let start: Frac = ZERO; const bars: any[] = [];
  let vol: number[] | null = null;
  score.measures.forEach((M, mi) => {
    if (M.ending && M.ending.type === 'start') vol = M.ending.num.split(/[,\s]+/).map(Number).filter(Boolean);
    const b: any = { number: +M.number || mi + 1, barLen: F(M.len), timesig: M.time ? M.time.join(',') : undefined, kind: 'normal', events: [], warnings: [],
      repeatStart: !!M.repeatStart, repeatEnd: !!M.repeatEnd, repeatTimes: M.repeatEnd ? M.repeatEnd + 1 : undefined, volta: vol || undefined, segno: !!M.segno };
    if (M.endingStop) vol = null;
    for (const p of score.parts) {
      const pm = p.measures[mi]; if (!pm) continue;
      for (const e of pm.events) {
        if (e.rest || !e.notes || !e.notes.length || e.grace) continue;
        const perc = p.kind === 'perc', voice = (perc ? e.voice : e.staff) > 1 ? 'L' : 'R';
        const tr = p.transpose ? 12 * (p.transpose.octave || 0) + (p.transpose.chromatic || 0) : 0;
        const ev: any = { t: F(e.t), dur: F(e.dur), voice, line: p.id };
        if (!perc) ev.midis = e.notes.map(n => midiOf(n) + tr);
        else { ev.pos = 4; if (e.notes.some(n => n.head === 'x' || n.head === 'cross')) ev.xh = true; }
        if (e.notes.every(n => n.tieStop)) ev.tie = true;   // 앞 음에서 붙임줄로 이어짐(소리를 새로 내지 않음)
        const mk = new Set((e.marks || []).map(m => m.k));
        if (mk.has('accent') || mk.has('marcato')) ev.accent = true;
        if (mk.has('staccato') || mk.has('staccatissimo')) ev.stacc = true;
        if (mk.has('tremolo')) ev.roll = true;
        if (mk.has('trill')) { ev.roll = true; ev.trill = true; }
        if (mk.has('nonghyeon') || mk.has('yoseong')) ev.vib = true;
        if (mk.has('pizz')) ev.pz = true;
        b.events.push(ev);
      }
    }
    bars.push(b); start = add(start, M.len);
  });
  return bars;
}

