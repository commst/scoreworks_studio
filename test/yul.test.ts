// 율명: 황종 E♭4(정악) 기준 12율과 옥타브(하배·배·청·중청), 한자
import test from 'node:test';
import assert from 'node:assert/strict';
import { yulName } from '../src/view/yul.ts';

test('율명', () => {
  const o = { base: 63, hanja: false };
  assert.equal([63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74].map(m => yulName(m, o)).join(), '황,대,태,협,고,중,유,임,이,남,무,응');
  assert.equal(yulName(75, o), '청황');
  assert.equal(yulName(87, o), '중청황');
  assert.equal(yulName(60, o), '배남');
  assert.equal(yulName(46, o), '하배임');
  assert.equal(yulName(70, { base: 63, hanja: true }), '林');
  assert.equal(yulName(51, { base: 63, hanja: true }), '倍黃');
  assert.equal(yulName(60, { base: 60, hanja: false }), '황');
});
