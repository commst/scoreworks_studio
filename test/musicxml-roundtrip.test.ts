// MusicXML → .swc → MusicXML → .swc 가 같은지(음·쉼표·길이·붙임줄·잇단음표·마디 정보), XSD는 test/xsd.sh로 따로
// node --test test/  (Node 22: TypeScript 그대로 실행)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { toMusicXml } from '../src/io/musicxml-out.ts';

const parse = (s: string) => new DOMParser().parseFromString(s, 'application/xml') as unknown as Document;
// 저장소의 시험 파일 + (있으면) 저장소 밖의 실제 악보 폴더 SAMPLES_XML — 악보는 저작권 때문에 공개 저장소에 넣지 않는다
const dirs = [new URL('./fixtures/', import.meta.url).pathname, ...(process.env.SAMPLES_XML ? [process.env.SAMPLES_XML] : [])];
const files = dirs.flatMap(d => fs.readdirSync(d).filter(f => /\.musicxml$/.test(f)).map(f => d.replace(/\/?$/, '/') + f));
// 비교할 내용만 (적힌 모양 정보 중 내보낼 때 다시 정하는 것은 뺌)
const sig = (s: ReturnType<typeof parseMusicXml>) => JSON.stringify({
  m: s.measures.map(m => [m.number, m.len, m.time, m.key, m.tempo && m.tempo.bpm, m.rehearsal, m.repeatStart, m.repeatEnd]),
  p: s.parts.map(p => [p.name, p.staves, p.clefs, p.measures.map(pm => pm.events.map(e => [e.staff, e.voice, e.t, e.dur, !!e.rest, (e.notes || []).map(n => [n.step, n.alter, n.oct, !!n.tieStart, !!n.tieStop]), e.tuplet && [e.tuplet.actual, e.tuplet.normal], e.grace || '', (e.marks || []).map(x => x.k).join(',')]))]),
});
for (const f of files) test(`왕복 ${f.split('/').pop()}`, () => {
  const xml = fs.readFileSync(f, 'utf8');
  const a = parseMusicXml(xml, parse);
  assert.ok(a.parts.length > 0 && a.measures.length > 0, '파트·마디가 있음');
  const xml2 = toMusicXml(a), b = parseMusicXml(xml2, parse);
  assert.equal(sig(b), sig(a));
  fs.mkdirSync('/tmp/swc-rt', { recursive: true }); fs.writeFileSync('/tmp/swc-rt/' + f.split('/').pop(), xml2);
});
