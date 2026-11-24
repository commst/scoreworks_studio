// ScoreWorks가 내보낸 MusicXML과 Studio PDF 불러오기 결과 비교(파트·마디·시각·음높이): node test/cmp-scoreworks.ts <studio.musicxml> <scoreworks.musicxml>
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { midiOf } from '../src/play/adapter.ts';
const P = (f: string) => parseMusicXml(readFileSync(f, 'utf8'), (s: string) => new DOMParser().parseFromString(s, 'application/xml') as any);
const [a, b] = [P(process.argv[2]), P(process.argv[3])];
const sig = (sc: any) => { const m = new Map<string, number>(); sc.parts.forEach((p: any, pi: number) => p.measures.forEach((pm: any, mi: number) => { for (const e of pm.events) if (!e.rest && !e.grace && e.notes) for (const n of e.notes) if (!n.tieStop) { const k = `${pi}|${mi}|${e.t[0]}/${e.t[1]}|${p.kind === 'perc' ? 'x' : midiOf(n)}`; m.set(k, (m.get(k) || 0) + 1); } })); return m; };
const A = sig(a), B = sig(b);
let same = 0, onlyA = 0, onlyB = 0; const ex: string[] = [];
for (const [k, v] of A) { const w = B.get(k) || 0; same += Math.min(v, w); if (v > w) { onlyA += v - w; if (ex.length < 6) ex.push('A ' + k); } }
for (const [k, v] of B) { const w = A.get(k) || 0; if (v > w) { onlyB += v - w; if (ex.length < 12) ex.push('B ' + k); } }
console.log('measures', a.measures.length, b.measures.length, 'same', same, 'onlyStudio', onlyA, 'onlyScoreWorks', onlyB); console.log(ex.join('\n'));
