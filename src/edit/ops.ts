// 음 고치기: 선택한 사건(파트·마디·사건 번호, 화음이면 음 번호)에 대한 편집. 고친 마디들의 전·후를 기록해 되돌리기에 씀.
// 길이를 바꾸면 그 성부를 다시 적는다(notateVoice: 쉼표 채우기·붙임줄 조각·잇단·빔).
import type { Score, Ev, Pitch, PartMeasure } from '../swc/model.ts';
import { add, cmp, sub, ZERO, type Frac } from '../swc/frac.ts';
import { notateVoice, beatOf } from '../swc/notate.ts';
import { midiOf, spell, LET } from '../swc/pitch.ts';

export interface Sel { pi: number; mi: number; ei: number; ni?: number }
export interface Change { pi: number; mi: number; before: PartMeasure; after: PartMeasure }
export type Edit = Change[];

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function keyAt(score: Score, mi: number): number {
  for (let i = mi; i >= 0; i--) if (score.measures[i].key != null) return score.measures[i].key!;
  return 0;
}
export function timeAt(score: Score, mi: number): [number, number] | undefined {
  for (let i = mi; i >= 0; i--) if (score.measures[i].time) return score.measures[i].time;
  return undefined;
}

// 편집 묶음: 고칠 마디를 먼저 받아 두고(touch), 끝나면 전·후 기록
class Tx {
  before = new Map<string, PartMeasure>();
  score: Score;
  constructor(score: Score) { this.score = score; }
  touch(pi: number, mi: number): PartMeasure {
    const k = pi + ':' + mi;
    if (!this.before.has(k)) this.before.set(k, clone(this.score.parts[pi].measures[mi]));
    return this.score.parts[pi].measures[mi];
  }
  done(): Edit {
    const out: Edit = [];   // 마디마다 한 번(처음 전 → 지금 후)
    for (const [k, b] of this.before) { const [pi, mi] = k.split(':').map(Number); const a = this.score.parts[pi].measures[mi]; if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ pi, mi, before: b, after: clone(a) }); }
    return out;
  }
}

// 같은 마디가 여러 번 기록될 수 있어 되돌리기는 거꾸로(맨 처음 '전'이 남게), 다시는 차례대로(맨 끝 '후'가 남게)
export function undo(score: Score, ed: Edit) { for (let i = ed.length - 1; i >= 0; i--) score.parts[ed[i].pi].measures[ed[i].mi] = clone(ed[i].before); }
export function redo(score: Score, ed: Edit) { for (const c of ed) score.parts[c.pi].measures[c.mi] = clone(c.after); }

export const evOf = (score: Score, s: Sel): Ev | undefined => score.parts[s.pi]?.measures[s.mi]?.events[s.ei];

// 붙임줄로 이어진 다음 음(같은 오선·성부, 같은 높이) — 다음 마디까지
function tiedNext(score: Score, pi: number, mi: number, e: Ev, n: Pitch): { mi: number; e: Ev; n: Pitch } | null {
  const end = add(e.t, e.dur);
  for (const [m, t] of [[mi, end], [mi + 1, ZERO]] as [number, Frac][]) {
    const pm = score.parts[pi].measures[m]; if (!pm) continue;
    if (m === mi + 1 && cmp(end, score.measures[mi].len) < 0) continue;
    const x = pm.events.find(x => x.staff === e.staff && x.voice === e.voice && !x.rest && !x.grace && cmp(x.t, t) === 0);
    const nn = x && x.notes && x.notes.find(q => q.tieStop && q.step === n.step && q.oct === n.oct);
    if (x && nn) return { mi: m, e: x, n: nn };
  }
  return null;
}
function tiedPrev(score: Score, pi: number, mi: number, e: Ev, n: Pitch): { mi: number; e: Ev; n: Pitch } | null {
  for (const m of [mi, mi - 1]) {
    const pm = score.parts[pi].measures[m]; if (!pm) continue;
    const t = m === mi ? e.t : score.measures[m].len;
    if (m === mi - 1 && cmp(e.t, ZERO) !== 0) continue;
    const x = pm.events.find(x => x.staff === e.staff && x.voice === e.voice && !x.rest && !x.grace && cmp(add(x.t, x.dur), t) === 0);
    const pn = x && x.notes && x.notes.find(q => q.tieStart && q.step === n.step && q.oct === n.oct);
    if (x && pn) return { mi: m, e: x, n: pn };
  }
  return null;
}

// 음높이 바꾸기: 고를 음들(화음에서 하나 또는 모두)을 새 높이로 — 붙임줄로 이어진 뒤 음도 같이
function repitch(tx: Tx, s: Sel, f: (n: Pitch) => Pitch) {
  const sc = tx.score, pm = tx.touch(s.pi, s.mi), e = pm.events[s.ei];
  if (!e || !e.notes || sc.parts[s.pi].kind === 'perc') return;
  const targets = s.ni != null && e.notes[s.ni] ? [s.ni] : e.notes.map((_, i) => i);
  for (const i of targets) {
    const old = e.notes[i], nw = { ...f(old), tieStart: old.tieStart, tieStop: old.tieStop, head: old.head };
    // 앞 음과의 붙임줄은 높이가 달라지면 끊음
    if (old.tieStop) { const p = tiedPrev(sc, s.pi, s.mi, e, old); if (p) { tx.touch(s.pi, p.mi); p.n.tieStart = undefined; } nw.tieStop = undefined; }
    // 뒤로 이어진 음은 같이
    let cur = { mi: s.mi, e, n: old }, guard = 0;
    while (cur.n.tieStart && guard++ < 64) {
      const nx = tiedNext(sc, s.pi, cur.mi, cur.e, cur.n); if (!nx) break;
      tx.touch(s.pi, nx.mi); const q = f(nx.n); nx.n.step = q.step; nx.n.alter = q.alter; nx.n.oct = q.oct; nx.n.acc = undefined;
      cur = nx;
    }
    nw.acc = undefined;
    e.notes[i] = nw;
  }
}

// 조표 안의 음이면 조표대로, 아니면 올릴 때는 ♯, 내릴 때는 ♭ (옥타브 이동은 글자 그대로)
const keyAltOf = (k: number, st: string) => (k > 0 ? ('FCGDAEB'.indexOf(st) < k ? 1 : 0) : k < 0 ? ('BEADGCF'.indexOf(st) < -k ? -1 : 0) : 0);
function respell(m: number, k: number, dir: number): Pitch {
  const p = spell(m, undefined, k), pc = ((m % 12) + 12) % 12, NAT = [0, 2, 4, 5, 7, 9, 11];
  if (p.alter === keyAltOf(k, p.step) || NAT.includes(pc)) return p;   // 조표 안의 음, 또는 흰 건반(제자리표)
  const st = dir > 0 ? NAT.indexOf((pc + 11) % 12) : NAT.indexOf((pc + 1) % 12), al = dir > 0 ? 1 : -1;
  return { step: LET[st] as Pitch['step'], alter: al, oct: Math.round((m - al - NAT[st]) / 12) - 1 };
}

export function transpose(score: Score, s: Sel, semis: number): Edit {
  const tx = new Tx(score), k = keyAt(score, s.mi);
  repitch(tx, s, n => respell(midiOf(n) + semis, k, semis));
  return tx.done();
}

// 글자(C~G·A·B)로: 지금 음에서 가장 가까운 그 글자(조표의 올림·내림 적용). 쉼표면 음자리표 가운데 근처에 새 음
export function setLetter(score: Score, s: Sel, step: Pitch['step']): Edit {
  const tx = new Tx(score), pm = tx.touch(s.pi, s.mi), e = pm.events[s.ei], part = score.parts[s.pi];
  if (!e || part.kind === 'perc') return tx.done();
  const k = keyAt(score, s.mi);
  const alt = (k > 0 ? 'FCGDAEB'.indexOf(step) < k : k < 0 && 'BEADGCF'.indexOf(step) < -k) ? Math.sign(k) : 0;
  const near = (ref: number) => {
    let best: Pitch | null = null, bd = 99;
    for (let o = 0; o <= 8; o++) { const p: Pitch = { step, alter: alt, oct: o }, d = Math.abs(midiOf(p) - ref); if (d < bd) { bd = d; best = p; } }
    return best!;
  };
  if (e.rest || !e.notes || !e.notes.length) {
    // 기준 높이: 같은 오선의 바로 앞 음(4마디 안), 없으면 음자리표 가운데 줄 근처
    let ref = -1;
    for (let m = s.mi; m >= Math.max(0, s.mi - 4) && ref < 0; m--) {
      const prev = (score.parts[s.pi].measures[m]?.events || []).filter(x => x.staff === e.staff && x.notes && !x.rest && (m < s.mi || cmp(x.t, e.t) < 0)).sort((a, b) => cmp(b.t, a.t))[0];
      if (prev) ref = midiOf(prev.notes![0]);
    }
    const clef = part.clefs[e.staff - 1] || part.clefs[0];
    if (ref < 0) ref = (clef && clef.sign === 'F' ? 50 : clef && clef.sign === 'C' ? 60 : 71) + 12 * ((clef && clef.octave) || 0);
    e.rest = undefined; e.hidden = undefined; e.measureRest = undefined; e.notes = [near(ref)];
    return reflowAfter(tx, s);
  }
  repitch(tx, s, n => near(midiOf(n)));
  return tx.done();
}

// 쉼표로(화음에서 음 하나를 고르면 그 음만 빼기)
export function toRest(score: Score, s: Sel): Edit {
  const tx = new Tx(score), pm = tx.touch(s.pi, s.mi), e = pm.events[s.ei];
  if (!e || e.rest || !e.notes) return tx.done();
  const drop = (n: Pitch) => {
    if (n.tieStop) { const p = tiedPrev(score, s.pi, s.mi, e, n); if (p) { tx.touch(s.pi, p.mi); p.n.tieStart = undefined; } }
    if (n.tieStart) { const x = tiedNext(score, s.pi, s.mi, e, n); if (x) { tx.touch(s.pi, x.mi); x.n.tieStop = undefined; } }
  };
  if (s.ni != null && e.notes.length > 1 && e.notes[s.ni]) { drop(e.notes[s.ni]); e.notes.splice(s.ni, 1); return tx.done(); }
  for (const n of e.notes) drop(n);
  e.notes = undefined; e.rest = true; e.marks = undefined; e.slur = undefined; e.grace = undefined;
  return reflowAfter(tx, s);
}

// 길이 바꾸기: 뒤 음들을 덮어쓰고(새 끝보다 먼저 시작하는 음은 지움), 짧아지면 쉼표로 채움. 마디 끝을 넘지 않음
export function setDur(score: Score, s: Sel, dur: Frac): Edit {
  const tx = new Tx(score), pm = tx.touch(s.pi, s.mi), e = pm.events[s.ei];
  if (!e || e.grace) return tx.done();
  const len = score.measures[s.mi].len;
  let end = add(e.t, dur); if (cmp(end, len) > 0) end = len;
  const mine = (x: Ev) => x.staff === e.staff && x.voice === e.voice;
  // 같은 성부의 붙임줄 조각(이 음에서 이어지는 것)은 하나로 본다
  for (const n of e.notes || []) n.tieStart = undefined;
  pm.events = pm.events.filter(x => !(mine(x) && x !== e && cmp(x.t, e.t) > 0 && cmp(x.t, end) < 0));
  e.dur = sub(end, e.t); e.measureRest = undefined;
  // 덮어쓴 뒤 남은 앞 음과의 겹침은 notateVoice가 정리
  return reflow(tx, s.pi, s.mi, e.staff, e.voice);
}

// 점 붙이기/떼기
export function toggleDot(score: Score, s: Sel): Edit {
  const e = evOf(score, s); if (!e || e.grace) return [];
  const w = e.tuplet ? [e.dur[0] * e.tuplet.actual, e.dur[1] * e.tuplet.normal] as Frac : e.dur;
  // 점이 있으면(×3/2 꼴) 떼고, 없으면 붙임
  const dotted = w[0] % 3 === 0;
  const nd: Frac = dotted ? [e.dur[0] * 2, e.dur[1] * 3] : [e.dur[0] * 3, e.dur[1] * 2];
  return setDur(score, s, nd);
}

function reflowAfter(tx: Tx, s: Sel): Edit {
  const e = tx.score.parts[s.pi].measures[s.mi].events[s.ei];
  return reflow(tx, s.pi, s.mi, e.staff, e.voice);
}

// 한 성부 다시 적기: 소리 나는 음(쉼표·숨은 쉼표 빼고)만 남겨 notateVoice로
function reflow(tx: Tx, pi: number, mi: number, staff: number, voice: number): Edit {
  const sc = tx.score, pm = tx.touch(pi, mi), M = sc.measures[mi];
  const mine = (x: Ev) => x.staff === staff && x.voice === voice;
  const sounding = pm.events.filter(x => mine(x) && !x.rest).map(x => ({ ...x, type: undefined, dots: undefined, tuplet: undefined, beams: undefined }));
  const others = pm.events.filter(x => !mine(x));
  const re = notateVoice(sounding, { len: M.len, beat: beatOf(timeAt(sc, mi)), fillRests: true, hideRests: voice > 1 }).map(x => ({ ...x, staff, voice }));
  pm.events = [...others, ...re];
  return tx.done();
}

// 선택 옮기기: 같은 오선·성부에서 앞·뒤 사건(마디를 넘어). 숨은 쉼표·꾸밈음은 건너뜀
export function step(score: Score, s: Sel, dir: 1 | -1): Sel | null {
  const e = evOf(score, s); if (!e) return null;
  const list = (mi: number) => (score.parts[s.pi].measures[mi]?.events || []).map((x, ei) => ({ x, ei })).filter(o => o.x.staff === e.staff && o.x.voice === e.voice && !o.x.hidden && !o.x.grace).sort((a, b) => cmp(a.x.t, b.x.t));
  const L = list(s.mi), i = L.findIndex(o => o.ei === s.ei);
  if (i + dir >= 0 && i + dir < L.length) return { pi: s.pi, mi: s.mi, ei: L[i + dir].ei };
  for (let m = s.mi + dir; m >= 0 && m < score.measures.length; m += dir) {
    const M2 = list(m); if (M2.length) return { pi: s.pi, mi: m, ei: (dir > 0 ? M2[0] : M2[M2.length - 1]).ei };
    const any = (score.parts[s.pi].measures[m]?.events || []).findIndex(x => x.staff === e.staff && !x.hidden && !x.grace);
    if (any >= 0) return { pi: s.pi, mi: m, ei: any };
  }
  return null;
}

// 선택 다시 찾기(다시 적은 뒤 사건 번호가 바뀌므로): 같은 오선·성부에서 같은 시작
export function refind(score: Score, s: Sel, staff: number, voice: number, t: Frac): Sel | null {
  const ev = score.parts[s.pi].measures[s.mi].events;
  let ei = ev.findIndex(x => x.staff === staff && x.voice === voice && !x.grace && cmp(x.t, t) === 0);
  if (ei < 0) ei = ev.findIndex(x => x.staff === staff && !x.grace && cmp(x.t, t) <= 0 && cmp(add(x.t, x.dur), t) > 0);
  return ei < 0 ? null : { pi: s.pi, mi: s.mi, ei, ni: s.ni != null && ev[ei].notes && ev[ei].notes!.length > s.ni ? s.ni : undefined };
}

export const STEPS = LET.split('') as Pitch['step'][];

// ── 끌어 넣기·옮기기 (화면에서 음을 끌어 놓을 때) ──
// 온음 번호(dia): C4 = 28 (옥타브 × 7 + 글자). 조표의 올림·내림을 붙여 음으로
export const diaOf = (p: Pitch) => p.oct * 7 + LET.indexOf(p.step);
export function fromDia(d: number, key: number): Pitch {
  const st = LET[((d % 7) + 7) % 7] as Pitch['step'];
  return { step: st, alter: keyAltOf(key, st), oct: Math.floor(d / 7) };
}

// 한 오선·성부의 [t, t+dur) 자리에 음(또는 쉼표)을 넣음: 그 자리에서 시작하는 음은 지우고, 앞에서 걸쳐 오는 음은 t에서 자름
function insertCore(tx: Tx, pi: number, mi: number, staff: number, voice: number, t: Frac, dur: Frac, notes: Pitch[] | null, from?: Ev) {
  const sc = tx.score, pm = tx.touch(pi, mi), len = sc.measures[mi].len;
  let end = add(t, dur); if (cmp(end, len) > 0) end = len;
  const mine = (x: Ev) => x.staff === staff && x.voice === voice && !x.rest && !x.grace;
  const cut = (x: Ev) => {   // 붙임줄을 끊음
    for (const n of x.notes || []) {
      if (n.tieStop) { const p = tiedPrev(sc, pi, mi, x, n); if (p) { tx.touch(pi, p.mi); p.n.tieStart = undefined; } }
      if (n.tieStart) { const q = tiedNext(sc, pi, mi, x, n); if (q) { tx.touch(pi, q.mi); q.n.tieStop = undefined; } }
    }
  };
  for (const x of pm.events.filter(x => mine(x) && cmp(x.t, t) >= 0 && cmp(x.t, end) < 0)) { cut(x); pm.events.splice(pm.events.indexOf(x), 1); }
  for (const x of pm.events.filter(x => mine(x) && cmp(x.t, t) < 0 && cmp(add(x.t, x.dur), t) > 0)) { cut(x); x.dur = sub(t, x.t); }
  pm.events = pm.events.filter(x => !(x.grace && x.staff === staff && x.voice === voice && cmp(x.t, t) >= 0 && cmp(x.t, end) < 0));
  if (notes && notes.length) {
    const ev: Ev = { staff, voice, t, dur: sub(end, t), notes: notes.map(n => ({ step: n.step, alter: n.alter, oct: n.oct, head: n.head })) };
    if (from) { if (from.marks) ev.marks = from.marks; if (from.slur) ev.slur = from.slur; }
    pm.events.push(ev);
  }
}

// 새 음 넣기(악보에 끌어 놓기·눌러 넣기). dia = null이면 쉼표. 타악 파트는 높이 없이
export function insertAt(score: Score, pi: number, mi: number, staff: number, t: Frac, dur: Frac, dia: number | null): Edit {
  const tx = new Tx(score), part = score.parts[pi];
  const notes = dia == null ? null : part.kind === 'perc' ? [{ step: 'C', alter: 0, oct: 5 } as Pitch] : [fromDia(dia, keyAt(score, mi))];
  insertCore(tx, pi, mi, staff, 1, t, dur, notes);
  return reflow(tx, pi, mi, staff, 1);
}

// 음 옮기기: 다른 자리(같은 파트의 어느 마디·오선)로 — 높이는 온음 단위로 dDia만큼. 같은 자리면 높이만
export function moveTo(score: Score, s: Sel, mi: number, staff: number, t: Frac, dDia: number): Edit {
  const tx = new Tx(score), e = evOf(score, s);
  if (!e || e.grace) return tx.done();
  const k = keyAt(score, mi), part = score.parts[s.pi];
  const shift = (n: Pitch) => part.kind === 'perc' ? n : fromDia(diaOf(n) + dDia, k);
  if (mi === s.mi && staff === e.staff && cmp(t, e.t) === 0) {   // 높이만
    if (!dDia || !e.notes || part.kind === 'perc') return tx.done();
    repitch(tx, s, shift);
    return tx.done();
  }
  const notes = e.rest || !e.notes ? null : (s.ni != null && e.notes.length > 1 ? [e.notes[s.ni]] : e.notes).map(shift);
  // 원래 자리: 화음에서 한 음만 옮기면 그 음만 빼고, 아니면 쉼표로
  const pm0 = tx.touch(s.pi, s.mi), voice0 = e.voice;
  if (s.ni != null && e.notes && e.notes.length > 1) e.notes.splice(s.ni, 1);
  else { insertCore(tx, s.pi, s.mi, e.staff, e.voice, e.t, e.dur, null); }
  void pm0;
  reflow(tx, s.pi, s.mi, e.staff, voice0);
  insertCore(tx, s.pi, mi, staff, 1, t, e.dur, notes, e);
  return reflow(tx, s.pi, mi, staff, 1);
}
