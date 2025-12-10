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
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Referer', 'https://www.bilibili.com');
                proxyReq.setHeader('Origin', 'https://www.bilibili.com');
                proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                proxyReq.setHeader('Cookie', 'SESSDATA=fa467b9c%2C1780929296%2C50bfd%2Ac1CjBGzWTOiqwnp6oOR6a0-Px4JRr9mH17Qhsjzg1zmjO0YOerD2ctH9qpG1Oqjigs0CISVlIwRUFWVm9HaC1VM0ZWdlFySHZILTVWbGtrX2xPNHFMVkhiempIeVkwSWZpbm9Yd1dJTWI5U2dtSjE0Ujl5VG16TUxfR2tMQ0UwMExvVnYzbGxjOFpnIIEC; bili_jct=88f200cde521bb50e6defb7e2215749c; DedeUserID=662516002; buvid3=7D3E7DEA-3FC6-98AB-E527-F6F887AB4C8646440infoc');
              });
            },
          },
        },
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon-196.png', 'apple-icon-180.png', 'assets/logo.svg'],
          devOptions: {
            enabled: true
          },
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
                src: 'manifest-icon-192.maskable.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'maskable'
              },
              {
                src: 'manifest-icon-512.maskable.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
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
