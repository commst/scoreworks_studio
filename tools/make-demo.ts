// 예시 악보 만들기(저작권 없는 직접 만든 곡) — 사용설명서 그림과 시험용
// 실행: node tools/make-demo.ts → test/fixtures/demo.musicxml
// 대금(가락) · 가야금(큰보표, 25현 반주) · 장구(첫 성부 = 채편, 둘째 성부 = 북편), E♭ 평조(황종 = E♭4), 4/4 8마디
import { writeFileSync } from 'node:fs';
import type { Score, Ev, Pitch, Part, PartMeasure } from '../src/swc/model.ts';
import { notateVoice } from '../src/swc/notate.ts';
import type { Frac } from '../src/swc/frac.ts';
import { toMusicXml } from '../src/io/musicxml-out.ts';

const P = (s: string): Pitch => { const m = /^([A-G])(b|#)?(\d)$/.exec(s)!; return { step: m[1] as Pitch['step'], alter: m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0, oct: +m[3] }; };
const LEN: Frac = [1, 1], BEAT: Frac = [1, 4];
// 음 목록 [높이(들 '|'로 화음, 'r' 쉼표), 길이(8분 단위)] → 한 성부
function voice(staff: number, v: number, seq: [string, number, string?][]): Ev[] {
  const out: Ev[] = []; let t = 0;
  for (const [p, d, mk] of seq) {
    if (p !== 'r') {
      const e: Ev = { staff, voice: v, t: [t, 8], dur: [d, 8], notes: p.split('|').map(P) };
      if (mk === 'nong') e.marks = [{ k: 'nonghyeon' }];
      if (mk === 'grace') out.push({ staff, voice: v, t: [t, 8], dur: [0, 1], grace: 'acciaccatura', type: 'eighth', notes: p.split('|').map(P) });
      if (mk === 'acc') e.marks = [{ k: 'accent' }];
      out.push(e);
    }
    t += d;
  }
  return notateVoice(out, { len: LEN, beat: BEAT, fillRests: true, hideRests: v > 1 }).map(e => ({ ...e, staff, voice: v }));
}
const norm = (evs: Ev[]) => evs.map(e => ({ ...e, t: red(e.t), dur: red(e.dur) }));
function red(f: Frac): Frac { const g = (a: number, b: number): number => (b ? g(b, a % b) : a); const k = g(Math.abs(f[0]), f[1]) || 1; return [f[0] / k, f[1] / k]; }

// 대금 가락
const daegeum: [string, number, string?][][] = [
  [['Bb4', 2], ['C5', 2], ['Eb5', 4]],
  [['C5', 3], ['Bb4', 1], ['Ab4', 2], ['Bb4', 2]],
  [['C5', 4], ['Bb4', 2], ['Ab4', 2]],
  [['F4', 6, 'nong'], ['r', 2]],
  [['Ab4', 2], ['Bb4', 1], ['C5', 1], ['Eb5', 2], ['C5', 2]],
  [['Bb4', 4], ['Ab4', 2], ['F4', 2]],
  [['Eb4', 2], ['F4', 2], ['Ab4', 2], ['Bb4', 2]],
  [['Eb4', 8, 'nong']],
];
// 가야금: 윗줄 8분 펼침, 아랫줄 온음표
const roots = ['Eb', 'Ab', 'Eb', 'Bb', 'Ab', 'Eb', 'Bb', 'Eb'];
const fifth: Record<string, string> = { Eb: 'Bb', Ab: 'Eb', Bb: 'F' };
const gUp = roots.map((r, i) => i === 7 ? [[`${r}4|${fifth[r]}4|${r}5`, 8]] as [string, number][] :
  [[`${r}4`, 1], [`${fifth[r]}4`, 1], [`${r}5`, 1], [`${fifth[r]}4`, 1], [`${r}4`, 1], [`${fifth[r]}4`, 1], [`${r}5`, 1], [`${fifth[r]}4`, 1]] as [string, number][]);
const gDn = roots.map(r => [[`${r}${r === 'Eb' ? 3 : 2}`, 8]] as [string, number][]);
// 장구: 채편(첫 성부) · 북편(둘째 성부). 한 마디 = 덩 · 덕 쿵 · 덕 · 덕
const X = 'C5', B = 'F4', chae: [string, number, string?][][] = [], buk: [string, number, string?][][] = [];
for (let i = 0; i < 8; i++) {
  if (i === 7) { chae.push([[X, 8, 'acc']]); buk.push([[B, 8]]); continue; }
  chae.push([[X, 2, 'acc'], [X, 1], ['r', 1], [X, 2, i === 3 ? 'grace' : undefined], [X, 2]]);
  buk.push([[B, 2], ['r', 1], [B, 1], ['r', 4]]);
}

const N = 8, measures: Score['measures'] = [];
for (let i = 0; i < N; i++) measures.push({ number: String(i + 1), len: LEN, ...(i === 0 ? { time: [4, 4] as [number, number], key: -3, tempo: { bpm: 80, unit: 'q' as const } } : {}), ...(i === 4 ? { rehearsal: 'A' } : {}), ...(i === N - 1 ? { barline: 'final' as const } : {}) });
const pm = (f: (i: number) => Ev[]): PartMeasure[] => measures.map((_, i) => ({ events: norm(f(i)) }));
const parts: Part[] = [
  { id: 'P1', name: '대금', inst: 'daegeum', kind: 'pitched', staves: 1, clefs: [{ sign: 'G', line: 2 }], measures: pm(i => voice(1, 1, daegeum[i])) },
  { id: 'P2', name: '가야금', inst: 'gayageum', kind: 'pitched', staves: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }], measures: pm(i => [...voice(1, 1, gUp[i]), ...voice(2, 1, gDn[i])]) },
  { id: 'P3', name: '장구', inst: 'perc', kind: 'perc', staves: 1, clefs: [{ sign: 'percussion', line: 3 }], measures: pm(i => [...voice(1, 1, chae[i]), ...voice(1, 2, buk[i])]) },
];
parts[0].measures[0].dirs = [{ t: [0, 1], kind: 'dyn', value: 'mf' }];
const score: Score = { format: 'swc', v: 0, meta: { title: '달빛 길 (예시곡)', composer: 'ScoreWorks Studio' }, measures, parts };
writeFileSync(new URL('../test/fixtures/demo.musicxml', import.meta.url), toMusicXml(score));
console.log('test/fixtures/demo.musicxml');
