# ScoreWorks Studio

**국악관현악 작곡·악보 편집 웹 프로그램** (개발 중)

피날레의 정밀한 조판과 뮤즈스코어의 쉬운 입력을 목표로, 국악관현악에 특화한 웹 작곡 프로그램입니다. 악보 PDF를 읽어 재생하는 [ScoreWorks](https://github.com/commst/scoreworks)의 해석기·국악기 녹음·재생 엔진을 함께 씁니다. ScoreWorks는 '읽고 연습하는' 도구, Studio는 '만들고 고치는' 도구입니다.

- 설계서: [docs/DESIGN.md](docs/DESIGN.md) (전체 설계서 원본은 claude.ai 문서 '국악 특화 웹 작곡 프로그램 설계서')
- 변경 내용: [CHANGELOG.md](CHANGELOG.md)
- 이어서 작업할 때 먼저 읽을 것: [HANDOFF.md](HANDOFF.md)

---

## 1. 지금 되는 것 (1단계 진행 중)

- **악보 불러오기**: PDF(ScoreWorks 해석기로 읽음)나 MusicXML(.musicxml·.xml·.mxl)을 열어 오선보로 보여 줍니다(조판: Verovio). 파트보는 쉬는 마디를 여러 마디 쉼표로 묶어 그립니다.
- **재생**: ScoreWorks 국악기 녹음으로 연주합니다(아래 2-3).
- **음 고치기**: 음을 눌러 높이(↑↓, 글자 C~B, Ctrl+↑↓ 옥타브)·길이(1~7, 점 .)·쉼표로(Delete), ←→로 옮기기, 되돌리기(Ctrl+Z)·다시(Ctrl+Y)
- **음 넣기·옮기기**: 편집 막대의 음표판에서 음표를 끌어다 악보에 놓기, 또는 음표 단추를 눌러 넣기 상태로 악보를 눌러 넣기. 음을 위아래로 끌면 높이, 옆으로 끌면 자리 옮기기
- **성부·화음·마디**: 성부 1·2를 골라 넣기, '화음'(또는 Shift)으로 그 자리 음에 화음 더하기, 고른 음의 마디 앞·뒤에 빈 마디 넣기·마디 지우기
- **율명·정간보**: 보기 방식 '율명'(오선 아래 율명, 황종 기준·한글/한자 고르기), '정간보'(파트 하나를 정간보로, 재생 따라가기)
- **보기**: 총보 또는 파트 하나
- **저장**: 고친 내용은 브라우저에 자동 저장(다음에 '이어서 열기'), 저장 단추·Ctrl+S로 .swc 파일, MusicXML 저장(피날레·뮤즈스코어용)
- 아직 안 되는 것: GitHub 저장, 편성 템플릿, 국악 기호, 정간보 — 설계서 6장 단계대로 더합니다.

## 2. 구성

```
scoreworks_studio/
├─ index.html               앱 화면(A안: 가운데 악보, 위 도구 막대, 아래 연주 막대, 왼쪽 탭)
├─ src/
│  ├─ main.ts               앱 시작, 파일 열기, 화면 연결
│  ├─ swc/model.ts          악보 형식 .swc v0 (설계서 3장)
│  ├─ swc/frac.ts           분수(박 위치·길이를 온음표 단위로 정확하게)
│  ├─ io/musicxml-in.ts     MusicXML → .swc
│  ├─ io/pdf-in.ts          PDF → .swc (ScoreWorks 해석기)
│  ├─ io/mxl.ts             .mxl 풀기
│  ├─ io/store.ts           자동 저장(IndexedDB)·.swc 파일
│  ├─ swc/notate.ts         소리 길이 → 적을 수 있는 악보(쉼표·붙임줄·잇단·빔)
│  ├─ io/musicxml-out.ts    .swc → MusicXML (화면 그리기와 내보내기에 같이 씀)
│  ├─ edit/ops.ts           음 고치기·되돌리기
│  ├─ swc/pitch.ts          음 이름 ↔ MIDI
│  ├─ view/yul.ts           율명·정간보
│  ├─ view/engrave.ts       Verovio로 쪽 그리기
│  ├─ play/adapter.ts       .swc → ScoreWorks 마디·음 사건
│  └─ play/player.ts        녹음 받기, 소리 만들기(WAV)
├─ shared/scoreworks/       ScoreWorks에서 가져온 공통 모듈(여기서 고치지 않음 — 2-1)
├─ public/banks/            국악기 녹음 묶음(ScoreWorks와 같음)
├─ tools/sync-shared.mjs    공통 모듈·녹음 가져오기
├─ test/                    시험(Node 22)
└─ docs/DESIGN.md           설계 요약과 결정 사항
```

### 2-1. ScoreWorks 공통 모듈
`shared/scoreworks/`의 해석기(score-parser.js)·재생 엔진(audio-engine.js, melody-engine.js)·MusicXML 읽기(musicxml.js)·타악 녹음(samples.json)과 `public/banks/`의 선율 악기 녹음은 ScoreWorks 저장소의 것을 그대로 복사한 것입니다. **여기서 고치지 않고** ScoreWorks에서 고친 뒤 다시 가져옵니다(두 프로그램이 같은 소리·같은 해석 결과를 내도록).

```
node tools/sync-shared.mjs <ScoreWorks 저장소 폴더>
```
가져온 판(커밋)은 `shared/scoreworks/SYNC.json`에 적힙니다.

### 2-2. 악보 형식 .swc
JSON 한 파일. 곡 정보(meta) · 마디 정보(measures: 길이·박자·조표·빠르기·장단·연습 번호·반복, 모든 파트 공통) · 파트(parts: 악기·오선 수·음자리표·옮김, 마디마다 사건 events와 지시 dirs). 시간은 모두 온음표 단위 분수 `[분자, 분모]`. 자세한 것은 `src/swc/model.ts`의 주석.

### 2-3. 그리기와 재생
- 화면: `.swc → MusicXML(io/musicxml-out.ts) → Verovio → SVG`. 내보내는 MusicXML과 화면이 늘 같은 글쓴이를 거칩니다.
- 재생: `.swc → ScoreWorks 마디·음 사건 → renderPlan → mixNotes/mix → WAV`. 악기는 파트 이름으로 ScoreWorks와 같은 규칙(guessInstrument)으로 정합니다.

## 3. 실행·빌드

준비물: Node.js 22 이상

```
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # dist/ 에 배포판
npm test           # 시험
```

- **배포**: `dev` 브랜치에 올리면 GitHub Actions(.github/workflows/pages.yml)가 시험·빌드 뒤 GitHub Pages로 올립니다. 처음 한 번 저장소 Settings → Pages → Source를 **GitHub Actions**로 바꿔야 합니다. 주소: https://commst.github.io/scoreworks_studio/
- **문법은 ES2020까지**: 단원 기기 중 옛 브라우저가 있어 빌드 대상(vite.config.ts)을 es2020으로 둡니다.

## 4. 시험

| 명령 | 내용 |
|---|---|
| `npm test` | MusicXML → .swc → MusicXML → .swc 왕복이 같은지(test/fixtures). 실제 악보로도 하려면 `SAMPLES_XML=<폴더> npm test` |
| `npm test` (edit-ops) | 음 고치기·되돌리기 |
| `node test/pw-edit.cjs <파일>` | 화면에서 음 고치기(빌드 뒤) |
| `node test/pw-drag.cjs [파일]` | 끌어 넣기·끌어 옮기기(빌드 뒤) |
| `node test/pw-yul.cjs <파일>` | 율명·정간보 보기(빌드 뒤) |
| `node test/pw-save.cjs <파일>` | 자동 저장·이어서 열기·.swc 저장/열기(빌드 뒤) |
| `npm test` (adapter) | .swc → ScoreWorks 재생 계획: 음 수·높이·붙임줄·도돌이 |
| `npm run build && NODE_PATH=… node test/pw-smoke.cjs <파일…>` | 화면 시험(Playwright): 열기 → 그리기(마디 수) → 재생·따라가기 |
| `SAMPLES_PDF=<폴더> npm test` | PDF 불러오기: 음표 종류·길이, MusicXML 왕복 |
| `node test/cmp-scoreworks.ts <studio.musicxml> <scoreworks.musicxml>` | ScoreWorks 내보내기와 음 비교 |
| `python3 test/xsdcheck.py <파일…>` | 내보낸 MusicXML이 MusicXML 4.0 규칙에 맞는지(XSD_DIR에 musicxml·xml·xlink.xsd) |

악보(PDF·MusicXML)는 저작권 때문에 이 공개 저장소에 넣지 않습니다. 실제 악보 시험은 비공개 샘플 저장소의 파일로 합니다.

## 5. 쓰는 라이브러리

| 이름 | 쓰는 곳 | 라이선스 |
|---|---|---|
| [Verovio](https://www.verovio.org) 6.4 | 악보 조판(그리기) | LGPL-3.0 — 고치지 않고 따로 된 파일로 씀 |
| [pdf.js](https://mozilla.github.io/pdf.js/) 4.10 | PDF 악보 읽기(ScoreWorks 해석기) | Apache-2.0 |
| [fflate](https://github.com/101arrowz/fflate) | .mxl 풀기 | MIT |
| Vite·TypeScript | 빌드 | MIT·Apache-2.0 |
