import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* dailylab.app/lab — 빌드 결과를 ../public/lab 에 넣는다(사이트는 빌드 없이 public/을 그대로 배포) */
export default defineConfig({
  base: '/lab/',
  plugins: [react()],
  build: { outDir: '../public/lab', emptyOutDir: true },
  // 홈과 같이 쓰는 ../public/assets/tokens.css를 개발 서버에서도 읽을 수 있게
  server: { fs: { allow: ['..'] } },
})
