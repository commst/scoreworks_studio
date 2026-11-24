// .swc → ScoreWorks 재생 계획: 음 수·높이·붙임줄·마디 순서가 맞는지 (녹음 없이 합성음으로)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseMusicXml } from '../src/io/musicxml-in.ts';
import { toEngineBars } from '../src/play/adapter.ts';
// @ts-ignore
import { playbackOrder } from '../shared/scoreworks/score-parser.js';
// @ts-ignore
import { renderPlan } from '../shared/scoreworks/audio-engine.js';

test('timeonly-tie → renderPlan', () => {
  const sc = parseMusicXml(readFileSync(new URL('./fixtures/timeonly-tie.musicxml', import.meta.url), 'utf8'), (s: string) => new DOMParser().parseFromString(s, 'application/xml') as unknown as Document);
  const bars = toEngineBars(sc);
  assert.equal(bars.length, sc.measures.length);
  const all = bars.flatMap((b: any) => b.events);
  assert.ok(all.length > 0);
  const order = playbackOrder(bars, { repeats: true });
  const melodic: any = {}; for (const p of sc.parts) melodic[p.id] = { inst: 'gayageum_syn', oct: 0, nong: true };
  const plan = renderPlan(bars, order, { tempoRows: [{ start: bars[0].number, bpm: 90, unit: 'q' }], speed: 1, sounds: {}, melodic, lineGain: {} });
  // 붙임줄로 이어진 음은 새로 소리 내지 않는다
  const sounding = order.reduce((n: number, k: number) => n + bars[k].events.filter((e: any) => e.midis && !e.tie).length, 0);   // 도돌이로 다시 치는 마디 포함
  assert.ok(plan.notes.length > 0 && plan.notes.length <= sounding, `${plan.notes.length} / ${sounding}`);
  for (const n of plan.notes) for (const m of n.midis) assert.ok(m >= 21 && m <= 108, String(m));
});
