// ScoreWorks Studio 악보 형식 (.swc) v0 — 설계서 3장
// 한 곡 = 곡 정보 + 마디 정보(박자·조표·빠르기·장단·반복, 모든 파트 공통) + 파트(악기)마다 마디별 사건(음·쉼표·지시).
// 시간은 모두 온음표 단위 분수(Frac). 오선보·정간보는 같은 자료를 다르게 그린 것이고, MusicXML은 주고받기용이다.
import type { Frac } from './frac.ts';

export interface Score {
  format: 'swc';
  v: 0;
  meta: Meta;
  measures: MeasureInfo[];   // 마디 순서(적힌 순서). 연주 순서는 반복 정보로 만든다
  parts: Part[];
}

export interface Meta { title: string; subtitle?: string; composer?: string; arranger?: string; lyricist?: string; }

export type Barline = 'regular' | 'double' | 'final' | 'dashed' | 'none';
export interface MeasureInfo {
  number: string;            // 적힌 마디 번호(못갖춘마디는 '0' 등)
  len: Frac;                 // 실제 길이
  time?: [number, number];   // 박자표가 바뀌는 마디에만 (beats, beat-type)
  timeShow?: boolean;        // false면 박자표를 그리지 않음(못갖춘마디 등)
  key?: number;              // 조표(올림표 +, 내림표 −), 바뀌는 마디에만
  mode?: string;
  tempo?: { bpm: number; unit: 'q' | 'dq' | 'e' | 'h'; text?: string; t?: Frac };
  jangdan?: string;          // 장단 이름(굿거리 등) — 2단계
  rehearsal?: string;        // 연습 번호
  repeatStart?: boolean;
  repeatEnd?: number;        // 되돌아가는 횟수(보통 1)
  ending?: { num: string; type: 'start' | 'stop' | 'discontinue' };
  endingStop?: { num: string; type: 'stop' | 'discontinue' };
  barline?: Barline;         // 오른쪽 마디선
  segno?: boolean; coda?: boolean; words?: string[];   // D.S.·Fine 등
  pageBreak?: boolean; systemBreak?: boolean;
}

export type Clef = { sign: 'G' | 'F' | 'C' | 'percussion' | 'TAB'; line: number; octave?: number };

export interface Part {
  id: string;
  name: string;
  abbr?: string;
  inst: string;              // 소리: ScoreWorks 악기 이름(gayageum 등) 또는 'perc'
  kind: 'pitched' | 'perc';
  staves: number;
  clefs: Clef[];             // 처음 음자리표(오선마다)
  transpose?: { octave: number; chromatic: number; diatonic?: number };   // 적는 음 → 소리 (태평소 등)
  group?: string;            // 악기 갈래(관악·찰현·발현·타악) — 묶음 괄호
  measures: PartMeasure[];   // Score.measures와 같은 수
}

export interface PartMeasure {
  events: Ev[];
  dirs?: Dir[];
  clefs?: { t: Frac; staff: number; clef: Clef }[];   // 마디 안에서 바뀌는 음자리표
}

export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  alter: number;             // −2..2 (반음)
  oct: number;               // 과학 표기(C4 = 가온 다)
  acc?: string;              // 적힌 임시표 기호(sharp·flat·natural 등) — 없으면 조표로 정함
  tieStart?: boolean; tieStop?: boolean;
  head?: string;             // x·diamond 등
}

export interface Ev {
  staff: number;             // 1부터
  voice: number;             // 1부터
  t: Frac;                   // 마디 안 시작
  dur: Frac;                 // 실제 길이(잇단음표면 줄어든 길이)
  rest?: boolean;
  hidden?: boolean;          // 숨긴 쉼표
  notes?: Pitch[];           // 음(화음이면 여럿). 쉼표면 없음
  type?: string;             // 적힌 음표 종류(quarter 등) — 없으면 길이로 정함
  dots?: number;
  tuplet?: { actual: number; normal: number; start?: boolean; stop?: boolean; bracket?: boolean };
  grace?: 'acciaccatura' | 'appoggiatura';
  beams?: string[];          // 단계별 begin·continue·end·forward hook 등
  stem?: 'up' | 'down';
  slur?: ('start' | 'stop')[];
  marks?: Mark[];
  measureRest?: boolean;     // 온마디 쉼표
}

// 아티큘레이션·국악 주법 기호. k = staccato·accent·tenuto·marcato·fermata·trill·tremolo(n)·gliss(steps)·
// nonghyeon(농현)·yoseong(요성)·jeonseong(전성)·toeseong(퇴성)·chuseong(추성)·pizz·arco 등
export interface Mark { k: string; n?: number; placement?: 'above' | 'below'; text?: string; }   // k = 'gueum': 사람이 적은 구음(text) — MusicXML 가사(lyric)로 주고받음

export interface Dir {
  t: Frac;
  staff?: number;
  kind: 'dyn' | 'words' | 'wedge' | 'pedal';
  value: string;             // p·mf / 글자 / crescendo·diminuendo·stop
  placement?: 'above' | 'below';
}
