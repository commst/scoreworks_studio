import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
// 화면에 보이는 판: 빌드한 날짜 · 커밋 (업데이트 이력 창 위)
const sh = (c: string) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return ''; } };
// 판 번호 = 빌드한 한국 시각(글자로 견주면 새 판이 더 큼). 사이트에는 version.json으로도 내보내 새 판 알림에 씀
const VER = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const SHA = sh('git rev-parse --short HEAD');
const APP_VERSION = `${VER}${SHA ? ' · ' + SHA : ''}`;
// GitHub Pages 주소가 https://commst.github.io/scoreworks_studio/ 이므로 base를 맞춘다.
// 문법은 ES2020까지(단원 기기 중 옛 브라우저가 있음 — ScoreWorks 113번과 같은 원칙)
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 9000 },
  optimizeDeps: { exclude: ['verovio'] },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION), __APP_VER__: JSON.stringify(VER) },
  plugins: [{ name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: VER }) }); } }],
});
