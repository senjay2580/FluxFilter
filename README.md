<div align="center">

# 🎬 Fluxf

<img src="public/manifest-icon-192.maskable.png" width="120" height="120" alt="FluxFilter Logo" />

**智能追踪你关注的UP主，永不错过精彩内容**

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
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
- **一键同步** - 批量同步关注UP主的最新视频
- **时间线视图** - 热力图日历查看视频发布分布
- **智能筛选** - 按时间/UP主/关键词多维度筛选
- **待看队列** - 收藏感兴趣的视频稍后观看

</td>
<td width="50%">

### 🛠 效率工具
- **RSS 订阅** - 聚合多个UP主的更新动态
- **待办管理** - 高/中/低优先级任务管理
- **定时提醒** - 自定义周期任务提醒
- **视频采集** - 快速采集B站视频信息

</td>
</tr>
<tr>
<td width="50%">

### 🚀 极致体验
- **PWA 支持** - 可安装到桌面/手机主屏
- **深色主题** - 赛博朋克风格护眼界面
- **流畅动画** - GPU 加速，丝滑滚动体验
- **离线缓存** - 无网络也能查看历史数据

</td>
<td width="50%">

### 🔐 数据安全
- **私有部署** - 自建 Supabase 完全掌控数据
- **用户隔离** - 多用户数据完全独立
- **Cookie 代理** - 安全调用 B站 API
- **游客模式** - 无需登录也能预览功能

</td>
</tr>
</table>

## 📱 界面预览

<div align="center">

| 🏠 首页信息流 | 📅 时间线热力图 | ✅ 待办任务 |
|:---:|:---:|:---:|
| 瀑布流视频卡片 | 发布分布可视化 | 三级优先级管理 |

</div>

## 🛠 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | React 19 + TypeScript 5.8 |
| **构建工具** | Vite 6.2 |
| **样式方案** | TailwindCSS (CDN) |
| **数据存储** | Supabase (PostgreSQL) |
| **AI 能力** | Google Gemini API |
| **PWA 支持** | vite-plugin-pwa |
| **部署平台** | Vercel (Serverless) |

## 🚀 快速开始

### 前置要求

- Node.js 20+
- pnpm / npm / yarn
- Supabase 账号（免费版即可）

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/yourusername/FluxFilter.git
cd FluxFilter

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入配置

# 4. 启动开发服务器
npm run dev
```

### 环境变量

```env
# Supabase 配置（必填）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# B站 Cookie（用于 API 代理，获取视频数据）
BILIBILI_COOKIE=your-bilibili-cookie

# Gemini API（可选，用于 AI 功能）
GEMINI_API_KEY=your-gemini-api-key
```

### 数据库初始化

项目使用 Supabase 作为后端数据库，需要创建以下核心表：

```sql
-- UP主表
CREATE TABLE uploader (
  mid BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  face TEXT,
  sign TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 视频表
CREATE TABLE video (
  bvid TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  mid BIGINT NOT NULL,
  title TEXT NOT NULL,
  pic TEXT,
  duration INT,
  view_count INT DEFAULT 0,
  danmaku_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  pubdate TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bvid, user_id)
);

-- 待看列表
CREATE TABLE watchlist (
  bvid TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bvid, user_id)
);

-- 启用 RLS（行级安全）
ALTER TABLE uploader ENABLE ROW LEVEL SECURITY;
ALTER TABLE video ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
```

> 完整的数据库迁移脚本请参考 `supabase/` 目录

## 📦 部署

### Vercel 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/FluxFilter)

### 环境变量配置

在 Vercel 项目设置中添加：

| 变量名 | 说明 | 必填 |
|--------|------|:----:|
| `VITE_SUPABASE_URL` | Supabase 项目 URL | ✅ |
| `VITE_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | ✅ |
| `BILIBILI_COOKIE` | B站 Cookie（用于视频同步） | ✅ |
| `GEMINI_API_KEY` | Google Gemini API 密钥 | ❌ |

## 📁 项目结构

```
FluxFilter/
├── api/                # Vercel Serverless Functions
├── components/         # React 组件
│   ├── VideoCard.tsx   # 视频卡片
│   ├── TodoList.tsx    # 待办管理
│   ├── RssFeed.tsx     # RSS 订阅
│   └── ...
├── lib/                # 工具库
│   ├── supabase.ts     # 数据库客户端
│   ├── bilibili.ts     # B站 API 封装
│   └── auth.ts         # 认证逻辑
├── App.tsx             # 主应用
└── index.html          # 入口 HTML
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

---

<div align="center">

**Made with ❤️ for Bilibili Lovers**

⭐ 如果觉得有用，请给个 Star 支持一下！

</div>
