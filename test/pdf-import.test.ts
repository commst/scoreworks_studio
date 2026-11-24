// PDF 불러오기: 저장소 밖 악보 폴더(SAMPLES_PDF)의 PDF마다 — 해석 → .swc → MusicXML(모든 음표 종류가 정해짐, 길이 > 0) → 다시 읽어 같은지
// 실행: SAMPLES_PDF=<폴더> npm test (폴더가 없으면 건너뜀)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
// @ts-ignore
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePdf } from '../src/io/pdf-in.ts';
import { toMusicXml, typeOf } from '../src/io/musicxml-out.ts';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import type { Score } from '../src/swc/model.ts';

const dir = process.env.SAMPLES_PDF;
const files = dir && existsSync(dir) ? readdirSync(dir).filter(f => /\.pdf$/i.test(f)).slice(0, +(process.env.SAMPLES_MAX || 20)) : [];
const sig = (s: Score) => s.parts.map(p => p.measures.map(m => m.events.filter(e => !e.rest).map(e => `${e.t}|${e.dur}|${(e.notes || []).map(n => n.step + n.alter + n.oct).join('.')}`).join(' ')).join('/')).join('#');

test('PDF 불러오기', { skip: !files.length && 'SAMPLES_PDF 없음' }, async () => {
  for (const f of files) {
    const { score } = await parsePdf(pdfjs, new Uint8Array(readFileSync(`${dir}/${f}`)), undefined, f);
    assert.ok(score.measures.length > 0, f);
    for (const p of score.parts) p.measures.forEach((m, i) => { for (const e of m.events) {
      if (e.grace || e.measureRest) continue;
      assert.ok(e.dur[0] > 0, `${f} ${p.name} ${i + 1}마디 길이 0`);
      const w: any = e.tuplet ? [e.dur[0] * e.tuplet.actual, e.dur[1] * e.tuplet.normal] : e.dur;
      assert.ok(typeOf(w), `${f} ${p.name} ${i + 1}마디 음표 종류 없음 ${e.dur}`);
    } });
    const back = parseMusicXml(toMusicXml(score), s => new DOMParser().parseFromString(s, 'application/xml') as unknown as Document);
    assert.equal(sig(back), sig(score), f);
  }
});
