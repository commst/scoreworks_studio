import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
// 화면에 보이는 판: 빌드한 날짜 · 커밋 (업데이트 이력 창 위)
const sh = (c: string) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
const d = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);   // 한국 시간 날짜
const APP_VERSION = `${d}${sh('git rev-parse --short HEAD') ? ' · ' + sh('git rev-parse --short HEAD') : ''}`;
// GitHub Pages 주소가 https://commst.github.io/scoreworks_studio/ 이므로 base를 맞춘다.
// 문법은 ES2020까지(단원 기기 중 옛 브라우저가 있음 — ScoreWorks 113번과 같은 원칙)
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 9000 },
  optimizeDeps: { exclude: ['verovio'] },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
});
