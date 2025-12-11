# B站视频同步服务

独立运行的定时任务脚本，部署在服务器上定时同步B站UP主的视频。

## 部署步骤

### 1. 上传文件到服务器

将 `scripts` 文件夹上传到服务器：

```bash
scp -r scripts/ user@your-server:/home/user/bilibili-sync/
```

### 2. 安装依赖

```bash
cd /home/user/bilibili-sync
npm install
```

### 3. 配置环境变量

创建 `.env` 文件或直接修改 `sync-service.js` 中的配置：

```bash
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"
```

或者直接编辑 `sync-service.js` 中的 `CONFIG` 对象。

### 4. 测试运行

```bash
node sync-service.js
```

### 5. 使用 PM2 后台运行（推荐）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start sync-service.js --name "bilibili-sync"

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs bilibili-sync

# 查看状态
pm2 status
```

### 6. 或使用 systemd（Linux）

创建 `/etc/systemd/system/bilibili-sync.service`：

```ini
[Unit]
Description=Bilibili Video Sync Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/user/bilibili-sync
ExecStart=/usr/bin/node sync-service.js
Restart=always
RestartSec=10
Environment=SUPABASE_URL=https://xxx.supabase.co
Environment=SUPABASE_SERVICE_KEY=your-key

[Install]
WantedBy=multi-user.target
```

然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable bilibili-sync
sudo systemctl start bilibili-sync
sudo systemctl status bilibili-sync
```

## 配置说明

编辑 `sync-service.js` 中的 `CONFIG`：

| 配置项 | 说明 | 默认值 |
|-------|------|--------|
| `SUPABASE_URL` | Supabase 项目 URL | - |
| `SUPABASE_SERVICE_KEY` | Service Role Key | - |
| `CRON_SCHEDULE_MORNING` | 早上同步时间 | `30 6 * * *` (6:30) |
| `CRON_SCHEDULE_EVENING` | 晚上同步时间 | `0 17 * * *` (17:00) |
| `REQUEST_DELAY` | 请求间隔（毫秒） | `500` |

## Cron 表达式说明

```
┌──────────── 分钟 (0-59)
│ ┌────────── 小时 (0-23)
│ │ ┌──────── 日 (1-31)
│ │ │ ┌────── 月 (1-12)
│ │ │ │ ┌──── 星期 (0-7, 0和7都是周日)
│ │ │ │ │
* * * * *
```

示例：
- `30 6 * * *` - 每天 6:30
- `0 17 * * *` - 每天 17:00
- `0 */2 * * *` - 每2小时
- `0 8,12,18 * * *` - 每天 8:00, 12:00, 18:00
