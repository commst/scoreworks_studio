import { defineConfig } from 'vite';
// GitHub Pages 주소가 https://commst.github.io/scoreworks_studio/ 이므로 base를 맞춘다.
// 문법은 ES2020까지(단원 기기 중 옛 브라우저가 있음 — ScoreWorks 113번과 같은 원칙)
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 9000 },
  optimizeDeps: { exclude: ['verovio'] },
});
