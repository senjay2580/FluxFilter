# Requirements Document

## Introduction

本功能为B站视频管理应用增加两个核心能力：自动获取B站AI视频总结和视频字幕。这将大幅提升用户的学习效率，减少手动转写的需求。

## Glossary

- **AI_Summary_Service**: B站AI视频总结服务，提供视频要点总结和时间戳章节
- **Subtitle_Service**: B站字幕服务，获取视频的CC字幕文本
- **Video_Card**: 视频卡片组件，展示视频信息
- **Bilibili_API**: B站API代理服务，处理跨域请求

## Requirements

### Requirement 1: 获取B站AI视频总结

**User Story:** As a user, I want to view AI-generated video summaries from Bilibili, so that I can quickly understand video content without watching the entire video.

#### Acceptance Criteria

1. WHEN a user clicks the "AI总结" button on a video card, THE AI_Summary_Service SHALL fetch the summary from Bilibili API
2. WHEN the AI summary is available, THE System SHALL display the summary content including key points and timestamps
3. WHEN the AI summary is not available for a video, THE System SHALL display a message indicating "该视频暂无AI总结"
4. WHEN fetching the summary, THE System SHALL show a loading indicator
5. IF the API request fails, THEN THE System SHALL display an error message and allow retry
6. WHEN timestamps are available in the summary, THE System SHALL display them as clickable chapter markers

### Requirement 2: 获取视频字幕

**User Story:** As a user, I want to automatically fetch video subtitles from Bilibili, so that I can read the transcript without manual transcription.

#### Acceptance Criteria

1. WHEN a user requests subtitles for a video, THE Subtitle_Service SHALL first check if CC subtitles are available
2. WHEN CC subtitles exist, THE System SHALL fetch and display the subtitle text
3. WHEN multiple subtitle languages are available, THE System SHALL prioritize Chinese (zh-CN) subtitles
4. WHEN no subtitles are available, THE System SHALL inform the user and suggest using audio transcription
5. THE System SHALL format subtitles with timestamps for easy navigation
6. WHEN subtitles are fetched successfully, THE System SHALL allow copying the full transcript

### Requirement 3: 集成到视频卡片

**User Story:** As a user, I want quick access to AI summary and subtitles from the video card, so that I can efficiently access video content.

#### Acceptance Criteria

1. THE Video_Card SHALL display an "AI总结" action button for each video
2. THE Video_Card SHALL display a "字幕" action button for each video
3. WHEN either button is clicked, THE System SHALL open a modal/drawer showing the content
4. THE System SHALL cache fetched summaries and subtitles to avoid repeated API calls
5. WHEN content is cached, THE System SHALL indicate this with a visual marker

### Requirement 4: API代理扩展

**User Story:** As a developer, I want the API proxy to support new Bilibili endpoints, so that the app can fetch summaries and subtitles.

#### Acceptance Criteria

1. THE Bilibili_API SHALL support the `/x/web-interface/view/conclusion/get` endpoint for AI summaries
2. THE Bilibili_API SHALL support the `/x/player/v2` endpoint for subtitle information
3. THE Bilibili_API SHALL support fetching subtitle JSON files from Bilibili CDN
4. WHEN requests require authentication, THE System SHALL use the user's stored Bilibili cookie
5. THE System SHALL handle rate limiting gracefully with appropriate retry logic
