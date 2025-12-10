import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// 注册 Service Worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('有新版本可用，是否刷新？')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App 已准备好离线使用');
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
