// 소리 길이만 있는 음들(해석기 결과·입력)을 '적을 수 있는' 악보로: 쉼표 채우기, 적을 수 없는 길이는 붙임줄 조각으로,
// 잇단음표 묶기, 빔 묶기. 한 마디·한 오선·한 성부 단위로 처리.
import type { Ev } from './model.ts';
import { add, sub, mul, cmp, fr, ZERO, type Frac } from './frac.ts';
import { typeOf } from '../io/musicxml-out.ts';

const TUPS: [number, number][] = [[3, 2], [5, 4], [6, 4], [7, 4], [7, 8], [9, 8]];
const PLAIN: Frac[] = [];   // 점 없는·점 하나·점 둘 길이, 큰 것부터
for (let k = 0; k <= 7; k++) { const b: Frac = [1, 2 ** k]; PLAIN.push(mul(b, [7, 4]), mul(b, [3, 2]), b); }
PLAIN.sort((a, b) => cmp(b, a));
const plain = (d: Frac) => !!typeOf(d);
const tupOf = (d: Frac): [number, number] | null => { for (const [a, n] of TUPS) if (typeOf(mul(d, [a, n]))) return [a, n]; return null; };

// 한 음표로 적을 수 있는가(보통 또는 잇단). 아니면 조각들(보통 길이 먼저, 남으면 잇단)
export function pieces(d: Frac): Frac[] {
  if (plain(d) || tupOf(d)) return [d];
  const lists: Frac[][] = [PLAIN];
  for (const [a, n] of TUPS) lists.push([...PLAIN, ...PLAIN.map(p => mul(p, [n, a]))].sort((x, y) => cmp(y, x)));
  for (const L of lists) {
    const out: Frac[] = []; let r = d;
    while (cmp(r, ZERO) > 0) { const c = L.find(v => cmp(v, r) <= 0); if (!c) break; out.push(c); r = sub(r, c); }
    if (cmp(r, ZERO) === 0) return out;
  }
  return [d];   // 아주 드문 길이: 그대로(쓰기에서 종류 없이)
}

// 쉼표를 박 단위로 나누기(박 경계를 넘는 쉼표는 박에 맞춰): 시작 t, 길이 d, 박 길이 beat
function restPieces(t: Frac, d: Frac, beat: Frac): [Frac, Frac][] {
  const out: [Frac, Frac][] = []; let cur = t, end = add(t, d);
  while (cmp(cur, end) < 0) {
    // 다음 박 경계
    const q = Math.floor((cur[0] * beat[1]) / (cur[1] * beat[0]) + 1e-9) + 1, nb = mul(beat, [q, 1]);
    const onBeat = cmp(mul(beat, [q - 1, 1]), cur) === 0;
    let len = sub(end, cur);
    const simple = (d: Frac) => { const t = typeOf(d); return !!t && t.dots <= 1; };   // 쉼표는 점 하나까지
    if (!(onBeat && simple(len))) len = cmp(nb, end) < 0 ? sub(nb, cur) : len;
    if (simple(len)) { out.push([cur, len]); cur = add(cur, len); continue; }
    let r = len;
    while (cmp(r, ZERO) > 0) { const c = PLAIN.find(v => cmp(v, r) <= 0 && simple(v)) || pieces(r)[0]; out.push([cur, c]); cur = add(cur, c); r = sub(r, c); }
  }
  return out;
}

export interface VoiceOpts { len: Frac; beat: Frac; fillRests: boolean; hideRests?: boolean }   // hideRests: 둘째 성부의 빈자리(보이지 않는 쉼표)

// 한 성부의 음들 → 적을 수 있는 사건들 (입력 음은 t순, 겹치지 않게 다듬음)
export function notateVoice(evs: Ev[], o: VoiceOpts): Ev[] {
  const main = evs.filter(e => !e.grace).sort((a, b) => cmp(a.t, b.t));
  const graces = evs.filter(e => e.grace);
  const out: Ev[] = [];
  let cur: Frac = ZERO;
  const proto = evs[0] || ({ staff: 1, voice: 1 } as Ev);
  const rest = (t: Frac, d: Frac) => { for (const [rt, rd] of restPieces(t, d, o.beat)) out.push({ staff: proto.staff, voice: proto.voice, t: rt, dur: rd, rest: true, hidden: o.hideRests || undefined }); };
  main.forEach((e, i) => {
    if (cmp(e.t, cur) < 0 || cmp(e.t, o.len) >= 0 || cmp(e.dur, ZERO) <= 0) return;   // 앞 음과 겹침·마디 밖: 버림(같은 성부에 겹친 음은 해석 오류)
    if (cmp(e.t, cur) > 0 && o.fillRests) rest(cur, sub(e.t, cur));
    let end = add(e.t, e.dur);
    const nx = main[i + 1]; if (nx && cmp(nx.t, end) < 0 && cmp(nx.t, e.t) > 0) end = nx.t;
    if (cmp(end, o.len) > 0) end = o.len;
    for (const g of graces.filter(g => cmp(g.t, e.t) === 0)) out.push({ ...g, t: e.t, dur: ZERO, type: g.type || 'eighth' });
    const ps = pieces(sub(end, e.t));
    let t = e.t;
    ps.forEach((p, k) => {
      const ev: Ev = { ...e, t, dur: p, type: undefined, dots: undefined, tuplet: undefined, beams: undefined };
      if (e.notes) ev.notes = e.notes.map(n => ({ ...n, tieStart: k < ps.length - 1 ? true : n.tieStart, tieStop: k > 0 ? true : n.tieStop, acc: k > 0 ? undefined : n.acc }));
      if (k > 0) { ev.marks = (e.marks || []).filter(m => m.k === 'nonghyeon' || m.k === 'tremolo'); ev.slur = undefined; }
      if (k < ps.length - 1 && e.slur && e.slur.includes('stop')) ev.slur = e.slur.filter(s => s !== 'stop');
      if (k === ps.length - 1 && k > 0 && e.slur && e.slur.includes('stop')) ev.slur = ['stop'];
      out.push(ev); t = add(t, p);
    });
    cur = end;
  });
  if (o.fillRests && cmp(cur, o.len) < 0) {
    if (!main.length) out.push({ staff: proto.staff, voice: proto.voice, t: ZERO, dur: o.len, rest: true, measureRest: true });
    else rest(cur, sub(o.len, cur));
  }
  tuplets(out); beams(out, o.beat);
  return out;
}

// 잇단음표 묶음: 같은 비율의 잇단 음이 이어지고, 합이 보통 길이가 되면 닫음
function tuplets(evs: Ev[]) {
  let open: Ev[] = [], ratio: [number, number] | null = null, acc: Frac = ZERO;
  const close = () => { if (open.length) { open[0].tuplet!.start = true; open[open.length - 1].tuplet!.stop = true; } open = []; ratio = null; acc = ZERO; };
  for (const e of evs) {
    if (e.grace || e.measureRest) { close(); continue; }
    const r = plain(e.dur) ? null : tupOf(e.dur);
    if (!r || (ratio && (r[0] !== ratio[0] || r[1] !== ratio[1]))) close();
    if (!r) continue;
    ratio = r; e.tuplet = { actual: r[0], normal: r[1] }; open.push(e); acc = add(acc, e.dur);
    if (plain(acc) && !typeOf(acc)!.dots) close();
  }
  if (open.length) { open[0].tuplet!.start = true; open[open.length - 1].tuplet!.stop = true; }
}

const LEVEL: Record<string, number> = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4, '128th': 5 };
// 빔: 한 박 안의 8분음표 이하 음들(쉼표에서 끊음). 단계마다 begin·continue·end, 혼자면 hook
function beams(evs: Ev[], beat: Frac) {
  const beatNo = (t: Frac) => Math.floor((t[0] * beat[1]) / (t[1] * beat[0]) + 1e-9);
  const lv = (e: Ev) => {
    if (e.rest || e.grace || !e.notes) return 0;
    const w = e.tuplet ? mul(e.dur, [e.tuplet.actual, e.tuplet.normal]) : e.dur, ty = typeOf(w);
    return ty ? LEVEL[ty.type] || 0 : 0;
  };
  let grp: Ev[] = [];
  const flush = () => {
    if (grp.length >= 2) {
      const L = grp.map(lv), max = Math.max(...L);
      grp.forEach((e, i) => {
        e.beams = [];
        for (let l = 1; l <= max; l++) {
          if (L[i] < l) break;
          const p = i > 0 && L[i - 1] >= l, n = i < grp.length - 1 && L[i + 1] >= l;
          e.beams.push(p && n ? 'continue' : p ? 'end' : n ? 'begin' : i > 0 ? 'backward hook' : 'forward hook');
        }
      });
    }
    grp = [];
  };
  for (const e of evs) {
    if (e.grace) continue;
    if (!lv(e) || (grp.length && beatNo(e.t) !== beatNo(grp[0].t))) flush();
    if (lv(e)) grp.push(e);
  }
  flush();
}

// 박 단위: 겹박자(6/8·9/8·12/8)는 점4분, 그 밖은 박자표의 분모
export function beatOf(time?: [number, number]): Frac {
  if (!time) return [1, 4];
  const [n, d] = time;
  if (d >= 8 && n % 3 === 0 && n > 3) return fr(3, d);
  return d >= 4 ? [1, 4] : fr(1, d);   // 5/8·7/8은 4분 단위로 묶음
}
