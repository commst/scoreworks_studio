// 구음: 장구(덩·쿵·덕·기덕·더러러러), 산조가야금 줄 구음, 사람이 적은 구음의 MusicXML 가사 왕복
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { jangguAt, gayageumGu } from '../src/view/gueum.ts';
import { setGueum } from '../src/edit/ops.ts';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { toMusicXml } from '../src/io/musicxml-out.ts';
import type { Part, Ev } from '../src/swc/model.ts';

const P = (s: string) => new DOMParser().parseFromString(s, 'application/xml') as unknown as Document;
const C5 = { step: 'C', alter: 0, oct: 5 } as const;
const ev = (voice: number, x: Partial<Ev> = {}): Ev => ({ staff: 1, voice, t: [0, 1], dur: [1, 4], notes: [{ ...C5 }], ...x });
const part: Part = { id: 'P1', name: '장구', inst: 'perc', kind: 'perc', staves: 1, clefs: [{ sign: 'percussion', line: 3 }], measures: [{ events: [] }] };

test('장구 구음', () => {
  assert.equal(jangguAt(part, [ev(1), ev(2)]), '덩');
  assert.equal(jangguAt(part, [ev(1)]), '덕');
  assert.equal(jangguAt(part, [ev(2)]), '쿵');
  assert.equal(jangguAt(part, [ev(1, { grace: 'acciaccatura', dur: [0, 1] }), ev(1)]), '기덕');
  assert.equal(jangguAt(part, [ev(1, { marks: [{ k: 'tremolo', n: 3 }] })]), '더러러러');
  assert.equal(jangguAt(part, [ev(1, { rest: true, notes: undefined })]), '');
});

test('산조가야금 줄 구음 (징 = C4)', () => {
  const names = [43, 48, 50, 55, 57, 60, 62, 64, 67, 69, 72, 74].map(m => gayageumGu(m, 60));
  assert.equal(names.join(), '청,흥,둥,당,동,징,땅,지,찡,칭,쫑,쨍');
  assert.equal(gayageumGu(61, 60), '징˄');   // 징을 눌러 반음 올림
  assert.equal(gayageumGu(40, 60), '');      // 줄 아래
  assert.equal(gayageumGu(62, 62), '징');    // 징 = D4로 조율
});

test('구음 적기 → MusicXML 가사 → 다시 읽기', () => {
  const sc = parseMusicXml(readFileSync(new URL('./fixtures/timeonly-tie.musicxml', import.meta.url), 'utf8'), P);
  setGueum(sc, { pi: 0, mi: 2, ei: 0 }, '슬기둥');
  const xml = toMusicXml(sc);
  assert.ok(xml.includes('<lyric number="1"><syllabic>single</syllabic><text>슬기둥</text></lyric>'));
  const back = parseMusicXml(xml, P);
  assert.equal(back.parts[0].measures[2].events[0].marks!.find(m => m.k === 'gueum')!.text, '슬기둥');
  setGueum(sc, { pi: 0, mi: 2, ei: 0 }, '');
  assert.ok(!toMusicXml(sc).includes('<lyric'));
});
