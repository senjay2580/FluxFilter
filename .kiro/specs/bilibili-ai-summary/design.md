# Design Document

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      VideoCard.tsx                          │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │ AI总结按钮  │  │  字幕按钮   │                          │
│  └──────┬──────┘  └──────┬──────┘                          │
└─────────┼────────────────┼──────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│              AISummaryModal.tsx (新组件)                    │
│  - 显示AI总结内容                                           │
│  - 显示字幕内容                                             │
│  - 支持复制、时间戳跳转                                     │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   lib/bilibili.ts                           │
│  + getVideoAISummary(bvid, cid)                            │
│  + getVideoSubtitles(bvid, cid)                            │
│  + getVideoCid(bvid)                                       │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                   api/bilibili.ts                           │
│  支持新端点:                                                │
│  - /x/web-interface/view/conclusion/get (AI总结)           │
│  - /x/player/wbi/v2 (字幕信息)                             │
│  - 字幕JSON文件代理                                         │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### 1. AI视频总结
- Endpoint: `/x/web-interface/view/conclusion/get`
- Params: `bvid`, `cid`, `up_mid`
- Response: `{ code, data: { model_result: { summary, outline[] } } }`

### 2. 视频字幕信息
- Endpoint: `/x/player/wbi/v2`
- Params: `bvid`, `cid`
- Response: `{ code, data: { subtitle: { subtitles[] } } }`

### 3. 字幕JSON
- URL: `https://i0.hdslb.com/bfs/subtitle/xxx.json`
- 需要代理访问

## Data Types

```typescript
interface AISummary {
  summary: string;
  outline: {
    title: string;
    part_outline: {
      timestamp: number;
      content: string;
    }[];
  }[];
}

interface SubtitleInfo {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
}

interface SubtitleContent {
  body: {
    from: number;
    to: number;
    content: string;
  }[];
}
```

## Caching Strategy

使用 localStorage 缓存:
- Key: `bili_summary_${bvid}` / `bili_subtitle_${bvid}`
- TTL: 24小时
- 自动清理过期缓存
