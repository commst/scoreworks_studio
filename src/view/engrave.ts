// Verovio로 악보 쪽 그리기. .swc → MusicXML(io/musicxml-out.ts) → Verovio → 쪽마다 SVG
// Verovio(약 2.4MB)는 처음 악보를 열 때 받는다(첫 화면이 빨리 뜨게).
let tkPromise: Promise<any> | null = null;
function toolkit(): Promise<any> {
  if (!tkPromise) tkPromise = (async () => {
    const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([import('verovio/wasm'), import('verovio/esm')]);
    const M = await createVerovioModule();
    return new VerovioToolkit(M);
  })();
  return tkPromise;
}

export interface EngraveOpts { width: number; zoom: number }   // width: 화면 폭(px), zoom: 100 = 보통

export interface Engraved { pages: number; svg(page: number): string; timemap(): any[]; tk: any }

export async function engrave(xml: string, o: EngraveOpts): Promise<Engraved> {
  const tk = await toolkit();
  const scale = Math.round(40 * o.zoom / 100);   // Verovio scale 40 ≈ 화면에서 읽기 좋은 크기
  tk.setOptions({
    scale,
    pageWidth: Math.max(800, Math.round(o.width * 100 / scale)),
    pageHeight: 60000, adjustPageHeight: true,   // 화면에서는 한 쪽을 길게(넘기지 않고 내려 보기). 인쇄용 쪽 나누기는 따로
    pageMarginTop: 60, pageMarginBottom: 60, pageMarginLeft: 50, pageMarginRight: 50,
    breaks: 'auto', header: 'auto', footer: 'none',
    mnumInterval: 1,   // 마디 번호를 모든 마디에 (합주 연습에서 마디를 찾기 쉽게)
    svgViewBox: true, svgHtml5: true, svgRemoveXlink: true,
    justificationMaxVertical: 0,
  });
  if (!tk.loadData(xml)) throw new Error('악보를 그리지 못했습니다(Verovio): ' + tk.getLog());
  const pages = tk.getPageCount();
  return { pages, svg: (p: number) => tk.renderToSVG(p), timemap: () => tk.renderToTimemap({ includeMeasures: true }), tk };
}
