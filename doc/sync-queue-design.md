# 视频同步队列设计方案

## 背景问题

### 1. 多用户并发风险

所有用户的 B站 API 请求都通过 Vercel 转发，导致：
- 所有请求来自同一 IP（Vercel 出口）
- 多用户同时同步会产生大量并发请求
- B站可能对该 IP 进行限流或封禁

### 2. 请求流程

```
用户A 浏览器 ──┐
用户B 浏览器 ──┼──→ Vercel /api/bilibili ──→ B站 API
用户C 浏览器 ──┘      (同一 IP)
```

---

## 解决方案：分布式同步队列

### 核心思路

使用 Supabase 数据库实现分布式锁，控制全局并发数：

```
用户A 点击同步 ──→ 获取锁 ✅ ──→ 开始同步
用户B 点击同步 ──→ 排队等待 ⏳ ──→ 显示"前面还有 1 人"
用户C 点击同步 ──→ 排队等待 ⏳ ──→ 显示"前面还有 2 人"
                      ↓
用户A 完成 ──→ 释放锁 ──→ 用户B 获取锁 ──→ 开始同步
```

---

## 技术实现

### 1. 数据库表设计

**文件**: `supabase/sync_lock.sql`

```sql
CREATE TABLE IF NOT EXISTS sync_lock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_lock UNIQUE (user_id)
);
```

**特点**：
- 每个用户只能持有一个锁（唯一约束）
- 自动记录开始时间，用于过期清理
- 级联删除，用户删除时自动释放锁

### 2. 队列管理模块

**文件**: `lib/syncQueue.ts`

```typescript
// 配置参数
const QUEUE_CONFIG = {
  MAX_CONCURRENT: 5,        // 全局最大并发同步数
  WAIT_TIMEOUT: 60000,      // 最大等待时间（60秒）
  POLL_INTERVAL: 2000,      // 轮询间隔（2秒）
  LOCK_EXPIRE_TIME: 120000, // 锁过期时间（2分钟）
};
```

**核心函数**：

| 函数 | 说明 |
|-----|------|
| `acquireSyncLock()` | 尝试获取同步锁 |
| `releaseSyncLock()` | 释放同步锁 |
| `waitForSyncLock()` | 等待获取锁（带超时） |
| `getQueueStatus()` | 获取当前队列状态 |

### 3. 获取锁流程

```typescript
async function acquireSyncLock() {
  // 1. 清理过期锁（2分钟未释放的）
  await cleanExpiredLocks();
  
  // 2. 检查是否已持有锁
  if (hasExistingLock()) return { success: true };
  
  // 3. 检查并发数是否达到上限
  if (currentCount < MAX_CONCURRENT) {
    // 尝试插入新锁
    return insertNewLock();
  }
  
  // 4. 返回排队位置
  return { success: false, position: queuePosition };
}
```

### 4. 前端集成

**文件**: `components/SyncButton.tsx`

```typescript
const handleStartSync = async () => {
  // 1. 等待获取同步锁
  const lockResult = await waitForSyncLock((position) => {
    setMessage(`⏳ 排队中... 前面还有 ${position} 人`);
  });

  if (lockResult.timedOut) {
    setMessage('⏰ 等待超时，请稍后重试');
    return;
  }

  try {
    // 2. 执行同步
    await triggerSyncWithUploaders(...);
  } finally {
    // 3. 释放锁
    await releaseSyncLock(lockResult.lockId);
  }
};
```

---

## 智能限流机制

### 自适应并发控制

在单用户同步内部，还有智能限流：

```typescript
// 初始状态
let concurrency = 5;   // 并发数
let delay = 100;       // 请求间隔

// 检测到限流时
if (rateLimited) {
  concurrency = Math.max(1, concurrency - 1);
  delay = Math.min(2000, delay * 2);
}

// 恢复正常时
if (successStreak >= 5) {
  concurrency = Math.min(5, concurrency + 1);
  delay = Math.max(100, delay / 2);
}
```

### 限流检测

识别 B站返回的限流错误码：
- `-799`: 请求过于频繁
- `-352`: 风控校验失败

---

## 配置参数说明

### 队列配置

| 参数 | 值 | 说明 |
|-----|-----|------|
| `MAX_CONCURRENT` | 5 | 全局最大并发用户数 |
| `WAIT_TIMEOUT` | 60秒 | 排队最大等待时间 |
| `POLL_INTERVAL` | 2秒 | 排队轮询间隔 |
| `LOCK_EXPIRE_TIME` | 2分钟 | 锁自动过期时间（防死锁） |
| 单用户并发 | 5 | 每个用户内部的请求并发数 |
| 请求间隔 | 100-2000ms | 根据限流情况自动调整 |

### 限流/节流/防抖配置

| 参数 | 值 | 说明 |
|-----|-----|------|
| `MIN_SYNC_INTERVAL` | 60秒 | 同一用户两次同步的最小间隔 |
| `MAX_SYNCS_PER_HOUR` | 10次 | 每小时最大同步次数 |
| `DEBOUNCE_DELAY` | 500ms | 按钮点击防抖延迟 |

---

## 限流、节流、防抖机制

### 1. 节流 (Throttle)

防止用户频繁同步，限制同步频率：

```typescript
// 检查是否可以同步
const throttleCheck = checkSyncThrottle();
if (!throttleCheck.canSync) {
  showMessage(throttleCheck.reason);
  // "请等待 45 秒后再同步"
  // "已达到每小时同步上限 (10次)，30 分钟后重置"
  return;
}
```

**规则**：
- 同一用户两次同步间隔至少 **60 秒**
- 每小时最多同步 **10 次**

### 2. 防抖 (Debounce)

防止用户快速连续点击同步按钮：

```typescript
// 500ms 内的重复点击会被忽略
if (now - lastClickTime < 500) {
  return false;
}
```

### 3. 限流 (Rate Limit)

基于滑动窗口的限流：

```
第1次同步 ──→ 记录时间
  ↓ (60秒内)
第2次同步 ──→ "请等待 X 秒"
  ↓ (60秒后)
第3次同步 ──→ 允许
  ...
第11次同步 ──→ "已达到每小时上限"
```

### 4. 存储机制

使用 localStorage 存储限流状态：

```typescript
STORAGE_KEYS = {
  LAST_SYNC_TIME: 'fluxfilter_last_sync_time',     // 上次同步时间
  SYNC_COUNT_HOUR: 'fluxfilter_sync_count_hour',   // 本小时同步次数
  SYNC_COUNT_RESET: 'fluxfilter_sync_count_reset', // 计数重置时间
}
```

### 5. 防风暴机制 (Anti-Thundering Herd)

当检测到高并发时，自动添加随机延迟，避免所有用户同时发起请求：

```typescript
// 配置
STORM_THRESHOLD: 3,       // 触发阈值：3人以上并发
STORM_JITTER_MIN: 1000,   // 最小延迟：1秒
STORM_JITTER_MAX: 5000,   // 最大延迟：5秒

// 计算公式
jitterFactor = (当前并发数 - 阈值 + 1) / 最大并发数
baseJitter = 最小延迟 + (最大延迟 - 最小延迟) × jitterFactor
finalJitter = baseJitter × (0.7 ~ 1.3)  // ±30% 随机
```

**示例**：

| 并发数 | 延迟范围 |
|-------|---------|
| 1-2 人 | 0秒（无延迟） |
| 3 人 | 0.7-1.3秒 |
| 4 人 | 1.4-2.6秒 |
| 5 人 | 2.1-3.9秒 |

**UI 提示**：
```
🛡️ 检测到高并发，随机等待 3 秒避免风暴...
```

**轮询抖动**：
排队等待时的轮询间隔也添加了 0-500ms 的随机抖动，避免多个用户同时重试。

---

## 公平调度策略 (Fair Scheduling)

### 问题

大任务用户（27个UP主）会长时间占用资源，阻塞小任务用户（5个UP主）。

### 解决方案：智能按需调度

**核心原则**：只有同时满足以下条件才启用调度机制：
1. **多用户**（≥3人同时同步）
2. **大任务**（≥15个UP主）

否则直接以最快速度执行。

### 配置

```typescript
// 默认配置：最快速度（绝大多数情况）
const FAST_CONFIG = { concurrency: 5, delay: 30ms, batchSize: 999, batchPause: 0 };

// 公平调度配置（仅多用户+大任务时启用）
const FAIR_CONFIG = { concurrency: 4, delay: 80ms, batchSize: 8, batchPause: 800ms };

// 触发条件
const isLargeTask = taskCount >= 15;
```

### 决策流程

```
用户点击同步
    ↓
UP主数 < 15？ ──是──→ 直接执行，无延迟（~1秒）
    ↓ 否
检查并发数
    ↓
并发 < 3？ ──是──→ 快速执行
    ↓ 否
启用公平调度 + 防风暴
```

### 执行流程

**小任务用户（5个UP主）**：
```
全部一次性完成 → 释放锁 → 约 1-2秒
```

**大任务用户（27个UP主）**：
```
批次1 (5个) → 暂停1.5秒 → 批次2 (5个) → 暂停1.5秒 → ...
              ↑
         让出时间给其他用户
```

### 效果对比

| 用户 | UP主数 | 无调度 | 有调度 |
|-----|-------|-------|-------|
| 用户A | 5个 | 等27秒 | 等2秒 |
| 用户B | 27个 | 27秒 | 35秒（分批） |

**总体体验提升**：小任务用户不会被大任务阻塞。

### UI 提示

```
📊 27 个UP主，预计 12 秒完成
🔄 [5/27] 19% 技术爬爬虾 +2
⏸️ 批次 1 完成，让出 1500ms...
🔄 [10/27] 37% 程序员鱼皮 +1
```

---

## UI 交互

### 排队状态显示

```
⏳ 排队中... 前面还有 2 人
```

### 同步进度显示

```
🚀 开始同步...
🔄 [3/27] 技术爬爬虾 +2
⚠️ 检测到限流，降速中... (并发:3, 延迟:200ms)
✅ 同步完成！新增 5 个视频
```

---

## 优势

1. **避免 IP 限流** - 控制全局并发，减少同时请求数
2. **公平排队** - 先到先得，避免资源争抢
3. **自动恢复** - 锁过期自动清理，防止死锁
4. **用户友好** - 显示排队位置，体验透明
5. **弹性伸缩** - 根据限流情况自动调整速度

---

## 文件清单

| 文件 | 说明 |
|-----|------|
| `supabase/sync_lock.sql` | 数据库表定义 |
| `lib/syncQueue.ts` | 队列管理逻辑 |
| `lib/autoSync.ts` | 同步逻辑（含智能限流） |
| `components/SyncButton.tsx` | 前端同步按钮 |

---

## 测试方案

### 测试概览

| 功能模块 | 测试类型 | 测试工具 | 优先级 |
|---------|---------|---------|-------|
| 分布式锁 | 单元测试 + 集成测试 | Vitest + Supabase | 高 |
| 节流/限流 | 单元测试 | Vitest | 高 |
| 防抖 | 单元测试 | Vitest | 中 |
| 防风暴 | 集成测试 | Playwright | 中 |
| 公平调度 | 集成测试 | Playwright | 中 |
| 并发控制 | 压力测试 | Artillery/k6 | 低 |

---

### 1. 分布式锁测试

#### 1.1 单用户获取锁

**测试方法**：手动测试 / Vitest 单元测试

**步骤**：
1. 确保 `sync_lock` 表为空
2. 用户A点击同步
3. 检查数据库是否创建了锁记录

**预期结果**：
- ✅ `sync_lock` 表新增一条 `user_id = 用户A` 的记录
- ✅ UI 显示"开始同步"

**验证 SQL**：
```sql
SELECT * FROM sync_lock WHERE user_id = '用户A的ID';
```

#### 1.2 多用户并发获取锁

**测试方法**：多浏览器手动测试 / Playwright 自动化

**步骤**：
1. 打开 6 个浏览器窗口，登录不同账号
2. 同时点击同步按钮

**预期结果**：
- ✅ 最多 5 个用户同时获得锁开始同步
- ✅ 第 6 个用户显示"排队中... 前面还有 1 人"
- ✅ 数据库 `sync_lock` 表最多 5 条记录

**验证 SQL**：
```sql
SELECT COUNT(*) FROM sync_lock; -- 应该 <= 5
```

#### 1.3 锁释放测试

**测试方法**：手动测试

**步骤**：
1. 用户A开始同步
2. 等待同步完成或点击取消

**预期结果**：
- ✅ 同步完成后 `sync_lock` 表中该用户的记录被删除
- ✅ 取消同步后锁也被释放

#### 1.4 锁过期自动清理

**测试方法**：手动测试 / 定时任务

**步骤**：
1. 手动插入一条 2 分钟前的锁记录
   ```sql
   INSERT INTO sync_lock (user_id, started_at) 
   VALUES ('test-user-id', NOW() - INTERVAL '3 minutes');
   ```
2. 任意用户尝试获取锁

**预期结果**：
- ✅ 过期锁被自动清理
- ✅ 新用户能获取锁

---

### 2. 节流/限流测试

#### 2.1 最小同步间隔测试

**测试方法**：手动测试

**步骤**：
1. 用户完成一次同步
2. 立即再次点击同步

**预期结果**：
- ✅ 显示"请等待 XX 秒后再同步"
- ✅ 60 秒后可以正常同步

**代码验证**：
```typescript
// 在浏览器控制台执行
import { checkSyncThrottle } from './lib/syncQueue';
console.log(checkSyncThrottle());
// { canSync: false, waitSeconds: 45, reason: "请等待 45 秒后再同步" }
```

#### 2.2 每小时次数限制测试

**测试方法**：手动测试（需要耐心）

**步骤**：
1. 连续同步 10 次（每次间隔 60 秒以上）
2. 尝试第 11 次同步

**预期结果**：
- ✅ 显示"已达到每小时同步上限 (10次)，XX 分钟后重置"

**快速验证**（修改 localStorage）：
```javascript
// 在浏览器控制台执行，模拟已同步 10 次
localStorage.setItem('fluxfilter_sync_count_hour', '10');
localStorage.setItem('fluxfilter_sync_count_reset', Date.now().toString());
// 然后点击同步，应该被拒绝
```

---

### 3. 防抖测试

#### 3.1 快速双击测试

**测试方法**：手动测试

**步骤**：
1. 快速连续点击同步按钮 5 次

**预期结果**：
- ✅ 只触发 1 次同步请求
- ✅ 不会弹出多个同步对话框

---

### 4. 防风暴测试

#### 4.1 高并发随机延迟测试

**测试方法**：多浏览器 + 控制台观察

**步骤**：
1. 打开 5 个浏览器窗口
2. 同时点击同步
3. 观察 UI 提示

**预期结果**：
- ✅ 当并发数 >= 3 时，部分用户显示"检测到高并发，随机等待 X 秒..."
- ✅ 不同用户的延迟时间不同（随机性）

**验证方式**：查看浏览器控制台日志时间戳

---

### 5. 公平调度测试

#### 5.1 任务分级测试

**测试方法**：手动测试

**步骤**：
1. 用户A选择 5 个 UP 主同步
2. 用户B选择 25 个 UP 主同步
3. 观察两者的同步行为

**预期结果**：

| 用户 | UP主数 | 并发数 | 是否分批 |
|-----|-------|-------|---------|
| A | 5 | 5 | 否 |
| B | 25 | 3 | 是（每5个暂停1.5秒） |

**UI 观察**：
- 用户A：无批次暂停提示
- 用户B：显示"⏸️ 批次 1 完成，让出 1500ms..."

#### 5.2 小任务优先完成测试

**测试方法**：双浏览器测试

**步骤**：
1. 用户A（25个UP主）先开始同步
2. 5 秒后用户B（5个UP主）开始同步
3. 观察谁先完成

**预期结果**：
- ✅ 用户B 可能在用户A 暂停让出时获得锁
- ✅ 用户B 完成时间明显短于用户A

---

### 6. 智能限流检测测试

#### 6.1 限流自动降速测试

**测试方法**：模拟 B站 限流响应

**步骤**：
1. 修改代码临时返回限流错误
   ```typescript
   // 在 getUploaderVideos 中临时添加
   if (Math.random() < 0.3) {
     throw new Error('B站API错误 [-352]: 风控校验失败');
   }
   ```
2. 开始同步，观察 UI

**预期结果**：
- ✅ 连续 2 次限流后显示"检测到限流，降速中..."
- ✅ 并发数降低，延迟增加
- ✅ 5 次成功后尝试恢复速度

---

## 自动化测试方案

### 推荐工具

| 工具 | 用途 | 安装 |
|-----|------|------|
| **Vitest** | 单元测试 | `npm i -D vitest` |
| **Playwright** | E2E 测试 | `npm i -D @playwright/test` |
| **MSW** | Mock API | `npm i -D msw` |

### 单元测试示例

**文件**: `tests/syncQueue.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  checkSyncThrottle, 
  recordSyncComplete,
  getSyncRateLimitStatus 
} from '../lib/syncQueue';

describe('节流机制', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('首次同步应该允许', () => {
    const result = checkSyncThrottle();
    expect(result.canSync).toBe(true);
    expect(result.waitSeconds).toBe(0);
  });

  it('60秒内再次同步应该被拒绝', () => {
    recordSyncComplete();
    const result = checkSyncThrottle();
    expect(result.canSync).toBe(false);
    expect(result.waitSeconds).toBeGreaterThan(0);
    expect(result.reason).toContain('请等待');
  });

  it('超过每小时限制应该被拒绝', () => {
    // 模拟已同步 10 次
    localStorage.setItem('fluxfilter_sync_count_hour', '10');
    localStorage.setItem('fluxfilter_sync_count_reset', Date.now().toString());
    
    const result = checkSyncThrottle();
    expect(result.canSync).toBe(false);
    expect(result.reason).toContain('每小时同步上限');
  });
});

describe('限流状态', () => {
  it('应该正确返回同步次数', () => {
    localStorage.setItem('fluxfilter_sync_count_hour', '5');
    localStorage.setItem('fluxfilter_sync_count_reset', Date.now().toString());
    
    const status = getSyncRateLimitStatus();
    expect(status.syncCountThisHour).toBe(5);
    expect(status.maxSyncsPerHour).toBe(10);
  });
});
```

### E2E 测试示例

**文件**: `tests/e2e/sync.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('同步功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 登录逻辑...
  });

  test('点击同步应该显示进度', async ({ page }) => {
    await page.click('[data-testid="sync-button"]');
    await page.click('[data-testid="start-sync"]');
    
    // 等待进度显示
    await expect(page.locator('text=/\\d+%/')).toBeVisible({ timeout: 5000 });
  });

  test('取消同步应该立即停止', async ({ page }) => {
    await page.click('[data-testid="sync-button"]');
    await page.click('[data-testid="start-sync"]');
    
    // 等待开始后取消
    await page.waitForTimeout(1000);
    await page.click('[data-testid="cancel-sync"]');
    
    await expect(page.locator('text=已取消同步')).toBeVisible();
  });

  test('节流应该阻止频繁同步', async ({ page }) => {
    // 第一次同步
    await page.click('[data-testid="sync-button"]');
    await page.click('[data-testid="start-sync"]');
    await page.waitForSelector('text=同步完成', { timeout: 60000 });
    await page.click('[data-testid="close-modal"]');
    
    // 立即再次同步
    await page.click('[data-testid="sync-button"]');
    await page.click('[data-testid="start-sync"]');
    
    // 应该显示等待提示
    await expect(page.locator('text=/请等待.*秒/')).toBeVisible();
  });
});
```

### 多用户并发测试

**文件**: `tests/e2e/concurrent-sync.spec.ts`

```typescript
import { test, expect, chromium } from '@playwright/test';

test('多用户并发同步测试', async () => {
  const browser = await chromium.launch();
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  
  // 所有用户登录
  for (const page of pages) {
    await page.goto('/');
    // 各自登录不同账号...
  }
  
  // 同时点击同步
  await Promise.all(pages.map(page => 
    page.click('[data-testid="sync-button"]')
  ));
  
  await Promise.all(pages.map(page => 
    page.click('[data-testid="start-sync"]')
  ));
  
  // 验证结果
  // 至少有一个应该显示排队
  const texts = await Promise.all(pages.map(page => 
    page.textContent('body')
  ));
  
  const queueingCount = texts.filter(t => t?.includes('排队中')).length;
  console.log(`排队用户数: ${queueingCount}`);
  
  await browser.close();
});
```

### 运行测试

```bash
# 安装依赖
npm i -D vitest @playwright/test

# 运行单元测试
npx vitest run

# 运行 E2E 测试
npx playwright test

# 带 UI 的 E2E 测试
npx playwright test --ui
```

### 持续集成 (CI)

**文件**: `.github/workflows/test.yml`

```yaml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npx vitest run

  e2e-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## 手动测试检查清单

### 基础功能

- [ ] 单用户同步正常完成
- [ ] 同步进度正确显示
- [ ] 取消同步立即生效
- [ ] 同步完成后锁被释放

### 队列机制

- [ ] 超过 5 人同时同步时显示排队
- [ ] 排队位置正确显示
- [ ] 前面用户完成后自动开始

### 限流机制

- [ ] 60 秒内重复同步被拒绝
- [ ] 每小时超过 10 次被拒绝
- [ ] 快速双击只触发一次

### 防风暴

- [ ] 高并发时显示随机等待
- [ ] 不同用户等待时间不同

### 公平调度

- [ ] 小任务用户（<10 UP主）快速完成
- [ ] 大任务用户（>20 UP主）分批处理
- [ ] 批次之间显示暂停提示

### 智能限流

- [ ] B站限流时自动降速
- [ ] 恢复正常后自动提速

---

## 监控指标

### 建议监控的指标

| 指标 | 说明 | 告警阈值 |
|-----|------|---------|
| 平均同步时间 | 从点击到完成的时间 | > 60秒 |
| 平均排队时间 | 等待获取锁的时间 | > 30秒 |
| 限流触发次数 | B站 API 返回限流 | > 10次/小时 |
| 锁超时清理次数 | 过期锁被清理 | > 5次/天 |

### 日志记录建议

```typescript
// 在关键位置添加日志
console.log('[Sync] 用户开始同步', { userId, uploaderCount });
console.log('[Sync] 获取锁', { lockId, waitTime });
console.log('[Sync] 批次完成', { batch, processed, total });
console.log('[Sync] 检测到限流', { concurrency, delay });
console.log('[Sync] 同步完成', { videosAdded, duration });
```

---

## 性能优化记录

### 优化版本历史

| 版本 | 耗时 | 主要改动 |
|-----|------|---------|
| v1.0 | ~30秒 | 串行获取 + 串行写入 |
| v2.0 | ~15秒 | 有限并发（5）+ 延迟 |
| v3.0 | ~7秒 | 提高并发（10）+ 减少延迟 |
| v4.0 | ~2秒 | **Promise.all 全并发 + 批量写入** |

### v4.0 极速架构

```
┌─────────────────────────────────────────────────────────┐
│                    阶段1: 并发获取                        │
├─────────────────────────────────────────────────────────┤
│  Promise.all([                                          │
│    fetchOne(UP主1),  ─┐                                 │
│    fetchOne(UP主2),  ─┼─→ 所有请求同时发出              │
│    fetchOne(UP主3),  ─┤   耗时 = 最慢的一个请求          │
│    ...               ─┘   约 500-800ms                  │
│  ])                                                     │
├─────────────────────────────────────────────────────────┤
│                    阶段2: 批量写入                        │
├─────────────────────────────────────────────────────────┤
│  收集所有视频 → 分批(每批200条) → Promise.all 并发写入    │
│  约 200-300ms                                           │
└─────────────────────────────────────────────────────────┘
```

### 核心优化点

#### 1. 获取阶段：全并发

```typescript
// ❌ 之前：有限并发
for (const up of uploaders) {
  await fetchOne(up);  // 串行等待
  await sleep(100);    // 人为延迟
}

// ✅ 现在：Promise.all 全并发
const fetchPromises = uploaders.map(up => fetchOne(up));
const results = await Promise.all(fetchPromises);
```

#### 2. 写入阶段：批量合并

```typescript
// ❌ 之前：每个UP主单独写入
for (const up of uploaders) {
  await supabase.from('video').upsert(up.videos);  // N次请求
}

// ✅ 现在：收集后一次性批量写入
const allVideos = results.flatMap(r => r.videos);
await supabase.from('video').upsert(allVideos);  // 1次请求
```

#### 3. 分批保护

```typescript
// 防止单次写入过多导致超时
const BATCH_SIZE = 200;
const batches = chunk(allVideos, BATCH_SIZE);
await Promise.all(batches.map(batch => 
  supabase.from('video').upsert(batch)
));
```

### 最终配置

```typescript
// 极速配置
const FAST_CONFIG = {
  concurrency: 20,      // 最大20并发（实际按UP主数量）
  delay: 0,             // 无延迟
  batchSize: 200,       // 数据库写入批次大小
};
```

---

## 性能优化路径总结

### 优化思路金字塔

```
                    ┌─────────┐
                    │  架构   │  ← 最大收益
                    │  优化   │     改变执行方式
                    ├─────────┤
                    │  并发   │  ← 高收益
                    │  优化   │     提高并行度
                    ├─────────┤
                    │  IO     │  ← 中等收益
                    │  优化   │     批量合并请求
                    ├─────────┤
                    │  代码   │  ← 低收益
                    │  优化   │     减少计算开销
                    └─────────┘
```

### 优化检查清单

#### Level 1: 架构层面（最优先）

- [ ] 是否可以改变执行模型？（串行 → 并行）
- [ ] 是否可以分离不同阶段？（获取 vs 写入）
- [ ] 是否可以使用 Promise.all？

#### Level 2: 并发层面

- [ ] 并发数是否可以提高？
- [ ] 是否有不必要的 await？
- [ ] 是否有不必要的延迟？

#### Level 3: IO 层面

- [ ] 多次小请求能否合并为一次大请求？
- [ ] 数据库操作能否批量执行？
- [ ] 能否使用异步不等待？

#### Level 4: 代码层面

- [ ] 是否有不必要的数据转换？
- [ ] 是否有重复计算？

### 适用场景

| 场景 | 推荐策略 |
|-----|---------|
| 单用户小任务 | Promise.all 全并发，极速完成 |
| 单用户大任务 | 全并发获取 + 分批写入 |
| 多用户同时 | 队列排队 + 公平调度 |
| 高限流风险 | 降低并发 + 增加延迟 |

### 关键代码位置

| 文件 | 函数 | 说明 |
|-----|------|------|
| `lib/autoSync.ts` | `syncWithUploaders` | 核心同步逻辑 |
| `lib/autoSync.ts` | `fetchOne` | 单个UP主获取 |
| `lib/syncQueue.ts` | `waitForSyncLock` | 队列等待 |
| `components/SyncButton.tsx` | `handleStartSync` | 前端触发 |

---

## 风控问题与修复

### 问题：全并发触发 B站风控

当使用 `Promise.all` 同时发出 27 个请求时，B站检测到异常流量，触发 `-352` 风控错误。

### 解决方案：有限并发

```typescript
// ❌ 全并发（触发风控）
const results = await Promise.all(uploaders.map(up => fetchOne(up)));

// ✅ 有限并发（8个，安全）
const MAX_CONCURRENT = 8;
// 使用队列控制同时只有 8 个请求在执行
```

### 并发数选择

| 并发数 | 速度 | 风控风险 | 推荐 |
|-------|------|---------|-----|
| 27（全并发） | ~1秒 | ❌ 高 | 不推荐 |
| **8** | ~3秒 | ✅ 安全 | **推荐** |
| 5 | ~5秒 | ✅ 很安全 | 保守 |

---

## 用户信息缓存机制

### 背景

需要快速判断当前用户是否在白名单中，避免每次都查询数据库。

### 实现

**存储键**：
```typescript
const USER_ID_KEY = 'fluxfilter_user_id';
const USERNAME_KEY = 'fluxfilter_username';
```

**登录/注册时保存**：
```typescript
setStoredUserId(data.id);
setStoredUsername(data.username);
```

**退出时清除**：
```typescript
localStorage.removeItem(USER_ID_KEY);
localStorage.removeItem(USERNAME_KEY);
```

**读取**：
```typescript
const username = getStoredUsername(); // 同步读取，无需 await
```

### API

| 函数 | 说明 |
|-----|------|
| `getStoredUserId()` | 获取用户ID |
| `setStoredUserId(id)` | 保存用户ID |
| `getStoredUsername()` | 获取用户名 |
| `setStoredUsername(name)` | 保存用户名 |
| `clearStoredUserId()` | 清除所有用户信息 |

---

## 白名单机制

### 用途

允许特定用户跳过限流限制，用于测试或特权用户。

### 配置

```typescript
// 白名单用户列表
const WHITELIST_USERS = ['senjay'];
```

### 检查逻辑

```typescript
const username = getStoredUsername();
const isWhitelisted = username && WHITELIST_USERS.includes(username.toLowerCase());

if (!isWhitelisted) {
  // 执行限流检查
  const throttleCheck = checkSyncThrottle();
  if (!throttleCheck.canSync) {
    // 显示限流提示
    return;
  }
}
// 白名单用户直接跳过限流
```

### 添加白名单用户

修改 `components/SyncButton.tsx` 中的 `WHITELIST_USERS` 数组：

```typescript
const WHITELIST_USERS = ['senjay', 'admin', 'test'];
```

---

## 修改记录

| 日期 | 版本 | 修改内容 |
|-----|------|---------|
| 2024-12-12 | v1.0 | 初始设计：分布式队列、限流机制 |
| 2024-12-12 | v2.0 | 优化：Promise.all 全并发 |
| 2024-12-12 | v3.0 | 修复：改为 8 并发避免风控 |
| 2024-12-12 | v3.1 | 新增：用户名缓存机制 |
| 2024-12-12 | v3.2 | 新增：白名单跳过限流 |
| 2024-12-12 | v4.0 | 新增：数据缓存系统 |
| 2024-12-12 | v4.1 | 新增：前端渲染性能优化 |

---

## 数据缓存策略

### 缓存架构

```
┌─────────────────────────────────────────────────────────────┐
│                       缓存层级                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │  内存缓存     │ ──→ │ localStorage │ ──→ │  Supabase   │ │
│  │  (最快)      │     │  (持久化)    │     │  (数据源)   │ │
│  │  5分钟       │     │  1小时       │     │              │ │
│  └──────────────┘     └──────────────┘     └──────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 缓存类型

| 类型 | 存储 | 特点 | 适用场景 |
|-----|------|------|---------|
| **内存缓存** | JavaScript Map | 最快，页面刷新后失效 | 频繁访问的数据 |
| **持久化缓存** | localStorage | 页面刷新后保留 | 不常变化的数据 |

### 缓存数据

| 数据 | 缓存类型 | TTL | 说明 |
|-----|---------|-----|------|
| **UP主列表** | 内存+持久化 | 1小时 | 不频繁变化 |
| **视频统计** | 持久化 | 30分钟 | 热力图数据 |
| **用户信息** | localStorage | 永久 | 登录时写入 |

### 缓存键规范

```typescript
const CACHE_KEYS = {
  UPLOADERS: (userId: string) => `uploaders_${userId}`,
  VIDEO_COUNT_BY_DATE: (userId: string) => `video_count_${userId}`,
  VIDEOS_FIRST_PAGE: (userId: string) => `videos_first_${userId}`,
  WATCHLIST: (userId: string) => `watchlist_${userId}`,
};
```

### 缓存 API

**文件**: `lib/cache.ts`

```typescript
// 内存缓存
setMemoryCache(key, data, ttlMs);
getMemoryCache<T>(key);
deleteMemoryCache(key);

// 持久化缓存
setStorageCache(key, data, ttlMs);
getStorageCache<T>(key);
deleteStorageCache(key);

// 带缓存的数据获取
cachedFetch<T>(key, fetcher, options);

// 使缓存失效
invalidateCache(key);
```

### 缓存使用示例

```typescript
// UP主列表获取（带缓存）
const list = await cachedFetch<Uploader[]>(
  CACHE_KEYS.UPLOADERS(userId),
  async () => {
    const { data } = await supabase.from('uploader').select('*');
    return data || [];
  },
  {
    memoryTTL: CACHE_TTL.UPLOADERS,   // 1小时
    storageTTL: CACHE_TTL.UPLOADERS,  // 1小时
    forceRefresh: false,               // 强制刷新
  }
);
```

### 缓存失效策略

| 场景 | 处理 |
|-----|------|
| 同步完成 | 使视频统计缓存失效 |
| 添加/删除UP主 | 使UP主列表缓存失效 |
| 用户退出 | 清空所有缓存 |
| 缓存版本更新 | 自动清理旧版本缓存 |

```typescript
// 同步成功后
if (result.success && result.videosAdded > 0) {
  invalidateCache(CACHE_KEYS.VIDEO_COUNT_BY_DATE(userId));
}
```

---

## 缓存一致性保障

### 一致性挑战

| 场景 | 问题 | 解决方案 |
|-----|------|---------|
| 数据更新后 | 缓存数据过期 | 主动失效 |
| 多标签页 | 各标签页缓存不同步 | 跨标签页广播 |
| 数据结构变更 | 旧缓存格式不兼容 | 版本号检查 |
| 长时间未刷新 | 缓存过期但未感知 | TTL 自动过期 |

### 策略1：主动失效（Write-Through）

**原则**：数据变更时立即使缓存失效

```
写操作 ──→ 更新数据库 ──→ 使缓存失效 ──→ 下次读取重新获取
```

**实现**：

```typescript
// 添加UP主后
await supabase.from('uploader').insert(newUploader);
invalidateCache(CACHE_KEYS.UPLOADERS(userId));

// 删除UP主后
await supabase.from('uploader').delete().eq('id', id);
invalidateCache(CACHE_KEYS.UPLOADERS(userId));

// 同步完成后
if (result.success) {
  invalidateCache(CACHE_KEYS.VIDEO_COUNT_BY_DATE(userId));
}
```

### 策略2：跨标签页同步

**问题**：用户在标签页A同步，标签页B的缓存未更新

**解决**：使用 `localStorage` 事件实现跨标签页通信

```typescript
// 广播缓存失效
function broadcastCacheInvalidation(key: string): void {
  const eventKey = `fluxfilter_cache_invalidate_${Date.now()}`;
  localStorage.setItem(eventKey, key);
  localStorage.removeItem(eventKey); // 触发 storage 事件
}

// 监听其他标签页的失效事件
window.addEventListener('storage', (event) => {
  if (event.key?.includes('invalidate') && event.newValue) {
    deleteMemoryCache(event.newValue);
  }
});
```

**流程**：

```
标签页A 同步完成
    ↓
invalidateCache(key)
    ↓
广播 storage 事件
    ↓
标签页B 收到事件 ──→ 清除内存缓存
    ↓
标签页B 下次读取 ──→ 从数据库获取最新数据
```

### 策略3：版本号机制

**问题**：代码更新后数据结构变化，旧缓存格式不兼容

**解决**：缓存带版本号，版本不匹配时自动清理

```typescript
const CACHE_VERSION = 1; // 修改数据结构时递增

interface StorageCacheItem<T> {
  data: T;
  expireAt: number;
  version: number;  // 版本号
}

// 读取时检查版本
const item = JSON.parse(localStorage.getItem(key));
if (item.version !== CACHE_VERSION) {
  localStorage.removeItem(key); // 清除旧缓存
  return null;
}
```

### 策略4：TTL 自动过期

**问题**：缓存长时间未失效，数据可能已过期

**解决**：设置合理的 TTL，到期自动失效

```typescript
// 读取时检查过期时间
if (Date.now() > item.expireAt) {
  localStorage.removeItem(key);
  return null;
}
```

**TTL 配置**：

| 数据 | TTL | 理由 |
|-----|-----|------|
| UP主列表 | 1小时 | 不频繁变化 |
| 视频统计 | 30分钟 | 同步后会主动失效 |
| 用户信息 | 永久 | 登录时写入，退出时清除 |

### 策略5：强制刷新

**场景**：用户主动刷新，确保获取最新数据

```typescript
// 支持强制刷新参数
const list = await cachedFetch(key, fetcher, {
  forceRefresh: true,  // 跳过缓存
});

// 或调用
fetchUploaders(true); // forceRefresh = true
```

### 一致性保障 API

| 函数 | 说明 |
|-----|------|
| `invalidateCache(key)` | 使单个缓存失效 + 广播 |
| `invalidateCaches(keys)` | 批量使缓存失效 |
| `invalidateUserCaches(userId)` | 使用户所有缓存失效 |
| `setupCacheInvalidationListener()` | 监听跨标签页失效事件 |
| `checkCacheVersion()` | 检查并清理旧版本缓存 |

### 初始化

在应用启动时设置：

```typescript
// App.tsx 或 index.tsx
import { setupCacheInvalidationListener, checkCacheVersion } from './lib/cache';

useEffect(() => {
  // 检查缓存版本
  checkCacheVersion();
  
  // 监听跨标签页缓存失效
  const cleanup = setupCacheInvalidationListener();
  return cleanup;
}, []);
```

### 一致性级别

| 级别 | 说明 | 适用场景 |
|-----|------|---------|
| **强一致** | 每次读取都从数据库获取 | 关键数据（如账户余额） |
| **最终一致** | 缓存有 TTL，最终会更新 | 大多数场景 |
| **弱一致** | 仅依赖 TTL，无主动失效 | 不重要的展示数据 |

本项目采用**最终一致**策略，通过主动失效 + TTL 保障数据一致性。

---

## 跨设备缓存同步

### 问题

localStorage 是设备本地存储，设备A同步后，设备B的缓存不会自动更新。

### 解决方案：服务端时间戳

```
设备A 同步完成
    ↓
更新 user.updated_at = now()
    ↓
设备B 启动时检查
    ↓
服务端时间 > 本地时间？
    ↓ 是
清理本地缓存，重新获取
```

### 实现

**数据库字段**：使用 `user.updated_at` 记录最后更新时间

**写操作后**：

```typescript
// 同步完成后
await markServerDataUpdated(supabase, userId);
```

**应用启动时**：

```typescript
// App.tsx
const needRefresh = await checkCrossDeviceSync(supabase, userId);
if (needRefresh) {
  // 缓存已清理，会自动重新获取
}
```

### API

| 函数 | 说明 |
|-----|------|
| `checkCrossDeviceSync(supabase, userId)` | 检查是否需要刷新 |
| `markServerDataUpdated(supabase, userId)` | 标记数据已更新 |
| `setLocalLastUpdate(timestamp)` | 记录本地同步时间 |
| `getLocalLastUpdate()` | 获取本地同步时间 |

### 跨设备同步流程

```
┌─────────────────────────────────────────────────────────────┐
│                     跨设备缓存同步                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  设备A (同步)                      设备B (启动)              │
│  ┌──────────────┐                 ┌──────────────┐          │
│  │ 1. 同步完成   │                 │ 1. 启动应用   │          │
│  │ 2. 更新服务端 │──→ Supabase ←──│ 2. 检查时间戳 │          │
│  │    时间戳     │    (user表)     │ 3. 发现更新   │          │
│  │ 3. 更新本地   │                 │ 4. 清理缓存   │          │
│  │    时间戳     │                 │ 5. 重新获取   │          │
│  └──────────────┘                 └──────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 三层保障

| 层级 | 机制 | 延迟 |
|-----|------|------|
| **同设备多标签页** | localStorage 事件 | 实时 |
| **跨设备** | 服务端时间戳 | 下次启动时 |
| **兜底** | TTL 自动过期 | 最大 1 小时 |

---

## 前端渲染性能优化

### 优化策略

| 优化项 | 技术 | 效果 |
|-------|------|------|
| **组件记忆化** | `React.memo` | 避免不必要的重渲染 |
| **计算缓存** | `useMemo` | 避免重复计算 |
| **函数缓存** | `useCallback` | 避免函数重复创建 |
| **图片懒加载** | `loading="lazy"` | 减少初始加载 |
| **分页加载** | `visibleCount` | 减少 DOM 节点 |

### VideoCard 组件优化

**文件**: `components/VideoCard.tsx`

```typescript
// 1. 使用 memo 避免不必要的重渲染
export default memo(VideoCard, (prevProps, nextProps) => {
  return (
    prevBvid === nextBvid &&
    prevProps.isInWatchlist === nextProps.isInWatchlist &&
    prevProps.openMenuId === nextProps.openMenuId
  );
});

// 2. 使用 useMemo 缓存视频数据计算
const videoData = useMemo(() => ({
  bvid, thumbnail, title, duration, author, avatar, stats, pubdate
}), [video]);

// 3. 使用 useCallback 缓存事件处理函数
const handleClick = useCallback(() => {
  handleVideoClick(bvid);
}, [bvid]);

// 4. 工具函数移到组件外
const formatNumber = (num: number): string => { ... };
const formatPubdate = (pubdate: string): string => { ... };
```

### 重渲染触发条件

优化后，VideoCard 仅在以下情况重新渲染：

| 条件 | 说明 |
|-----|------|
| `bvid` 变化 | 视频本身变化 |
| `isInWatchlist` 变化 | 待看状态变化 |
| `openMenuId` 变化 | 菜单打开/关闭 |

其他 props 变化（如 `onAddToWatchlist` 函数引用）不会触发重渲染。

### 列表渲染优化

**文件**: `App.tsx`

```typescript
// 分页加载，避免一次渲染过多 DOM
{filteredVideos.slice(0, visibleCount).map((video) => (
  <VideoCard key={video.bvid} ... />
))}
```

### 图片优化

```typescript
<img 
  src={thumbnail} 
  loading="lazy"           // 懒加载
  referrerPolicy="no-referrer"  // 避免 403
  className="transform-gpu"     // GPU 加速
/>
```

### 性能对比

| 场景 | 优化前 | 优化后 |
|-----|-------|-------|
| 100 个视频首次渲染 | ~200ms | ~80ms |
| 滚动时重渲染 | 全部重渲染 | 仅可见区域 |
| 打开菜单 | 全部重渲染 | 仅 1 个卡片 |

### 缓存效果

| 场景 | 无缓存 | 有缓存 | 提升 |
|-----|-------|-------|------|
| 打开同步弹窗 | ~200ms | ~5ms | **40倍** |
| 加载热力图 | ~300ms | ~5ms | **60倍** |
| 重复访问 | 每次请求 | 命中缓存 | 无网络请求 |

### 缓存调试

```typescript
// 查看所有缓存
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key?.startsWith('fluxfilter_cache_')) {
    console.log(key, localStorage.getItem(key));
  }
}

// 清空所有缓存
clearStorageCache();
clearMemoryCache();
```

---

*创建时间：2024-12-12*
*更新时间：2024-12-12*
