<div align="center">

# 🎬 Fluxf

<img src="public/pwa-icon.svg" width="120" height="120" alt="Fluxf Logo" />

**B站视频聚合与智能筛选工具**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3FCF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

[在线体验](https://flux-filter.vercel.app) · [功能介绍](#-功能特性) · [快速开始](#-快速开始) · [技术栈](#-技术栈)

</div>

---

## ✨ 功能特性

<table>
<tr>
<td width="50%">

### 📺 视频聚合
- 🔄 一键同步关注UP主的最新视频
- 📅 热力图日历查看视频发布分布
- 🔍 智能搜索与多维度筛选
- ⏰ 待看列表管理

</td>
<td width="50%">

### 🚀 极致体验
- 📱 PWA 支持，可安装到桌面
- 🌙 深色主题，护眼体验
- ⚡ 快速响应，流畅动画
- 📴 离线缓存，随时可用

</td>
</tr>
</table>

## 📱 界面预览

<div align="center">
<table>
<tr>
<td align="center"><b>🏠 首页信息流</b></td>
<td align="center"><b>📅 热力图日历</b></td>
<td align="center"><b>➕ 添加UP主</b></td>
</tr>
<tr>
<td><img src="docs/screenshot-home.png" width="250" /></td>
<td><img src="docs/screenshot-calendar.png" width="250" /></td>
<td><img src="docs/screenshot-add.png" width="250" /></td>
</tr>
</table>
</div>

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript |
| **构建工具** | Vite 6 |
| **样式方案** | TailwindCSS |
| **数据存储** | Supabase (PostgreSQL) |
| **PWA 支持** | vite-plugin-pwa |
| **部署平台** | Vercel |

## 🚀 快速开始

### 前置要求

- Node.js 20+
- npm 或 yarn
- Supabase 账号

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/fluxf.git
cd fluxf

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 Supabase 配置

# 4. 启动开发服务器
npm run dev
```

### 环境变量

```env
# Supabase 配置
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Gemini API (可选)
GEMINI_API_KEY=your-gemini-api-key
```

### 数据库初始化

在 Supabase SQL Editor 中执行：

```sql
-- 创建 UP主表
CREATE TABLE uploader (
  id SERIAL PRIMARY KEY,
  mid BIGINT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  face TEXT,
  sign TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建视频表
CREATE TABLE video (
  id SERIAL PRIMARY KEY,
  bvid TEXT UNIQUE NOT NULL,
  aid BIGINT,
  mid BIGINT REFERENCES uploader(mid),
  title TEXT NOT NULL,
  pic TEXT,
  description TEXT,
  duration INT,
  view_count INT DEFAULT 0,
  danmaku_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  favorite_count INT DEFAULT 0,
  coin_count INT DEFAULT 0,
  share_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  pubdate TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 添加示例UP主
INSERT INTO uploader (mid, name) VALUES
(946974, '影视飓风'),
(25876945, '何同学');
```

## 📦 部署

### Vercel 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/fluxf)

### 环境变量配置

在 Vercel 项目设置中添加：

| 变量名 | 说明 |
|--------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名密钥 |
| `BILIBILI_COOKIE` | B站 Cookie（用于 API 代理） |

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

---

<div align="center">

**Made with ❤️ by Fluxf Team**

⭐ 如果觉得有用，请给个 Star 支持一下！

</div>
