import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // original-fs 由 Electron 运行时提供，必须外置，避免 Vite 尝试打包它而失败
        external: ['original-fs']
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    // 锁死 dev server 端口，避免 Vite 在 5173 被占用时静默漂移到 5174/5175。
    // localStorage 按 origin 隔离，端口一变 origin 就变，上次 dev 写入的扫描历史会
    // 读不到。strictPort 让冲突时直接报错，提醒开发者手动清理残留进程。
    server: {
      port: 5173,
      strictPort: true
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [react()]
  }
});
