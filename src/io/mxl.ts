// 압축 MusicXML(.mxl) 풀기: META-INF/container.xml이 가리키는 악보 파일, 없으면 첫 .xml/.musicxml
import { unzipSync, strFromU8 } from 'fflate';
export function unzipMxl(buf: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(buf));
  let path = '';
  const c = files['META-INF/container.xml'];
  if (c) { const m = /<rootfile[^>]*full-path="([^"]+)"/.exec(strFromU8(c)); if (m) path = m[1]; }
  if (!path || !files[path]) path = Object.keys(files).find(k => !k.startsWith('META-INF/') && /\.(musicxml|xml)$/i.test(k)) || '';
  if (!path) throw new Error('.mxl 안에서 악보 파일을 찾지 못했습니다');
  return strFromU8(files[path]);
}
