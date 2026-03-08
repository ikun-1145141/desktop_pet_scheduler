import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 从 Neo-MoFox 的 core.toml 读取后端 HTTP 地址和端口 */
function getBackendTarget(): string {
  const tomlPath = resolve(__dirname, '../Neo-MoFox/config/core.toml');
  let host = '127.0.0.1';
  let port = 8001;
  try {
    const content = readFileSync(tomlPath, 'utf-8');
    const hostMatch = content.match(/^\s*http_router_host\s*=\s*"(.+?)"/m);
    const portMatch = content.match(/^\s*http_router_port\s*=\s*(\d+)/m);
    if (hostMatch) host = hostMatch[1];
    if (portMatch) port = parseInt(portMatch[1], 10);
  } catch {
    console.warn(`⚠ 未找到 ${tomlPath}，使用默认后端地址 ${host}:${port}`);
  }
  return `http://${host}:${port}`;
}

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['url', 'buffer', 'process'],
    }),
    // Copy static assets for Electron main process
    {
      name: 'copy-electron-assets',
      buildStart() {
        const outDir = resolve(__dirname, 'dist-electron');
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
        const src = resolve(__dirname, 'electron/tray-icon.png');
        if (existsSync(src)) {
          copyFileSync(src, resolve(outDir, 'tray-icon.png'));
        }
      },
    },
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart({ reload }) {
          reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: getBackendTarget(),
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
