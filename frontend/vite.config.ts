import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ffmpeg.wasm 必须同源加载：从 @ffmpeg/core 包把 UMD 产物拷入 public/ffmpeg。
// 二进制不入 git，npm install 后由本插件在 dev/build 时自动就位。
function ffmpegCorePlugin() {
  const copy = () => {
    const src = join('node_modules', '@ffmpeg', 'core', 'dist', 'umd')
    const dest = join('public', 'ffmpeg')
    if (!existsSync(join(dest, 'ffmpeg-core.wasm'))) {
      mkdirSync(dest, { recursive: true })
      cpSync(join(src, 'ffmpeg-core.js'), join(dest, 'ffmpeg-core.js'))
      cpSync(join(src, 'ffmpeg-core.wasm'), join(dest, 'ffmpeg-core.wasm'))
    }
  }
  return {
    name: 'copy-ffmpeg-core',
    configureServer() {
      copy()
    },
    buildStart() {
      copy()
    },
  }
}

export default defineConfig({
  build: {
    // 所有产物统一落在仓库根 data/ 下（gitignore）
    outDir: '../data/dist',
    emptyOutDir: true,
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
      '/uploads': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
