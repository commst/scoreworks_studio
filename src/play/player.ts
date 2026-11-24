// .swc → ScoreWorks 재생 엔진 (renderPlan → mixNotes·mix → WAV)
// 소리는 ScoreWorks와 같은 녹음·같은 규칙(악기 이름으로 소리 고르기, 농현, 타악 소리)을 쓴다.
// @ts-ignore — 공통 모듈은 자바스크립트(ScoreWorks 그대로)
import { playbackOrder } from '../../shared/scoreworks/score-parser.js';
// @ts-ignore
import { SR, renderPlan, mix, makeSounds, decodeRecorded, fitLevel, encodeWav } from '../../shared/scoreworks/audio-engine.js';
// @ts-ignore
import { INSTRUMENTS, setBank, mixNotes, clearNoteCache } from '../../shared/scoreworks/melody-engine.js';
// @ts-ignore — 타악 녹음은 따로 받는 파일로 (빌드 때 assets로 복사됨)
import samplesUrl from '../../shared/scoreworks/samples.json?url';
import type { Score } from '../swc/model.ts';
import { toEngineBars, type PlayLine } from './adapter.ts';
export type { PlayLine } from './adapter.ts';
export { toEngineBars, defaultInst, midiOf } from './adapter.ts';
const INST: Record<string, any> = INSTRUMENTS;

// 줄 악기에 필요한 녹음들 (ScoreWorks banksOf와 같음 — 아쟁은 pizz. 녹음도)
export function banksOf(inst: string): string[] {
  const b = INST[inst] && INST[inst].bank;
  return inst === 'ajaeng' || inst === 'ajaeng_syn' ? [b, 'ajaeng_pizz'].filter(Boolean) : b ? [b] : [];
}

// 녹음 묶음 받기 (public/banks) — 한 번 받은 것은 기억
const bankPromise: Record<string, Promise<boolean>> = {};
export function loadBank(name: string): Promise<boolean> {
  if (!bankPromise[name]) bankPromise[name] = (async () => {
    try {
      const base = import.meta.env.BASE_URL || './';
      const [meta, ab] = await Promise.all([
        fetch(`${base}banks/${name}.json`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }),
        fetch(`${base}banks/${name}.mp3`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); }),
      ]);
      const OAC = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      let oc: any; try { oc = new OAC(1, 1, SR); } catch (e) { oc = new OAC(1, 1, 44100); }
      const buf: AudioBuffer = await new Promise((ok, no) => { const p = oc.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); });
      let x = buf.getChannelData(0);
      if (buf.sampleRate !== SR) { const r = buf.sampleRate / SR, n = Math.floor(x.length / r), y = new Float32Array(n); for (let i = 0; i < n; i++) { const q = i * r, k = q | 0, f = q - k; y[i] = x[k] * (1 - f) + (x[k + 1] || 0) * f; } x = y; }
      setBank(name, meta, x);
      document.documentElement.dataset['bank' + name] = 'ok';
      return true;
    } catch (e) { console.warn('녹음을 받지 못함', name, e); return false; }
  })();
  return bankPromise[name];
}

let sounds: any = null;
async function percSounds() {
  if (sounds) return sounds;
  let rec = {};
  try { rec = decodeRecorded(await fetch(samplesUrl).then(r => r.json())); } catch (e) { console.warn('타악 녹음을 받지 못해 합성음으로', e); }
  return (sounds = { ...makeSounds(), ...rec });
}

export interface RenderOpts { lines: Record<string, PlayLine>; speed: number; bpm: number; unit: 'q' | 'dq' | 'e' | 'h'; repeats: boolean; onProgress?: (f: number) => void }

// 소리 만들기 → { plan, blob(WAV) }
export async function renderScore(score: Score, o: RenderOpts) {
  const bars = toEngineBars(score);
  const melodic: Record<string, any> = {}, gains: Record<string, number> = {}, snd: Record<string, string> = {};
  for (const [id, L] of Object.entries(o.lines)) {
    if (!L.on) { for (const b of bars) b.events = b.events.filter((e: any) => e.line !== id); continue; }
    gains[id] = L.vol;
    if (L.inst === 'perc') { snd[id + ':R'] = '따'; snd[id + ':L'] = '궁'; }
    else { melodic[id] = { inst: L.inst, oct: L.oct || 0, nong: true }; for (const b of banksOf(L.inst)) await loadBank(b); }
  }
  // 빠르기: 마디 정보의 빠르기 표시들, 없으면 기본
  const rows: any[] = [];
  score.measures.forEach((M, i) => { if (M.tempo) rows.push({ start: +M.number || i + 1, bpm: M.tempo.bpm, unit: M.tempo.unit }); });
  if (!rows.length || rows[0].start > bars[0].number) rows.unshift({ start: bars[0].number, bpm: o.bpm, unit: o.unit });
  const order = playbackOrder(bars, { repeats: o.repeats });
  const plan = renderPlan(bars, order, { tempoRows: rows, speed: o.speed, sounds: snd, melodic, lineGain: gains });
  const raw = mix(plan, await percSounds(), {}, null, false);
  const notes = plan.notes;
  for (let k = 0; k < notes.length; k += 40) {
    mixNotes(raw, notes.slice(k, k + 40));
    if (o.onProgress) o.onProgress(Math.min(0.98, (k + 40) / Math.max(1, notes.length)));
    await new Promise(r => setTimeout(r, 0));
  }
  clearNoteCache();
  fitLevel(raw);
  return { plan, bars, order, blob: new Blob([encodeWav(raw)], { type: 'audio/wav' }) };
}
