// 자동 저장(브라우저 IndexedDB): 마지막으로 연 악보와 설정을 고칠 때마다 저장하고, 다음에 열 때 이어서 열기
import type { Score } from '../swc/model.ts';

export interface Saved { score: Score; fileName: string; lines: Record<string, any>; view: number; at: number }

const DB = 'scoreworks-studio', ST = 'docs';
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, no) => { const t = d.transaction(ST, mode), r = f(t.objectStore(ST)); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); t.oncomplete = () => d.close(); });
}
export async function saveLast(s: Saved) { try { await tx('readwrite', st => st.put(s, 'last')); return true; } catch (e) { console.warn('자동 저장 실패', e); return false; } }
export async function loadLast(): Promise<Saved | null> { try { return (await tx<Saved>('readonly', st => st.get('last'))) || null; } catch (e) { return null; } }
export async function clearLast() { try { await tx('readwrite', st => st.delete('last')); } catch (e) { /* 없음 */ } }

// .swc 파일: JSON 한 파일(악보 + 재생 설정)
export function toSwcFile(s: Omit<Saved, 'at'>): string {
  return JSON.stringify({ ...s.score, studio: { fileName: s.fileName, lines: s.lines, view: s.view } });
}
export function fromSwcFile(text: string): { score: Score; studio?: { fileName?: string; lines?: Record<string, any>; view?: number } } {
  const o = JSON.parse(text);
  if (!o || o.format !== 'swc' || !Array.isArray(o.parts) || !Array.isArray(o.measures)) throw new Error('.swc 악보 파일이 아닙니다');
  if (o.v > 0) throw new Error('더 새 판의 .swc 파일입니다. 프로그램을 새로 고친 뒤 여세요');
  const studio = o.studio; delete o.studio;
  return { score: o as Score, studio };
}
