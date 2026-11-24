// .swc → MusicXML(score-partwise 4.0)
// 화면 그리기(Verovio에 넘김)와 피날레·뮤즈스코어로 내보내기에 같은 글쓴이를 쓴다 — 보이는 것과 내보낸 것이 늘 같도록.
import { fr, add, sub, mul, cmp, lcm, ZERO, type Frac } from '../swc/frac.ts';
import type { Score, Part, Ev, Pitch, Dir, MeasureInfo } from '../swc/model.ts';

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TYPES: [string, Frac][] = [['breve', [2, 1]], ['whole', [1, 1]], ['half', [1, 2]], ['quarter', [1, 4]], ['eighth', [1, 8]], ['16th', [1, 16]], ['32nd', [1, 32]], ['64th', [1, 64]], ['128th', [1, 128]]];
const UNIT_TYPE = { q: ['quarter', false], dq: ['quarter', true], e: ['eighth', false], h: ['half', false] } as const;
const ARTIC_XML: Record<string, string> = { staccato: 'staccato', staccatissimo: 'staccatissimo', accent: 'accent', marcato: 'strong-accent', tenuto: 'tenuto', portato: 'detached-legato' };

// 적힌 길이(잇단음표면 늘린 길이)에서 음표 종류·점 수
export function typeOf(written: Frac): { type: string; dots: number } | null {
  for (const [ty, base] of TYPES) for (let d = 0; d <= 3; d++) {
    const len = mul(base, [2 ** (d + 1) - 1, 2 ** d]);   // 점 d개 = base × (2 − 1/2^d)
    if (cmp(len, written) === 0) return { type: ty, dots: d };
  }
  return null;
}

function divisionsOf(score: Score): number {
  let L = 1;
  const take = (f: Frac) => { const q = mul(f, [4, 1]); L = lcm(L, q[1]); };   // 4분음표 단위의 분모
  score.measures.forEach(m => take(m.len));
  for (const p of score.parts) for (const pm of p.measures) { for (const e of pm.events) { take(e.t); take(e.dur); } for (const d of pm.dirs || []) take(d.t); }
  return Math.min(L, 1 << 20);
}

export function toMusicXml(score: Score): string {
  const D = divisionsOf(score), dv = (f: Frac) => Math.round((f[0] * 4 * D) / f[1]);
  const o: string[] = [];
  o.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    `<work><work-title>${esc(score.meta.title)}</work-title></work>`,
    '<identification>' + (score.meta.composer ? `<creator type="composer">${esc(score.meta.composer)}</creator>` : '') + (score.meta.arranger ? `<creator type="arranger">${esc(score.meta.arranger)}</creator>` : '') + '<encoding><software>ScoreWorks Studio</software></encoding></identification>');
  // 파트 목록 + 악기 갈래 묶음 괄호
  o.push('<part-list>');
  let g = '', gn = 0;
  score.parts.forEach(p => {
    if ((p.group || '') !== g) { if (g) o.push(`<part-group type="stop" number="${gn}"/>`); g = p.group || ''; if (g) o.push(`<part-group type="start" number="${++gn}"><group-symbol>bracket</group-symbol><group-barline>yes</group-barline></part-group>`); }
    o.push(`<score-part id="${esc(p.id)}"><part-name>${esc(p.name)}</part-name>${p.abbr ? `<part-abbreviation>${esc(p.abbr)}</part-abbreviation>` : ''}</score-part>`);
  });
  if (g) o.push(`<part-group type="stop" number="${gn}"/>`);
  o.push('</part-list>');

  for (const p of score.parts) {
    o.push(`<part id="${esc(p.id)}">`);
    let key: number | undefined;
    score.measures.forEach((M, mi) => {
      o.push(`<measure number="${esc(M.number)}">`);
      if (mi > 0 && (M.pageBreak || M.systemBreak)) o.push(`<print ${M.pageBreak ? 'new-page' : 'new-system'}="yes"/>`);
      if (M.repeatStart || M.ending) o.push(`<barline location="left">${M.repeatStart ? '<bar-style>heavy-light</bar-style>' : ''}${M.ending ? `<ending number="${esc(M.ending.num)}" type="start"/>` : ''}${M.repeatStart ? '<repeat direction="forward"/>' : ''}</barline>`);
      const at: string[] = [];
      if (mi === 0) at.push(`<divisions>${D}</divisions>`);
      if (M.key != null && M.key !== key) { at.push(`<key><fifths>${M.key}</fifths>${M.mode ? `<mode>${esc(M.mode)}</mode>` : ''}</key>`); key = M.key; }
      else if (mi === 0) { at.push('<key><fifths>0</fifths></key>'); key = 0; }
      if (M.time) at.push(`<time${M.timeShow === false ? ' print-object="no"' : ''}><beats>${M.time[0]}</beats><beat-type>${M.time[1]}</beat-type></time>`);
      if (mi === 0) {
        if (p.staves > 1) at.push(`<staves>${p.staves}</staves>`);
        p.clefs.slice(0, p.staves).forEach((c, i) => at.push(clefXml(c, p.staves > 1 ? i + 1 : 0)));
        if (p.transpose && (p.transpose.octave || p.transpose.chromatic)) at.push(`<transpose>${p.transpose.diatonic != null ? `<diatonic>${p.transpose.diatonic}</diatonic>` : ''}<chromatic>${p.transpose.chromatic || 0}</chromatic>${p.transpose.octave ? `<octave-change>${p.transpose.octave}</octave-change>` : ''}</transpose>`);
      }
      if (at.length) o.push('<attributes>' + at.join('') + '</attributes>');
      if (p === score.parts[0]) o.push(...measureDirs(M, dv));
      o.push(...measureBody(p, mi, M, dv));
      const right: string[] = [];
      const bs = M.barline === 'double' ? 'light-light' : M.barline === 'final' ? 'light-heavy' : M.barline === 'dashed' ? 'dashed' : M.barline === 'none' ? 'none' : M.repeatEnd ? 'light-heavy' : '';
      if (bs) right.push(`<bar-style>${bs}</bar-style>`);
      if (M.endingStop) right.push(`<ending number="${esc(M.endingStop.num)}" type="${M.endingStop.type}"/>`);
      if (M.repeatEnd) right.push(`<repeat direction="backward"${M.repeatEnd > 1 ? ` times="${M.repeatEnd + 1}"` : ''}/>`);
      if (right.length) o.push(`<barline location="right">${right.join('')}</barline>`);
      o.push('</measure>');
    });
    o.push('</part>');
  }
  o.push('</score-partwise>');
  return o.join('\n');
}

function clefXml(c: { sign: string; line: number; octave?: number }, n: number): string {
  return `<clef${n ? ` number="${n}"` : ''}><sign>${c.sign}</sign>${c.sign === 'percussion' ? '' : `<line>${c.line}</line>`}${c.octave ? `<clef-octave-change>${c.octave}</clef-octave-change>` : ''}</clef>`;
}

function measureDirs(M: MeasureInfo, dv: (f: Frac) => number): string[] {
  const o: string[] = [];
  if (M.rehearsal) o.push(`<direction placement="above"><direction-type><rehearsal enclosure="square">${esc(M.rehearsal)}</rehearsal></direction-type></direction>`);
  if (M.segno) o.push('<direction placement="above"><direction-type><segno/></direction-type></direction>');
  if (M.coda) o.push('<direction placement="above"><direction-type><coda/></direction-type></direction>');
  if (M.tempo) {
    const [ty, dot] = UNIT_TYPE[M.tempo.unit] || UNIT_TYPE.q, qpm = M.tempo.bpm * (M.tempo.unit === 'dq' ? 1.5 : M.tempo.unit === 'e' ? 0.5 : M.tempo.unit === 'h' ? 2 : 1);
    const off = M.tempo.t && cmp(M.tempo.t, ZERO) > 0 ? `<offset>${dv(M.tempo.t)}</offset>` : '';
    o.push(`<direction placement="above"><direction-type><metronome parentheses="no"><beat-unit>${ty}</beat-unit>${dot ? '<beat-unit-dot/>' : ''}<per-minute>${M.tempo.bpm}</per-minute></metronome></direction-type>${off}<sound tempo="${+qpm.toFixed(2)}"/></direction>`);
  }
  for (const w of M.words || []) o.push(`<direction placement="above"><direction-type><words font-style="italic">${esc(w)}</words></direction-type></direction>`);
  return o;
}

function dirXml(d: Dir, staffTag: string, offset: number): string {
  const off = offset ? `<offset>${offset}</offset>` : '', pl = d.placement || (d.kind === 'dyn' || d.kind === 'wedge' ? 'below' : 'above');
  const inner = d.kind === 'dyn' ? (/^(p{1,4}|f{1,4}|mp|mf|sfz?|sffz|fp|rf|rfz|fz)$/.test(d.value) ? `<dynamics><${d.value}/></dynamics>` : `<dynamics><other-dynamics>${esc(d.value)}</other-dynamics></dynamics>`)
    : d.kind === 'wedge' ? `<wedge type="${d.value === 'diminuendo' ? 'diminuendo' : d.value === 'stop' ? 'stop' : 'crescendo'}"/>`
    : `<words${/^[A-Za-z .,()'"\-]+$/.test(d.value) ? ' font-style="italic"' : ''}>${esc(d.value)}</words>`;
  return `<direction placement="${pl}"><direction-type>${inner}</direction-type>${off}${staffTag}</direction>`;
}

function measureBody(p: Part, mi: number, M: MeasureInfo, dv: (f: Frac) => number): string[] {
  const pm = p.measures[mi] || { events: [] }, o: string[] = [];
  // 성부마다 따로 적고 backup으로 마디 처음으로 돌아간다(성부 = 오선×10 + 성부 번호)
  const byVoice = new Map<number, Ev[]>();
  for (const e of pm.events) { const k = e.staff * 10 + e.voice; if (!byVoice.has(k)) byVoice.set(k, []); byVoice.get(k)!.push(e); }
  const dirs = [...(pm.dirs || [])];
  const voices = [...byVoice.keys()].sort((a, b) => a - b);
  if (!voices.length) voices.push(11);
  voices.forEach((vk, vi) => {
    const evs = (byVoice.get(vk) || []).slice().sort((a, b) => cmp(a.t, b.t) || (a.grace ? -1 : 0) - (b.grace ? -1 : 0));
    const staff = Math.floor(vk / 10), voice = vk % 10, staffTag = p.staves > 1 ? `<staff>${staff}</staff>` : '';
    if (vi > 0) o.push(`<backup><duration>${dv(M.len)}</duration></backup>`);
    let pos: Frac = ZERO;
    // 이 성부(첫 성부는 오선 지정 없는 것 포함)의 지시를 자리에 맞게
    const myDirs = dirs.filter(d => vi === 0 ? !d.staff || d.staff === staff : d.staff === staff && !voices.slice(0, vi).some(v => Math.floor(v / 10) === staff));
    const putDirs = (upto: Frac, inclusive: boolean) => {
      for (const d of myDirs.slice()) if (cmp(d.t, upto) < 0 || (inclusive && cmp(d.t, upto) === 0)) { o.push(dirXml(d, staffTag, dv(sub(d.t, pos)))); myDirs.splice(myDirs.indexOf(d), 1); dirs.splice(dirs.indexOf(d), 1); }
    };
    if (!evs.length) { putDirs(M.len, true); o.push(`<note><rest measure="yes"/><duration>${dv(M.len)}</duration><voice>${voice}</voice>${staffTag}</note>`); pos = M.len; return; }
    for (const e of evs) {
      if (cmp(e.t, pos) > 0) { putDirs(e.t, false); o.push(`<forward><duration>${dv(sub(e.t, pos))}</duration><voice>${voice}</voice>${staffTag}</forward>`); pos = e.t; }
      putDirs(pos, true);
      o.push(...noteXml(e, voice, staffTag, dv, p.kind === 'perc', M));
      if (!e.grace) pos = add(pos, e.dur);
    }
    putDirs(M.len, true);
    if (cmp(pos, M.len) < 0) o.push(`<forward><duration>${dv(sub(M.len, pos))}</duration><voice>${voice}</voice>${staffTag}</forward>`);
  });
  return o;
}

function noteXml(e: Ev, voice: number, staffTag: string, dv: (f: Frac) => number, perc: boolean, M: MeasureInfo): string[] {
  const o: string[] = [];
  const written = e.tuplet ? mul(e.dur, fr(e.tuplet.actual, e.tuplet.normal)) : e.dur;
  const tt = e.type ? { type: e.type, dots: e.dots || 0 } : e.measureRest ? null : typeOf(written);
  const tail = () => {
    let s = '';
    if (tt) s += `<type>${tt.type}</type>` + '<dot/>'.repeat(tt.dots);
    return s;
  };
  const notations = (p: Pitch | null, first: boolean): string => {
    const n: string[] = [];
    if (p && p.tieStop) n.push('<tied type="stop"/>');
    if (p && p.tieStart) n.push('<tied type="start"/>');
    if (first) {
      for (const s of e.slur || []) n.push(`<slur type="${s}"/>`);
      if (e.tuplet && e.tuplet.start) n.push(`<tuplet type="start"${e.tuplet.bracket === false ? ' bracket="no"' : ''}/>`);
      if (e.tuplet && e.tuplet.stop) n.push('<tuplet type="stop"/>');
      const ar = (e.marks || []).filter(m => ARTIC_XML[m.k]).map(m => `<${ARTIC_XML[m.k]}/>`);
      if (ar.length) n.push(`<articulations>${ar.join('')}</articulations>`);
      const orn: string[] = [];
      for (const m of e.marks || []) {
        if (m.k === 'trill') orn.push('<trill-mark/>');
        if (m.k === 'nonghyeon' || m.k === 'yoseong') orn.push('<wavy-line type="start"/>', '<wavy-line type="stop"/>');
        if (m.k === 'tremolo') orn.push(`<tremolo type="single">${m.n || 3}</tremolo>`);
      }
      if (orn.length) n.push(`<ornaments>${orn.join('')}</ornaments>`);
      if ((e.marks || []).some(m => m.k === 'fermata')) n.push('<fermata type="upright"/>');
    }
    return n.length ? `<notations>${n.join('')}</notations>` : '';
  };
  const dur = e.grace ? '' : `<duration>${dv(e.dur)}</duration>`;
  const grace = e.grace ? `<grace${e.grace === 'acciaccatura' ? ' slash="yes"' : ''}/>` : '';
  const tmod = e.tuplet ? `<time-modification><actual-notes>${e.tuplet.actual}</actual-notes><normal-notes>${e.tuplet.normal}</normal-notes></time-modification>` : '';
  const stem = e.stem ? `<stem>${e.stem}</stem>` : '';
  const beams = (e.beams || []).map((b, i) => `<beam number="${i + 1}">${b}</beam>`).join('');
  if (e.rest || !e.notes || !e.notes.length) {
    const mr = e.measureRest || (cmp(e.t, ZERO) === 0 && cmp(e.dur, M.len) === 0 && !tt);
    o.push(`<note${e.hidden ? ' print-object="no"' : ''}><rest${mr ? ' measure="yes"' : ''}/>${dur}<voice>${voice}</voice>${mr ? '' : tail()}${tmod}${staffTag}${notations(null, true)}</note>`);
    return o;
  }
  e.notes.forEach((p, i) => {
    const pitch = perc ? `<unpitched><display-step>${p.step}</display-step><display-octave>${p.oct}</display-octave></unpitched>` : `<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.oct}</octave></pitch>`;
    const ties = (p.tieStop ? '<tie type="stop"/>' : '') + (p.tieStart ? '<tie type="start"/>' : '');
    const acc = p.acc ? `<accidental>${esc(p.acc)}</accidental>` : '';
    const head = p.head ? `<notehead>${esc(p.head)}</notehead>` : '';
    o.push(`<note>${grace}${i ? '<chord/>' : ''}${pitch}${dur}${ties}<voice>${voice}</voice>${tail()}${acc}${tmod}${stem}${head}${staffTag}${i ? '' : beams}${notations(p, i === 0)}</note>`);
  });
  return o;
}
