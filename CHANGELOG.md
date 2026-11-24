# 변경 이력

날짜와 일련번호로 적는다: `## 2026-MM-DD (번호) · 제목` — 원인·고친 방법·확인 결과.

## 2026-11-24 (2) · 1단계 첫 화면: MusicXML 열어 보기 · 국악기 녹음으로 재생 · 따라가기
- 화면(A안): 위 도구 막대(악보 열기·확대·MusicXML 저장), 왼쪽 탭(파트: 소리 켜기·악기 소리·크기 / 곡 정보), 가운데 악보, 아래 연주 막대(재생·정지·빠르기·속도·도돌이). 파일 끌어다 놓기도 됨
- 그리기(view/engrave.ts): .swc → MusicXML → Verovio, 화면 폭에 맞춘 긴 쪽 하나, 모든 마디에 번호. Verovio는 처음 악보를 열 때 받음(첫 화면 70KB)
- 재생(play/adapter.ts·player.ts): .swc를 ScoreWorks 마디·음 사건으로 바꿔 ScoreWorks renderPlan·mixNotes·mix로 WAV — 파트 = 줄, 오선 1·2 = 윗·아랫 성부, 붙임줄·옮김·악센트·스타카토·트레몰로·농현·pizz. 반영, 악기 소리는 파트 이름으로(guessInstrument), 아쟁은 pizz. 녹음도 함께, 타악 파트는 장구 따·궁
- 따라가기: 지금 소리 나는 마디를 빨갛게, 화면 밖이면 스크롤(재생 계획의 마디 시각)
- 확인: test/adapter.test.ts(음 수·높이·도돌이), test/pw-smoke.cjs — 시험 파일·프론티어 가야금(170마디 1.8초, 737음)·월광 총보(18파트 192마디 그리기 8초, 9,862음, 녹음 12개) 모두 마디 수 일치·재생·따라가기 됨, 콘솔 오류 없음

## 2026-11-24 (1) · 0단계: 조판 라이브러리 결정, 저장소 뼈대, .swc 형식과 MusicXML 왕복
- 조판 라이브러리 비교: ScoreWorks에서 내보낸 MusicXML 두 개(프론티어 가야금 파트보 두 오선, 월광 총보 20줄 193마디)를 Verovio 6.4와 OpenSheetMusicDisplay 3.0(VexFlow)으로 그림 — 그리는 시간 0.9/0.8초, 2.9/5.9초, 쪽 수 6/5, 68/110. Verovio는 총보 묶음 괄호·간격이 깔끔하고 음마다 ID·편집·재생 시각표가 있음, OSMD는 큰 총보에서 박자표·마디선 겹침. 여러 마디 쉼표는 Verovio 옵션을 맞춰야 함 → **Verovio** (docs/DESIGN.md)
- 발견(ScoreWorks 쪽): 두 라이브러리 모두 프론티어 20마디 X 머리가 보통 머리로, 'gliss.'가 'li'·'is' 조각 글자로 나옴 — ScoreWorks MusicXML 내보내기 과제
- 저장소 뼈대: Vite 6 + TypeScript 5(빌드 대상 ES2020), README·DESIGN·HANDOFF, GitHub Pages 배포 workflow(dev 브랜치)
- 공통 모듈: tools/sync-shared.mjs — ScoreWorks 93b6c88의 해석기·재생 엔진·MusicXML 읽기·타악 녹음, 선율 녹음 14개를 shared/scoreworks/·public/banks/로 (SYNC.json에 판)
- .swc v0 (src/swc/model.ts): 곡 정보·마디 정보·파트(오선·음자리표·옮김·갈래)·사건(성부·시작·길이 분수, 음 이름·임시표·붙임줄·잇단음표·꾸밈음·빔·이음줄·기호)·지시(셈여림·꺾쇠·글자)
- MusicXML 읽기(io/musicxml-in.ts)·쓰기(io/musicxml-out.ts): divisions는 모든 길이의 최소공배수, 성부마다 backup·forward, 음표 종류·점은 적힌 것 또는 길이에서, 농현 = 물결선(ScoreWorks 182번과 같음)
- 확인: test/musicxml-roundtrip.test.ts — 읽기 → 쓰기 → 읽기가 같음(ScoreWorks 시험 파일 + 저장소 밖 실제 악보 프론티어 가야금·월광 총보), 내보낸 세 파일 MusicXML 4.0 XSD VALID
