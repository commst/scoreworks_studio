// MusicXML(score-partwise) → .swc
// 피날레·뮤즈스코어·시벨리우스·ScoreWorks가 내보낸 파일을 읽는다. 브라우저는 DOMParser, 시험(Node)은 @xmldom/xmldom을 넘긴다.
import { fr, add, sub, cmp, ZERO, type Frac } from '../swc/frac.ts';
import type { Score, Part, PartMeasure, MeasureInfo, Ev, Pitch, Mark, Dir, Clef } from '../swc/model.ts';

type El = Element;
const kids = (e: El | null | undefined, name?: string): El[] => {
  const out: El[] = []; if (!e) return out;
  for (let n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 1 && (!name || n.nodeName === name)) out.push(n as El);
  return out;
};
const kid = (e: El | null | undefined, name: string): El | null => kids(e, name)[0] || null;
const txt = (e: El | null | undefined, name?: string): string => { const k = name ? kid(e, name) : e; return k ? (k.textContent || '').trim() : ''; };
const num = (e: El | null | undefined, name: string, d = 0): number => { const s = txt(e, name); return s === '' ? d : +s; };
const attr = (e: El | null | undefined, a: string): string => (e && e.getAttribute(a)) || '';

const ARTIC: Record<string, string> = { staccato: 'staccato', staccatissimo: 'staccatissimo', accent: 'accent', 'strong-accent': 'marcato', tenuto: 'tenuto', 'detached-legato': 'portato' };
const UNIT: Record<string, 'q' | 'dq' | 'e' | 'h'> = { quarter: 'q', eighth: 'e', half: 'h' };

export function parseMusicXml(xml: string, parse: (s: string) => Document = s => new DOMParser().parseFromString(s, 'application/xml')): Score {
  const doc = parse(xml);
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'score-partwise') throw new Error(root && root.nodeName === 'score-timewise' ? 'score-timewise MusicXML은 아직 읽지 못합니다' : 'MusicXML 악보가 아닙니다');
  const work = kid(root, 'work'), ident = kid(root, 'identification');
  const meta = { title: txt(work, 'work-title') || txt(root, 'movement-title') || '제목 없음', composer: '', arranger: '' };
  for (const c of kids(ident, 'creator')) { const ty = attr(c, 'type'); if (ty === 'composer') meta.composer = txt(c); else if (ty === 'arranger') meta.arranger = txt(c); }
  for (const c of kids(kid(root, 'credit'), 'credit-words')) if (!meta.composer && /작곡|comp/i.test(txt(c))) meta.composer = txt(c);

  const plist = kid(root, 'part-list'), names: Record<string, { name: string; abbr: string; perc: boolean; group?: string }> = {};
  let grp = '';
  for (const e of kids(plist)) {
    if (e.nodeName === 'part-group') { if (attr(e, 'type') === 'start') grp = txt(e, 'group-name') || grp || 'g' + attr(e, 'number'); else grp = ''; }
    else if (e.nodeName === 'score-part') {
      const perc = kids(e, 'score-instrument').some(si => /drum|perc|cymb|gong|bell/i.test(txt(si, 'instrument-name'))) || kids(e, 'midi-instrument').some(m => num(m, 'midi-channel') === 10);
      names[attr(e, 'id')] = { name: txt(e, 'part-name'), abbr: txt(e, 'part-abbreviation'), perc, group: grp || undefined };
    }
  }

  const measures: MeasureInfo[] = [];
  const parts: Part[] = [];
  kids(root, 'part').forEach((pe, pi) => {
    const id = attr(pe, 'id'), info = names[id] || { name: id, abbr: '', perc: false };
    const part: Part = { id, name: info.name, abbr: info.abbr || undefined, inst: '', kind: info.perc ? 'perc' : 'pitched', staves: 1, clefs: [{ sign: 'G', line: 2 }], group: info.group, measures: [] };
    let divs = 1;
    const ties = new Map<string, boolean>();   // 이어지는 붙임줄(음높이·성부)
    kids(pe, 'measure').forEach((me, mi) => {
      if (pi === 0) measures.push({ number: attr(me, 'number') || String(mi + 1), len: ZERO });
      const M = measures[mi];
      if (!M) return;
      const pm: PartMeasure = { events: [], dirs: [] };
      let pos: Frac = ZERO, maxPos: Frac = ZERO, last: Ev | null = null;
      const q = (d: number): Frac => fr(d, 4 * divs);   // divisions → 온음표
      for (const e of kids(me)) {
        switch (e.nodeName) {
          case 'attributes': {
            if (kid(e, 'divisions')) divs = num(e, 'divisions', 1);
            const key = kid(e, 'key'); if (key && pi === 0) { M.key = num(key, 'fifths'); const md = txt(key, 'mode'); if (md) M.mode = md; }
            const tm = kid(e, 'time'); if (tm && pi === 0) { M.time = [num(tm, 'beats', 4), num(tm, 'beat-type', 4)]; if (attr(tm, 'print-object') === 'no') M.timeShow = false; }
            if (kid(e, 'staves')) part.staves = num(e, 'staves', 1);
            for (const c of kids(e, 'clef')) {
              const st = +(attr(c, 'number') || 1), cl: Clef = { sign: (txt(c, 'sign') || 'G') as Clef['sign'], line: num(c, 'line', txt(c, 'sign') === 'F' ? 4 : 2) };
              const oc = num(c, 'clef-octave-change'); if (oc) cl.octave = oc;
              if (mi === 0 && cmp(pos, ZERO) === 0) part.clefs[st - 1] = cl; else (pm.clefs = pm.clefs || []).push({ t: pos, staff: st, clef: cl });
            }
            const tr = kid(e, 'transpose'); if (tr && mi === 0) part.transpose = { octave: num(tr, 'octave-change'), chromatic: num(tr, 'chromatic'), diatonic: num(tr, 'diatonic') };
            break;
          }
          case 'backup': pos = sub(pos, q(num(e, 'duration'))); if (cmp(pos, ZERO) < 0) pos = ZERO; break;
          case 'forward': pos = add(pos, q(num(e, 'duration'))); if (cmp(pos, maxPos) > 0) maxPos = pos; break;
          case 'direction': readDirection(e, pos, pm, M, pi, q); break;
          case 'sound': { const tp = +attr(e, 'tempo'); if (tp && pi === 0 && !M.tempo) M.tempo = { bpm: tp, unit: 'q', t: pos }; break; }
          case 'barline': readBarline(e, M, pi); break;
          case 'print': if (pi === 0) { if (attr(e, 'new-page') === 'yes') M.pageBreak = true; else if (attr(e, 'new-system') === 'yes') M.systemBreak = true; } break;
          case 'note': {
            const isChord = !!kid(e, 'chord'), grace = kid(e, 'grace'), cue = !!kid(e, 'cue');
            if (cue) break;
            const d = grace ? ZERO : q(num(e, 'duration'));
            const p = readPitch(e, part, ties, num(e, 'voice', 1));
            if (isChord && last && p) { (last.notes = last.notes || []).push(p); readNotations(e, last, p); break; }
            if (isChord) break;
            const ev: Ev = { staff: num(e, 'staff', 1), voice: num(e, 'voice', 1), t: pos, dur: d };
            if (kid(e, 'rest')) { ev.rest = true; if (attr(kid(e, 'rest'), 'measure') === 'yes') ev.measureRest = true; if (attr(e, 'print-object') === 'no') ev.hidden = true; }
            else if (p) ev.notes = [p];
            const ty = txt(e, 'type'); if (ty) ev.type = ty;
            const dots = kids(e, 'dot').length; if (dots) ev.dots = dots;
            const tmod = kid(e, 'time-modification'); if (tmod) ev.tuplet = { actual: num(tmod, 'actual-notes', 3), normal: num(tmod, 'normal-notes', 2) };
            if (grace) ev.grace = attr(grace, 'slash') === 'yes' ? 'acciaccatura' : 'appoggiatura';
            const st = txt(e, 'stem'); if (st === 'up' || st === 'down') ev.stem = st;
            const bm = kids(e, 'beam'); if (bm.length) ev.beams = bm.map(b => txt(b));
            readNotations(e, ev, p);
            pm.events.push(ev); last = ev;
            if (!grace) { pos = add(pos, d); if (cmp(pos, maxPos) > 0) maxPos = pos; }
            break;
          }
        }
      }
      if (pi === 0 || cmp(maxPos, M.len) > 0) M.len = maxPos;
      if (!pm.dirs!.length) delete pm.dirs;
      part.measures.push(pm);
    });
    parts.push(part);
  });
  // 박자표에서 정한 길이(온마디 쉼표만 있는 마디 등은 쉼표 길이가 박자와 다를 수 있음)
  let ts: [number, number] = [4, 4];
  for (const M of measures) { if (M.time) ts = M.time; if (cmp(M.len, ZERO) === 0) M.len = fr(ts[0], ts[1]); }
  for (const p of parts) p.measures.forEach((pm, i) => { for (const e of pm.events) if (e.measureRest) e.dur = measures[i].len; });
  return { format: 'swc', v: 0, meta, measures, parts };
}

function readPitch(e: El, part: Part, ties: Map<string, boolean>, voice: number): Pitch | undefined {
  const pe = kid(e, 'pitch'), un = kid(e, 'unpitched');
  let p: Pitch | undefined;
  if (pe) p = { step: txt(pe, 'step') as Pitch['step'], alter: num(pe, 'alter'), oct: num(pe, 'octave', 4) };
  else if (un) { p = { step: (txt(un, 'display-step') || 'E') as Pitch['step'], alter: 0, oct: num(un, 'display-octave', 4) }; part.kind = 'perc'; }
  if (!p) return undefined;
  const acc = txt(e, 'accidental'); if (acc) p.acc = acc;
  const nh = txt(e, 'notehead'); if (nh && nh !== 'normal') p.head = nh;
  for (const t of kids(e, 'tie')) { if (attr(t, 'type') === 'start') p.tieStart = true; else if (attr(t, 'type') === 'stop') p.tieStop = true; }
  void ties; void voice;
  return p;
}

function readNotations(e: El, ev: Ev, p: Pitch | undefined): void {
  // 가사 1절 = 구음(이 프로그램이 적은 것과 같은 자리)
  for (const l of kids(e, 'lyric')) { const tx = kid(l, 'text'); if (tx && txt(tx) && !(ev.marks || []).some(m => m.k === 'gueum')) (ev.marks = ev.marks || []).push({ k: 'gueum', text: txt(tx) }); }
  for (const n of kids(e, 'notations')) {
    for (const t of kids(n, 'tied')) if (p) { if (attr(t, 'type') === 'start') p.tieStart = true; else if (attr(t, 'type') === 'stop') p.tieStop = true; }
    for (const s of kids(n, 'slur')) { const ty = attr(s, 'type'); if (ty === 'start' || ty === 'stop') (ev.slur = ev.slur || []).push(ty); }
    for (const t of kids(n, 'tuplet')) if (ev.tuplet) { if (attr(t, 'type') === 'start') { ev.tuplet.start = true; ev.tuplet.bracket = attr(t, 'bracket') !== 'no'; } else ev.tuplet.stop = true; }
    const mk = (m: Mark) => { if (!(ev.marks || []).some(x => x.k === m.k)) (ev.marks = ev.marks || []).push(m); };
    for (const a of kids(n, 'articulations')) for (const x of kids(a)) if (ARTIC[x.nodeName]) mk({ k: ARTIC[x.nodeName] });
    for (const o of kids(n, 'ornaments')) for (const x of kids(o)) {
      if (x.nodeName === 'trill-mark') mk({ k: 'trill' });
      else if (x.nodeName === 'wavy-line' && attr(x, 'type') === 'start') mk({ k: 'nonghyeon' });   // ScoreWorks: 물결선만 = 농현(182번)
      else if (x.nodeName === 'tremolo') mk({ k: 'tremolo', n: +(x.textContent || 3) });
    }
    if (kid(n, 'fermata')) mk({ k: 'fermata' });
    for (const g of [...kids(n, 'glissando'), ...kids(n, 'slide')]) if (attr(g, 'type') === 'start') mk({ k: 'gliss' });
  }
}

function readDirection(e: El, pos: Frac, pm: PartMeasure, M: MeasureInfo, pi: number, q: (d: number) => Frac): void {
  const off = kid(e, 'offset'), t = off ? add(pos, q(+(off.textContent || 0))) : pos;
  const placement = (attr(e, 'placement') || undefined) as Dir['placement'], staff = kid(e, 'staff') ? num(e, 'staff', 1) : undefined;
  for (const dt of kids(e, 'direction-type')) for (const x of kids(dt)) {
    if (x.nodeName === 'dynamics') { const d = kids(x)[0]; if (d) pm.dirs!.push({ t, staff, kind: 'dyn', value: d.nodeName === 'other-dynamics' ? txt(d) : d.nodeName, placement }); }
    else if (x.nodeName === 'wedge') pm.dirs!.push({ t, staff, kind: 'wedge', value: attr(x, 'type'), placement });
    else if (x.nodeName === 'words') { const w = txt(x); if (w) pm.dirs!.push({ t, staff, kind: 'words', value: w, placement }); }
    else if (x.nodeName === 'rehearsal' && pi === 0) M.rehearsal = txt(x);
    else if (x.nodeName === 'segno' && pi === 0) M.segno = true;
    else if (x.nodeName === 'coda' && pi === 0) M.coda = true;
    else if (x.nodeName === 'metronome' && pi === 0) {
      const bu = txt(x, 'beat-unit'), dotted = !!kid(x, 'beat-unit-dot'), bpm = num(x, 'per-minute');
      if (bpm) M.tempo = { bpm, unit: bu === 'quarter' && dotted ? 'dq' : UNIT[bu] || 'q', t };
    }
  }
  const snd = kid(e, 'sound'), tp = snd ? +attr(snd, 'tempo') : 0;
  if (tp && pi === 0 && !M.tempo) M.tempo = { bpm: Math.round(tp), unit: 'q', t };
}

function readBarline(e: El, M: MeasureInfo, pi: number): void {
  if (pi !== 0) return;
  const loc = attr(e, 'location') || 'right', st = txt(e, 'bar-style'), rep = kid(e, 'repeat'), end = kid(e, 'ending');
  if (rep && attr(rep, 'direction') === 'forward') M.repeatStart = true;
  if (rep && attr(rep, 'direction') === 'backward') M.repeatEnd = +(attr(rep, 'times') || 2) - 1 || 1;
  if (end) { const ty = attr(end, 'type') as 'start' | 'stop' | 'discontinue'; if (ty === 'start') M.ending = { num: attr(end, 'number'), type: 'start' }; else M.endingStop = { num: attr(end, 'number'), type: ty }; }
  if (loc === 'right' && st) M.barline = st === 'light-light' ? 'double' : st === 'light-heavy' ? 'final' : st === 'dashed' ? 'dashed' : st === 'none' ? 'none' : 'regular';
}
