import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

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
      plugins: [react()],
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
