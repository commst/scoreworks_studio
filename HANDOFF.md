# ScoreWorks Studio 인수인계 메모

새 대화에서 이어 작업할 때 먼저 읽는 문서. 무엇을 왜 고쳤는지는 CHANGELOG.md, 구성·실행은 README.md, 결정 사항은 docs/DESIGN.md.
(마지막 갱신: 2026-11-25, CHANGELOG 17번까지 · 통합 기획은 4장)

## 1. 작업 규칙 (사용자 요청 — ScoreWorks와 같음)

- 작업 **단계마다 진행 상황을 보고**한다
- 고칠 때마다 CHANGELOG(날짜·일련번호), 바뀌면 README·DESIGN·HANDOFF도, **앱 안 업데이트 이력(index.html `<template id="histTpl">`, 사용자 말로 — 기능 업데이트·버그 수정)**, 화면이 바뀌면 사용법 창(index.html #helpView)과 사용설명서도
- 사용설명서 갱신: tools/manual/manual.html 고치고 `npm run build && NODE_PATH=/opt/npm-tools/node_modules node tools/manual/mancap.cjs`(그림) → `node tools/manual/mkpdf.cjs`(public/manual.pdf). 글꼴은 /home/claude/work/fonts에 `npm i pretendard@1.3.9 @fontsource-variable/outfit`
- 목표는 무결점: 고칠 때 기존 기능을 깨지 않는다 — 꼭 필요한 시험만, 그러나 고친 곳에 닿는 시험은 꼭
- 문법은 ES2020까지(빌드 대상 es2020)
- **악보 파일은 공개 저장소에 넣지 않는다**(저작권). 시험용 실제 악보는 비공개 저장소 commst/scoreplay_sample(PDF), MusicXML은 ScoreWorks에서 내보내 저장소 밖 폴더에 두고 `SAMPLES_XML=<폴더>`
- 공통 모듈(shared/scoreworks, public/banks)은 여기서 고치지 않는다 → ScoreWorks에서 고친 뒤 `node tools/sync-shared.mjs <ScoreWorks 폴더>`
- 화면: A안(가운데 악보, 아래 연주 막대, 왼쪽 탭), 다크 테마 안 씀, 제목 가운데·단추 크기 맞춤·테마 색 단추(ScoreWorks 공통 원칙). **디자인은 ScoreWorks와 같게**(10번: 색 변수·Pretendard/Outfit·topbar·tabs2·dock·둥근 단추 — src/style.css 맨 위 변수)
- 커밋 메시지 끝: `Co-Authored-By: Claude …` 줄(세션 안내에 따름). 기본 브랜치 **dev**(올리면 Pages 배포)

## 2. 작업 환경

- 저장소: `/home/claude/scoreworks_studio`, ScoreWorks: `/home/claude/scoreplay`(시험 도구 경로 때문에 이 이름), 샘플: `/home/claude/scoreplay_sample` → `/home/claude/samples`
- `npm install` 뒤 `npm test`, `npm run build`. Node 22는 .ts 시험 파일을 그대로 실행(타입만 벗김) — import는 `.ts` 확장자까지 적는다(tsconfig allowImportingTsExtensions)
- 실제 악보 MusicXML 만들기: ScoreWorks에서 `NODE_PATH=/opt/npm-tools/node_modules node test/pwxml.cjs <접두어…>` → `/home/claude/scoreplay/xmlout/<접두어>.musicxml`
- XSD: `/home/claude/work/xsd/`(musicxml·xml·xlink.xsd, w3c/musicxml v4.0) → `python3 test/xsdcheck.py <파일…>`
- PDF 시험: `SAMPLES_PDF=<PDF 폴더> npm test` (예: /tmp/pdf5에 다섯 곡 복사)
- 화면 시험: `npm run build && NODE_PATH=/opt/npm-tools/node_modules node test/pw-smoke.cjs <파일…>` (vite preview로 띄움, 화면 사진 /tmp/studio-*.png)
- Playwright: `NODE_PATH=/opt/npm-tools/node_modules`, 작업 공간에서 github.io·CDN 접속이 막힘 → 빌드한 dist를 파일로 열어 시험

## 3. 다음 할 일 (1단계)

(14번에 설계서 3단계의 정간보를 '보기 전용'으로 먼저 넣음 — 정간보에서 고치기·시김새·장단 대강은 3단계에서. 15번 구음: 장구 자동, 거문고·피리는 적기, 늘봄 가야금은 25현 — 25현 줄 번호 보기는 사용자 답 기다림)

1. ~~MusicXML 불러와 보기·재생 첫 화면~~ (2번). 따라가기 표시·여러 마디 쉼표·.mxl은 3번
2. ~~PDF 불러오기~~ (4번). 남은 것: ScoreWorks 앱의 줄 합치기 단계(applySelection·lineResOf)는 공통 모듈이 아니라 조금 다름(월광 0.6%) — 필요하면 ScoreWorks에서 공통 모듈로 옮긴 뒤 가져오기
3. ~~음 선택·수정·되돌리기~~ (6번). 남은 것: 새 음 넣기(입력 모드), 음 선택 범위(여러 음)·복사/붙여넣기, 마디 안 음자리표 바꿈 쓰기
   - 그리기 구조: 마디 조각(chunk)마다 Verovio 따로 — 조각 끝 덜 찬 단은 잘라 다음 조각으로(renderChunk decide). 고치면 그 조각만. 조각 경계를 넘는 붙임줄·이음줄은 끊겨 보일 수 있음
4. ~~자동 저장·.swc 저장/열기~~ (7번). 남은 것: GitHub 저장(ScoreWorks처럼 토큰)
5. ~~새 음 넣기~~ (11번: 음표판 끌어 넣기·넣기 상태·음 끌어 옮기기). 성부 2·화음·마디 넣기/지우기는 13번. 남은 것: 편성 템플릿(새 악보), 여러 음 고르기·복사/붙여넣기, 박자표·조표 바꾸기
6. 완료 기준: 다섯 곡(소나기·월광·프론티어·미락흘·달빛항해)을 불러와 고친 뒤 피날레에서 같은 악보로 열림

## 4. ScoreWorks·Studio 통합 기획 (2026-11-25, 진행 중 — 코드는 아직 안 바꿈)

- 기획서(Claude 문서): https://claude.ai/artifact/He93fdQ5XjmfVYtCUkmtM6 — 개요·두 프로그램 비교·통합 방안 A/B/C(C 먼저 → A)·기술 설계·UI 변경 설계(연습|편집 모드 단추)·휴대폰·태블릿 편집·인식 오류 확인과 고치기·4단계 계획·위험과 대책·정할 것
- 사용자가 정한 것: 태블릿은 편집 모드 전체, 휴대폰은 누르고 단추로 고치기·구음 적기만. 작곡 프로그램(새 악보 제작)은 목표가 아님 — 새 악보는 MuseScore 등에서 만들어 MusicXML로 가져옴(국악 특화 입력은 나중에 작게 검토)
- **다음 대화에서 먼저 할 일 — 기획서 고치기(사용자에게 제안했고 답을 받기 전에 대화가 넘어감)**: ScoreWorks에 이미 음 수정이 있음(README 1-9: ✎ 음 고치기, 높이·길이·타악 소리·아쟁 주법, 원래 값 표시, 같은/다른 판 PDF에 자동 적용, 내보내기·가져오기, GitHub 공유). 그래서
  1. '두 앱을 따로 두지 않는 이유'에 비교표 넣기: ScoreWorks = 글자 목록으로 있는 음의 높이·길이만 / Studio = 오선보로 다시 그려 비교, 음 더하기·지우기·쉼표·성부·화음·마디 넣기·지우기(구조 오류), 결과물(MusicXML·.swc·율명·정간보)
  2. '인식 오류 확인과 고치기'의 6번(고친 내용 보존) 등은 새로 만들 것이 아니라 ScoreWorks에서 **가져올 것**으로 바로잡기(원래 값 표시, 이 마디부터 듣기, 다른 판 PDF에 적용, 내보내기·공유, '적용하지 못한 수정 n곳')
  3. 합친 편집 모드 = ScoreWorks 수정 창 장점 + Studio 오선보 편집·구조 고치기
- 인식 경고 수(다섯 곡, 경고 붙은 마디/전체): 월광 98/192, 소나기 7/358, FRONTIER 6/170, 미락흘 1/264, 달빛항해 0/152. 경고 없는 오류(음 높이 오인·기호 누락)는 표시 안 됨. PDF에서 넘어오는 기호: 음표·쉼표·붙임줄·꾸밈음·이음줄·악센트·스타카토·테누토·트레몰로·글리산도·셈여림 글자·D.C./D.S./Fine/Coda — 나머지는 흔적 없이 버려짐
- 손가락 편집 시험 구현(배포 안 함): 패치 `/home/claude/work/touch-edit.patch`(main.ts: COARSE면 zoom 150, 0.35초 길게 눌러 끌기·펜은 바로·touchmove preventDefault; style.css: touch-callout 없앰·휴대폰 위 막대 줄임; test/pw-touch.cjs). iPad·Galaxy Tab·Pixel 흉내에서 짧게 끌기=스크롤, 길게 눌러 끌기, 음표판 터치 끌어 넣기 통과. 남은 것: 150%에서 줄 사이가 기기마다 다름(10.7/9.5/8.4px) → 줄 사이 11px 기준으로 크기 정하기. 패치 파일은 작업 공간이 바뀌면 사라질 수 있음(기획서에 방법이 적혀 있어 다시 만들 수 있음)
