# AI 书签搜索助手 - Edge/Chrome 浏览器扩展

用自然语言智能搜索你的浏览器书签。

## 功能特点

- 🔍 **自然语言搜索** - 用日常语言描述你想找的书签
- 🤖 **AI 智能匹配** - 基于 DeepSeek API 进行语义理解
- 📁 **文件夹感知** - 搜索结果显示书签所在文件夹
- ⚡ **本地降级** - 无 API Key 时自动使用本地模糊搜索
- ⌨️ **快捷键支持** - `Ctrl+Shift+B` 快速打开

## 安装方法

### 方法一：开发者模式加载（推荐）

1. 打开 Edge 浏览器，访问 `edge://extensions/`
2. 开启右上角的「开发人员模式」
3. 点击「加载解压缩的扩展」
4. 选择 `browser-extension` 文件夹
5. 扩展安装完成！

### 方法二：Chrome 浏览器

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `browser-extension` 文件夹

## 配置 AI（可选）

点击扩展弹窗右上角的设置图标 ⚙️，配置：

- **API Key**: DeepSeek API 密钥（[获取地址](https://platform.deepseek.com/)）
- **Base URL**: API 地址（默认 `https://api.deepseek.com/v1`）
- **Model**: 模型名称（默认 `deepseek-chat`）

> 💡 不配置 API Key 也可以使用，会自动降级为本地关键词搜索

## 使用示例

- 「那个AI画图的网站」→ 找到 Midjourney、DALL-E 等
- 「之前收藏的Redis文档」→ 找到 Redis 相关文档
- 「看视频的」→ 找到 B站、YouTube 等视频网站
- 「临时邮箱」→ 找到临时邮箱服务

## 图标生成

扩展需要 PNG 格式图标，可以用以下方法生成：

1. 使用在线工具将 `icons/icon.svg` 转换为 PNG
2. 生成 16x16、32x32、48x48、128x128 四种尺寸
3. 保存为 `icon16.png`、`icon32.png`、`icon48.png`、`icon128.png`

或者使用命令行工具（需要安装 ImageMagick）：
```bash
magick icons/icon.svg -resize 16x16 icons/icon16.png
magick icons/icon.svg -resize 32x32 icons/icon32.png
magick icons/icon.svg -resize 48x48 icons/icon48.png
magick icons/icon.svg -resize 128x128 icons/icon128.png
```

## 文件结构

```
browser-extension/
├── manifest.json    # 扩展配置
├── popup.html       # 弹窗页面
├── popup.css        # 样式
├── popup.js         # 主逻辑
├── icons/           # 图标
│   ├── icon.svg     # 源文件
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md        # 说明文档
```

## 权限说明

- `bookmarks` - 读取浏览器书签
- `storage` - 保存 API 配置

## 技术栈

- Manifest V3
- DeepSeek API
- 原生 JavaScript（无框架依赖）
