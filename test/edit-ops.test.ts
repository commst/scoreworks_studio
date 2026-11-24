// 음 고치기: 높이·글자·쉼표·길이·점, 되돌리기/다시가 정확히 원래대로, 고친 뒤 MusicXML 왕복·음표 종류
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { toMusicXml, typeOf } from '../src/io/musicxml-out.ts';
import { transpose, setLetter, toRest, setDur, toggleDot, undo, redo, step, type Sel } from '../src/edit/ops.ts';
import { midiOf } from '../src/swc/pitch.ts';
import { add, cmp, ZERO } from '../src/swc/frac.ts';
import type { Score } from '../src/swc/model.ts';

const P = (s: string) => new DOMParser().parseFromString(s, 'application/xml') as unknown as Document;
const load = () => parseMusicXml(readFileSync(new URL('./fixtures/timeonly-tie.musicxml', import.meta.url), 'utf8'), P);
const J = (s: Score) => JSON.stringify(s);
const check = (sc: Score) => {   // 마디마다 성부 길이 합 = 마디 길이, 음표 종류가 정해짐, 왕복 같음
  sc.parts.forEach(p => p.measures.forEach((pm, mi) => {
    const vs = new Set(pm.events.map(e => e.staff * 10 + e.voice));
    for (const v of vs) { let s = ZERO; for (const e of pm.events.filter(e => e.staff * 10 + e.voice === v && !e.grace)) { s = add(s, e.dur); if (!e.measureRest) assert.ok(typeOf(e.tuplet ? [e.dur[0] * e.tuplet.actual, e.dur[1] * e.tuplet.normal] : e.dur), `${mi} ${e.dur}`); } assert.equal(cmp(s, sc.measures[mi].len), 0, `마디 ${mi + 1} 길이`); }
  }));
  const back = parseMusicXml(toMusicXml(sc), P);
  assert.equal(back.parts[0].measures.map(m => m.events.length).join(), sc.parts[0].measures.map(m => m.events.length).join());
};

test('높이 바꾸기 · 되돌리기', () => {
  const sc = load(), orig = J(sc);
  const s: Sel = { pi: 0, mi: 2, ei: 0 };
  const m0 = midiOf(sc.parts[0].measures[2].events[0].notes![0]);
  const ed = transpose(sc, s, 1);
  assert.equal(midiOf(sc.parts[0].measures[2].events[0].notes![0]), m0 + 1);
  check(sc);
  undo(sc, ed); assert.equal(J(sc), orig);
  redo(sc, ed); assert.equal(midiOf(sc.parts[0].measures[2].events[0].notes![0]), m0 + 1);
});

test('붙임줄로 이어진 음은 같이 바뀜', () => {
  const sc = load();
  // 1마디 음 → 2마디로 붙임줄
  sc.parts[0].measures[0].events[0].notes![0].tieStart = true;   // 1마디 C5 → 2마디 C5
  const e0 = sc.parts[0].measures[0].events.find(e => e.notes && e.notes[0].tieStart);
  assert.ok(e0);
  transpose(sc, { pi: 0, mi: 0, ei: sc.parts[0].measures[0].events.indexOf(e0!) }, 2);
  const e1 = sc.parts[0].measures[1].events.find(e => e.notes && e.notes[0].tieStop)!;
  assert.equal(midiOf(e1.notes![0]), midiOf(e0!.notes![0]));
  check(sc);
});

test('글자·쉼표·길이·점', () => {
  const sc = load(), orig = J(sc);
  const eds = [];
  eds.push(setLetter(sc, { pi: 0, mi: 2, ei: 0 }, 'G'));
  assert.equal(sc.parts[0].measures[2].events[0].notes![0].step, 'G');
  eds.push(toRest(sc, { pi: 0, mi: 3, ei: 0 })); check(sc);
  eds.push(setLetter(sc, { pi: 0, mi: 3, ei: 0 }, 'A')); check(sc);
  eds.push(setDur(sc, { pi: 0, mi: 2, ei: 0 }, [1, 8])); check(sc);
  const ei = sc.parts[0].measures[2].events.findIndex(e => !e.rest);
  eds.push(toggleDot(sc, { pi: 0, mi: 2, ei })); check(sc);
  eds.push(setDur(sc, { pi: 0, mi: 2, ei: sc.parts[0].measures[2].events.findIndex(e => !e.rest) }, [1, 1])); check(sc);
  for (const ed of eds.reverse()) undo(sc, ed);
  assert.equal(J(sc), orig);
});

test('선택 옮기기', () => {
  const sc = load();
  let s: Sel | null = { pi: 0, mi: 0, ei: 0 }, n = 0;
  while (s && n < 50) { s = step(sc, s, 1); n++; }
  assert.ok(n >= 4 && n < 50);
});
