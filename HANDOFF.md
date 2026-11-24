# ScoreWorks Studio 인수인계 메모

새 대화에서 이어 작업할 때 먼저 읽는 문서. 무엇을 왜 고쳤는지는 CHANGELOG.md, 구성·실행은 README.md, 결정 사항은 docs/DESIGN.md.
(마지막 갱신: 2026-11-24, CHANGELOG 4번까지)

## 1. 작업 규칙 (사용자 요청 — ScoreWorks와 같음)

- 작업 **단계마다 진행 상황을 보고**한다
- 고칠 때마다 CHANGELOG(날짜·일련번호), 바뀌면 README·DESIGN·HANDOFF도
- 목표는 무결점: 고칠 때 기존 기능을 깨지 않는다 — 꼭 필요한 시험만, 그러나 고친 곳에 닿는 시험은 꼭
- 문법은 ES2020까지(빌드 대상 es2020)
- **악보 파일은 공개 저장소에 넣지 않는다**(저작권). 시험용 실제 악보는 비공개 저장소 commst/scoreplay_sample(PDF), MusicXML은 ScoreWorks에서 내보내 저장소 밖 폴더에 두고 `SAMPLES_XML=<폴더>`
- 공통 모듈(shared/scoreworks, public/banks)은 여기서 고치지 않는다 → ScoreWorks에서 고친 뒤 `node tools/sync-shared.mjs <ScoreWorks 폴더>`
- 화면: A안(가운데 악보, 아래 연주 막대, 왼쪽 탭), 다크 테마 안 씀, 제목 가운데·단추 크기 맞춤·테마 색 단추(ScoreWorks 공통 원칙)
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

1. ~~MusicXML 불러와 보기·재생 첫 화면~~ (2번). 따라가기 표시·여러 마디 쉼표·.mxl은 3번
2. ~~PDF 불러오기~~ (4번). 남은 것: ScoreWorks 앱의 줄 합치기 단계(applySelection·lineResOf)는 공통 모듈이 아니라 조금 다름(월광 0.6%) — 필요하면 ScoreWorks에서 공통 모듈로 옮긴 뒤 가져오기
3. 음 선택·수정(Verovio 음 ID ↔ .swc 사건), 되돌리기
4. 자동 저장(IndexedDB)·.swc 파일 저장·GitHub 저장
5. 편성 템플릿, MusicXML 내보내기 단추(이미 쓰기는 있음)
6. 완료 기준: 다섯 곡(소나기·월광·프론티어·미락흘·달빛항해)을 불러와 고친 뒤 피날레에서 같은 악보로 열림
