import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 开发期把 /bbdc、/llm 与 /output 反向代理到后端，等价于原来 serve.py 的职责：
 * 前端始终使用同源相对路径，与「构建产物交给后端托管」后的行为完全一致。
 *
 * 后端地址通过环境变量覆盖：VITE_API_TARGET=http://192.168.1.10:20056
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = (env.VITE_API_TARGET || 'http://127.0.0.1:20056').replace(/\/+$/, '')

  return {
    // 相对基址：产物可以挂在任意路径下（FastAPI mount / nginx 子目录都不用改配置）
    base: './',
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      proxy: {
        // SSE（二维码登录、阅读文章生成）走同一个代理，http-proxy 会逐块转发、不缓冲
        '/bbdc': { target, changeOrigin: false },
        '/llm': { target, changeOrigin: false },
        '/output': { target, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      // 中文字体 11MB，单独成文件走长期缓存，不参与 JS 分包
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            'pdf-engine': ['./src/lib/pdf/pdfdoc.js', './src/lib/pdf/ttf.js', './src/lib/pdf/wordlist.js'],
          },
        },
      },
    },
  }
})
