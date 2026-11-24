// 음 고치기: 높이·글자·쉼표·길이·점, 되돌리기/다시가 정확히 원래대로, 고친 뒤 MusicXML 왕복·음표 종류
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { toMusicXml, typeOf } from '../src/io/musicxml-out.ts';
import { transpose, setLetter, toRest, setDur, toggleDot, undo, redo, step, insertAt, moveTo, diaOf, addToChord, addLetter, insertMeasures, deleteMeasures, type Sel } from '../src/edit/ops.ts';
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

test('끌어 넣기·옮기기', () => {
  const sc = load(), orig = J(sc), eds = [];
  // 4마디(온음표 D5) 가운데(2박)에 8분음표 G4 넣기
  eds.push(insertAt(sc, 0, 3, 1, [1, 4], [1, 8], 4 * 7 + 4)); check(sc);
  const pm = sc.parts[0].measures[3];
  const g = pm.events.find(e => e.notes && e.t[0] === 1 && e.t[1] === 4)!;
  assert.equal(g.notes![0].step + g.notes![0].oct, 'G4');
  assert.ok(pm.events.some(e => e.notes && cmp(e.t, ZERO) === 0 && cmp(e.dur, [1, 4]) === 0), '앞 음은 넣은 자리에서 잘림');
  // 그 음을 3박으로, 온음 두 칸 위(B4)로 옮기기
  eds.push(moveTo(sc, { pi: 0, mi: 3, ei: pm.events.indexOf(g) }, 3, 1, [1, 2], 2)); check(sc);
  const m = sc.parts[0].measures[3].events.find(e => e.notes && cmp(e.t, [1, 2]) === 0)!;
  assert.equal(diaOf(m.notes![0]), 4 * 7 + 6);
  assert.ok(!sc.parts[0].measures[3].events.some(e => e.notes && cmp(e.t, [1, 4]) === 0), '원래 자리는 쉼표');
  // 높이만 옮기기(같은 자리)
  const mi2 = sc.parts[0].measures[3].events.indexOf(m);
  eds.push(moveTo(sc, { pi: 0, mi: 3, ei: mi2 }, 3, 1, [1, 2], -1)); check(sc);
  assert.equal(diaOf(sc.parts[0].measures[3].events[mi2].notes![0]), 4 * 7 + 5);
  // 쉼표 넣기
  eds.push(insertAt(sc, 0, 2, 1, ZERO, [1, 4], null)); check(sc);
  for (const ed of eds.reverse()) undo(sc, ed);
  assert.equal(J(sc), orig);
});

test('둘째 성부·화음', () => {
  const sc = load(), orig = J(sc), eds = [];
  eds.push(insertAt(sc, 0, 3, 1, [1, 2], [1, 4], 4 * 7 + 2, 2)); check(sc);   // 4마디 셋째 박에 둘째 성부 E4
  const v2 = sc.parts[0].measures[3].events.filter(e => e.voice === 2);
  assert.ok(v2.some(e => e.notes && e.notes[0].step === 'E'), '둘째 성부 음');
  assert.ok(v2.filter(e => e.rest).every(e => e.hidden), '둘째 성부 빈자리는 숨은 쉼표');
  assert.ok(sc.parts[0].measures[3].events.some(e => e.voice === 1 && e.notes && cmp(e.dur, [1, 1]) === 0), '첫 성부 온음표 그대로');
  eds.push(addToChord(sc, 0, 2, 1, ZERO, [1, 2], 4 * 7 + 4)); check(sc);   // 3마디 첫 음(E5)에 G4 더하기
  const c = sc.parts[0].measures[2].events.find(e => e.notes && cmp(e.t, ZERO) === 0)!;
  assert.equal(c.notes!.map(n => n.step + n.oct).join(), 'G4,E5');
  eds.push(addLetter(sc, { pi: 0, mi: 2, ei: sc.parts[0].measures[2].events.indexOf(c) }, 'C'));
  assert.equal(c.notes!.map(n => n.step + n.oct).join(), 'G4,E5,C6');
  for (const ed of eds.reverse()) undo(sc, ed);
  assert.equal(J(sc), orig);
});

test('마디 넣기·지우기', () => {
  const sc = load(), orig = J(sc), n0 = sc.measures.length;
  const a = insertMeasures(sc, 2, 2); check(sc);
  assert.equal(sc.measures.length, n0 + 2);
  assert.equal(sc.measures.map(m => m.number).join(), '1,2,3,4,5,6');
  assert.ok(sc.parts[0].measures[2].events[0].measureRest);
  const b = deleteMeasures(sc, 0, 1); check(sc);   // 첫 마디(박자표 있음) 지우기 → 박자는 다음 마디로
  assert.equal(sc.measures.length, n0 + 1);
  assert.ok(sc.measures[0].time, '박자표가 넘어옴');
  const c = insertMeasures(sc, sc.measures.length, 1); check(sc);   // 끝에 넣기
  assert.equal(sc.measures.length, n0 + 2);
  undo(sc, c); undo(sc, b); undo(sc, a);
  assert.equal(J(sc), orig);
  redo(sc, a); assert.equal(sc.measures.length, n0 + 2);
});
