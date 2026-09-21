import { defineConfig } from 'vitest/config'

// 独立测试配置：不复用 vite.config.ts（其中的 ffmpeg 拷贝插件与测试无关）。
// 纯函数测试跑 node 环境即可；需要 DOM/localStorage 的测试在用例内自行 stub。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
