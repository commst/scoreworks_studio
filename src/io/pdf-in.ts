// PDF 악보 → .swc : ScoreWorks 해석기(loadScore·analyzeLine)로 줄마다 마디·음을 읽고, 적을 수 있는 악보로 다듬는다.
// 해석기가 내는 음: t·dur(분수), voice(R 윗성부·L 아랫성부), midis, dia(음마다 온음 번호, 가온다 C4 = 28), kf(조표), cl(음자리표 기준),
// pcs(붙임줄로 이어 적힌 조각 길이), tie(앞 음에서 이어짐), accent·stacc·ten·roll·gliss·xh·slurS·slurE·graceMidis
// @ts-ignore — 공통 모듈(ScoreWorks)
import * as SP from '../../shared/scoreworks/score-parser.js';
const { loadScore, analyzeLine, alignToSystem, alignCrossStaff } = SP as any;
// @ts-ignore
import { guessInstrument } from '../../shared/scoreworks/melody-engine.js';
import type { Score, MeasureInfo, Part, PartMeasure, Ev, Pitch, Clef, Dir, Mark } from '../swc/model.ts';
import { fr, ZERO, cmp, type Frac } from '../swc/frac.ts';
import { notateVoice, beatOf } from '../swc/notate.ts';
import { spell } from '../swc/pitch.ts';
export { spell };

const ALIGN_NEED = /박자보다 김|마디 길이를 넘음|마디선이 보이지 않아/;
// 숨은 쉼표 마디를 세로 자리로 다시 읽는 악보(ScoreWorks ALIGN_SHORT와 같음 — 월광 총보)
const ALIGN_SHORT = new Set(['3f32a068c87af148-564918']);
// 악보 지문(ScoreWorks scoreFingerprint와 같음)
export function fingerprint(u8: Uint8Array): string {
  let h1 = 0xdeadbeef ^ u8.length, h2 = 0x41c6ce57 ^ u8.length;
  for (let i = 0; i < u8.length; i++) { const c = u8[i]; h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + '-' + u8.length;
}
const F = (x: any): Frac => (x == null ? ZERO : typeof x === 'number' ? fr(Math.round(x * 960), 960) : fr(x.n, x.d));

// 음자리표: 해석기 기준(맨 아랫줄의 온음 번호) → 음자리표 (ScoreWorks 내보내기와 같은 표)
function clefOf(base: number | undefined, perc: boolean): Clef {
  if (perc) return { sign: 'percussion', line: 3 };
  const CL: [number, Clef['sign'], number][] = [[30, 'G', 2], [18, 'F', 4], [24, 'C', 3], [22, 'C', 4]];
  let best: [number, Clef['sign'], number, number] | null = null;
  for (const [b0, sg, ln] of CL) { const d = (base ?? 30) - b0; if (d % 7 === 0 && Math.abs(d) <= 14 && (!best || Math.abs(d) < Math.abs(best[3]))) best = [b0, sg, ln, d]; }
  if (!best) return { sign: 'G', line: 2 };
  return best[3] ? { sign: best[1], line: best[2], octave: best[3] / 7 } : { sign: best[1], line: best[2] };
}

const UNIT = (u: any, dotted: boolean): 'q' | 'dq' | 'e' | 'h' => {
  const d = Array.isArray(u) ? u[1] / u[0] : 4;
  return dotted ? (d === 4 ? 'dq' : 'q') : d === 8 ? 'e' : d === 2 ? 'h' : 'q';
};

export interface PdfProgress { (msg: string, f?: number): void }

export async function parsePdf(pdfjs: any, data: Uint8Array, onProgress?: PdfProgress, fileName = ''): Promise<{ score: Score; warnings: string[] }> {
  const fp = fingerprint(data);   // pdf.js가 data를 넘겨받기 전에
  onProgress && onProgress('PDF 읽는 중');
  const sc = await loadScore(pdfjs, data, (i: number, n: number) => onProgress && onProgress(`쪽 읽는 중 ${i}/${n}`, n ? i / n : 0));
  sc.fp = fp;
  const ids: (number | null)[] = sc.lines && sc.lines.length ? sc.lines.map((_: any, i: number) => i) : [null];
  onProgress && onProgress('음 해석 중');
  // ScoreWorks 앱 alignRaw와 같은 순서: ① 큰보표 짝 오선을 넘나드는 음 맞추기 ② 마디가 넘친 줄은 같은 단 다른 줄들과 세로 맞춤
  const raw0: any[] = ids.map((id: number | null) => analyzeLine(sc, id));
  const short = ALIGN_SHORT.has(fp);
  const res: any[] = raw0.map((r0, k) => {
    let r = r0;
    try {
      const L = sc.lines[k];
      const pid = L && /\(윗줄\)/.test(L.label || '') ? k + 1 : L && /\(아랫줄\)/.test(L.label || '') ? k - 1 : -1;
      if (pid >= 0 && sc.lines[pid] && sc.lines[pid].name === L.name) r = alignCrossStaff(r, raw0[pid]);
      if (ids.length < 2 || !r.bars.some((b: any) => b.warnings.some((w: string) => ALIGN_NEED.test(w) || (short && /쉼표 일부 숨김/.test(w))))) return r;
      return alignToSystem(r, raw0.filter((_, i) => i !== k), { short });
    } catch (e) { console.warn('alignRaw', e); return r; }
  });

  // 파트 묶기: 같은 이름의 (윗줄)·(아랫줄)은 한 파트의 두 오선
  type Src = { line: number | null; staff: number };
  const groups: { name: string; perc: boolean; srcs: Src[]; bases: (number | undefined)[] }[] = [];
  // 이름 없는 줄(파트보): 파트 이름 → 파일 이름에서 곡 제목을 뺀 것(예: '소나기-가야금2' → '가야금2')
  const base = fileName.replace(/\.[^.]+$/, '').replace(/^[0-9a-f]{8}-/, '');
  const fromFile = (sc.title && base.includes(sc.title) ? base.replace(sc.title, '') : base).replace(/^[\s\-_–·]+|[\s\-_–·]+$/g, '').trim();
  const unnamed = ids.every((id: number | null) => id == null || !sc.lines[id].name);
  ids.forEach((id, k) => {
    const L = id == null ? null : sc.lines[id];
    const name = (L && L.name) || sc.partName || fromFile || '악기', perc = !!(L && L.clef === 'perc');
    // 이름 없는 두 줄(가야금 파트보 등 큰보표): 한 파트의 두 오선
    if (unnamed && ids.length === 2 && k === 1 && groups.length === 1 && !perc && !groups[0].perc) { groups[0].srcs.push({ line: k, staff: 2 }); groups[0].bases.push(L!.clefBase); return; }
    const g = groups[groups.length - 1];
    if (L && /\(아랫줄\)/.test(L.label || '') && g && g.name === name && g.srcs.length === 1) { g.srcs.push({ line: k, staff: 2 }); g.bases.push(L.clefBase); return; }
    groups.push({ name, perc, srcs: [{ line: k, staff: 1 }], bases: [L ? L.clefBase : undefined] });
  });

  // 마디 정보: 가장 마디가 많은 줄 기준
  const master = res.reduce((a, b) => (b.bars.length > a.bars.length ? b : a), res[0]);
  const warnings: string[] = [];
  const keys = res.map(r => r.bars.map((b: any) => { const e = b.events.find((e: any) => e.kf != null); return e ? e.kf : null; }));
  let lastKey: number | null = null, lastTime = '';
  const firstKey = (() => { for (let i = 0; i < master.bars.length; i++) for (const kk of keys) if (kk[i] != null) return kk[i] as number; return null; })();
  const measures: MeasureInfo[] = master.bars.map((b: any, i: number) => {
    const M: MeasureInfo = { number: String(b.number), len: F(b.barLen) };
    const ts = b.timesig as [number, number] | undefined;
    if (ts && (i === 0 || String(ts) !== lastTime)) { M.time = [ts[0], ts[1]]; lastTime = String(ts); if (b.tsInferred) M.timeShow = i === 0; }
    let k: number | null = i === 0 ? firstKey : null; if (i > 0) for (const kk of keys) if (kk[i] != null) { k = kk[i]; break; }
    if (k != null && k !== lastKey) { M.key = k; lastKey = k; }
    const tm = (b.tempoMarks || []).find((x: any) => x.bpm);
    if (tm) M.tempo = { bpm: tm.bpm, unit: UNIT(tm.unit, !!tm.dotted) };
    if (b.repeatStart) M.repeatStart = true;
    if (b.repeatEnd) M.repeatEnd = b.repeatTimes > 2 ? b.repeatTimes - 1 : 1;
    if (b.segno) M.segno = true;
    if (b.codaStart) M.coda = true;
    const words: string[] = [];
    if (b.dc) words.push('D.C.'); if (b.ds) words.push('D.S.'); if (b.fine) words.push('Fine'); if (b.toCoda) words.push('To Coda');
    if (words.length) M.words = words;
    if (b.warnings && b.warnings.length) for (const w of b.warnings) warnings.push(`${b.number}마디: ${w}`);
    return M;
  });
  // 도돌이 괄호(volta): 이어진 같은 번호 마디를 한 괄호로
  for (let i = 0; i < master.bars.length; i++) {
    const v = master.bars[i].volta; if (!v) continue;
    const num = v.join(','); let j = i; while (j + 1 < master.bars.length && master.bars[j + 1].volta && master.bars[j + 1].volta.join(',') === num) j++;
    measures[i].ending = { num, type: 'start' };
    measures[j].endingStop = { num, type: measures[j].repeatEnd ? 'stop' : 'discontinue' };
    i = j;
  }
  for (const r of (master.rehearsal || [])) if (measures[r.idx]) measures[r.idx].rehearsal = r.text;

  // 파트
  let curTime: [number, number] | undefined;
  const beats = measures.map(M => { if (M.time) curTime = M.time; return beatOf(curTime); });
  const parts: Part[] = groups.map((g, gi) => {
    const id = 'P' + (gi + 1);
    const pms: PartMeasure[] = measures.map(() => ({ events: [] }));
    for (const s of g.srcs) {
      const r = res[s.line == null ? 0 : s.line];
      r.bars.forEach((b: any, i: number) => {
        if (i >= measures.length) return;
        const M = measures[i], byVoice: Record<number, Ev[]> = {};
        for (const e of b.events) {
          const voice = e.voice === 'L' ? 2 : 1;
          const ev: Ev = { staff: s.staff, voice, t: F(e.t), dur: F(e.dur) };
          if (g.perc) ev.notes = [{ step: 'C', alter: 0, oct: 5, head: e.xh ? 'x' : undefined }];
          else if (e.midis && e.midis.length) ev.notes = e.midis.map((m: number) => spell(m, e.dia ? e.dia[m] : undefined, e.kf || 0));
          else continue;
          if (e.tie) ev.notes = ev.notes!.map(n => ({ ...n, tieStop: true }));
          const mk: Mark[] = [];
          if (e.accent) mk.push({ k: 'accent' }); if (e.stacc) mk.push({ k: 'staccato' }); if (e.ten) mk.push({ k: 'tenuto' });
          if (e.roll) mk.push({ k: 'tremolo', n: 3 }); if (e.gliss) mk.push({ k: 'gliss' });
          if (mk.length) ev.marks = mk;
          const sl: ('start' | 'stop')[] = []; if (e.slurS) sl.push('start'); if (e.slurE) sl.push('stop'); if (sl.length) ev.slur = sl;
          (byVoice[voice] = byVoice[voice] || []).push(ev);
          if (e.graceMidis && e.graceMidis.length && !g.perc) for (const gm of e.graceMidis) byVoice[voice].push({ staff: s.staff, voice, t: ev.t, dur: ZERO, grace: 'acciaccatura', type: 'eighth', notes: [spell(gm, undefined, e.kf || 0)] });
        }
        // 같은 성부·같은 시작·같은 길이 = 화음으로 합침, 길이가 다르면 다음 성부로
        const fixed: Record<number, Ev[]> = {};
        for (const [vs, list] of Object.entries(byVoice)) for (const ev of list.sort((a, b) => cmp(a.t, b.t))) {
          let v = +vs;
          for (;;) {
            const L = fixed[v] = fixed[v] || [];
            const same = L.find(x => !x.grace && !ev.grace && cmp(x.t, ev.t) === 0);
            if (!same) { L.push({ ...ev, voice: v }); break; }
            if (cmp(same.dur, ev.dur) === 0) { for (const n of ev.notes || []) if (!same.notes!.some(m => m.step === n.step && m.oct === n.oct && m.alter === n.alter)) same.notes!.push(n); break; }
            v = v < 2 ? 2 : v + 1; if (v > 4) break;
          }
        }
        // 성부 번호는 오선마다 1부터 (아랫줄만 L 성부로 읽힌 큰보표 등). 첫 성부의 쉼표는 보이게, 다음 성부의 빈자리는 숨김
        const vs = Object.keys(fixed).map(Number).filter(v => fixed[v].length).sort();
        if (!vs.length) pms[i].events.push(...notateVoice([], { len: M.len, beat: beats[i], fillRests: true }).map(e => ({ ...e, staff: s.staff, voice: 1 })));
        vs.forEach((v, k) => pms[i].events.push(...notateVoice(fixed[v], { len: M.len, beat: beats[i], fillRests: true, hideRests: k > 0 }).map(e => ({ ...e, staff: s.staff, voice: k + 1 }))));
      });
      // 해석된 마디가 모자란 줄: 온쉼표로 채움
      for (let i = r.bars.length; i < measures.length; i++) pms[i].events.push({ staff: s.staff, voice: 1, t: ZERO, dur: measures[i].len, rest: true, measureRest: true });
    }
    // 붙임줄: 이어받는 음(tieStop)이 있으면 앞 음에 tieStart
    for (const st of g.srcs.map(s => s.staff)) {
      let prev: Ev | null = null;
      pms.forEach(pm => {
        for (const e of pm.events.filter(e => e.staff === st && !e.grace && !e.hidden).sort((a, b) => cmp(a.t, b.t) || a.voice - b.voice)) {
          if (e.notes && prev && prev.notes) for (const n of e.notes) if (n.tieStop) { const p = prev.notes.find(m => m.step === n.step && m.oct === n.oct); if (p) p.tieStart = true; else n.tieStop = false; }
          prev = e.rest ? null : e;
        }
      });
    }
    const inst = g.perc ? 'perc' : (guessInstrument(g.name) || 'gayageum');
    return { id, name: g.name, inst, kind: g.perc ? 'perc' : 'pitched', staves: g.srcs.length, clefs: g.bases.map(b => clefOf(b, g.perc)), measures: pms };
  });

  // 셈여림·글자: 해석기 표시 위치 p0 = 마디 번호(0부터) + 마디 안 비율
  const dirsFrom = (r: any, part: Part) => {
    const seen = new Set<string>();
    for (const d of (r.marks && r.marks.dyn) || []) {
      if (d.kind !== 'mark' || !d.label) continue;
      const i = Math.floor(d.p0), M = measures[i]; if (!M) continue;
      const t = fr(Math.round((d.p0 - i) * M.len[0] * 48 / M.len[1]), 48), key = `${i}|${d.label}`;
      if (seen.has(key)) continue; seen.add(key);
      (part.measures[i].dirs = part.measures[i].dirs || []).push({ t, kind: 'dyn', value: d.label } as Dir);
    }
  };
  groups.forEach((g, gi) => dirsFrom(res[g.srcs[0].line == null ? 0 : g.srcs[0].line!], parts[gi]));

  const score: Score = { format: 'swc', v: 0, meta: { title: sc.title || '', subtitle: sc.partName && !sc.isFull ? sc.partName : undefined }, measures, parts };
  return { score, warnings };
}
