import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // 代理配置：解决B站API跨域问题
        proxy: {
          '/bili-api': {
            target: 'https://api.bilibili.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/bili-api/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                proxyReq.setHeader('Referer', 'https://www.bilibili.com');
                proxyReq.setHeader('Origin', 'https://www.bilibili.com');
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                // 优先使用请求头中的用户 Cookie，否则使用环境变量
                const userCookie = req.headers['x-bilibili-cookie'] as string;
                const cookie = userCookie || env.BILIBILI_COOKIE || '';
                if (cookie) {
                  proxyReq.setHeader('Cookie', cookie);
                }
              });
            },
          },
          // 字幕代理 - 支持多个 CDN 域名
          '/bili-subtitle': {
            target: 'https://i0.hdslb.com',
            changeOrigin: true,
            rewrite: (path) => {
              const url = new URL(path, 'http://localhost');
              const subtitleUrl = url.searchParams.get('url');
              if (subtitleUrl) {
                try {
                  const parsed = new URL(subtitleUrl);
                  return parsed.pathname + parsed.search;
                } catch {
                  return path;
                }
              }
              return path;
            },
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq, req) => {
                const url = new URL(req.url || '', 'http://localhost');
                const subtitleUrl = url.searchParams.get('url');
                if (subtitleUrl) {
                  try {
                    const parsed = new URL(subtitleUrl);
                    // 动态设置正确的 Host
                    proxyReq.setHeader('Host', parsed.host);
                    // 根据实际域名修改 target
                    (proxy as any).options.target = `${parsed.protocol}//${parsed.host}`;
                  } catch { /* ignore */ }
                }
                proxyReq.setHeader('Referer', 'https://www.bilibili.com');
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
              });
            },
          },
          // RSS 代理
          '/rss-proxy': {
            target: 'https://api.rss2json.com/v1/api.json',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/rss-proxy/, ''),
          },
          // YouTube API 代理
          '/youtube-api': {
            target: 'https://www.googleapis.com/youtube/v3',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/youtube-api/, ''),
          },
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: true,
            type: 'module'
          },
          includeAssets: ['favicon.ico', 'assets/logo.svg'],
          manifest: {
            name: 'Fluxf',
            short_name: 'Fluxf',
            description: 'B站视频聚合与筛选工具',
            theme_color: '#050510',
            background_color: '#050510',
            display: 'standalone',
            orientation: 'portrait',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: 'manifest-icon-192.maskable.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: 'manifest-icon-512.maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: 'manifest-icon-192.maskable.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable'
              },
              {
                src: 'manifest-icon-512.maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          },
          workbox: {
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/i[0-9]\.hdslb\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'bilibili-images',
                  expiration: {
                    maxEntries: 100,
                    maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                  }
                }
              }
            ]
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
