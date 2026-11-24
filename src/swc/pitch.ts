// 음높이 도우미: MIDI ↔ 음 이름
import type { Pitch } from './model.ts';
export const NAT = [0, 2, 4, 5, 7, 9, 11], LET = 'CDEFGAB';
export const midiOf = (p: Pitch) => 12 * (p.oct + 1) + NAT[LET.indexOf(p.step)] + (p.alter || 0);
// 음 이름: 해석기가 읽은 온음 자리(dia)가 있으면 그대로, 없으면 조표로
const SHARPS = [3, 0, 4, 1, 5, 2, 6], FLATS = [6, 2, 5, 1, 4, 0, 3];
function keyAlt(k: number) { const a = [0, 0, 0, 0, 0, 0, 0]; if (k > 0) for (let i = 0; i < k; i++) a[SHARPS[i]] = 1; else for (let i = 0; i < -k; i++) a[FLATS[i]] = -1; return a; }
export function spell(midi: number, dia: number | undefined, kf: number): Pitch {
  if (dia != null) {
    const st = ((dia % 7) + 7) % 7, oct = Math.floor(dia / 7), alter = midi - (12 * (oct + 1) + NAT[st]);
    if (Math.abs(alter) <= 2) return { step: LET[st] as Pitch['step'], alter, oct };
  }
  const a = keyAlt(kf), pc = ((midi % 12) + 12) % 12;
  for (let st = 0; st < 7; st++) if ((NAT[st] + a[st] + 12) % 12 === pc) return { step: LET[st] as Pitch['step'], alter: a[st], oct: Math.round((midi - a[st] - NAT[st]) / 12) - 1 };
  const nat = NAT.indexOf(pc);
  if (nat >= 0) return { step: LET[nat] as Pitch['step'], alter: 0, oct: Math.round((midi - NAT[nat]) / 12) - 1 };
  const st = kf < 0 ? NAT.indexOf(pc + 1) : NAT.indexOf(pc - 1), al = kf < 0 ? -1 : 1;
  return { step: LET[st] as Pitch['step'], alter: al, oct: Math.round((midi - al - NAT[st]) / 12) - 1 };
}

