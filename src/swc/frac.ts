// 분수 [분자, 분모] — 박 위치·길이를 온음표 단위로 정확하게 (셋잇단 등에서 소수 오차가 생기지 않게)
export type Frac = [number, number];

export const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
export const fr = (n: number, d = 1): Frac => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return [n / g, d / g]; };
export const add = (a: Frac, b: Frac): Frac => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const sub = (a: Frac, b: Frac): Frac => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
export const mul = (a: Frac, b: Frac): Frac => fr(a[0] * b[0], a[1] * b[1]);
export const div = (a: Frac, b: Frac): Frac => fr(a[0] * b[1], a[1] * b[0]);
export const cmp = (a: Frac, b: Frac): number => a[0] * b[1] - b[0] * a[1];
export const val = (a: Frac): number => a[0] / a[1];
export const ZERO: Frac = [0, 1];
