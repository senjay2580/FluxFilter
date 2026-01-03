# 每日工作流系统实现指南

## 概述

完整的每日工作流系统已集成到 FluxFilter，支持多步骤任务追踪、完成情况统计、热力图展示和纸屑庆祝动画。

## 系统架构

### 数据库设计

#### 1. 工作流节点表 (`workflow_node`)
系统级表，定义所有可用的工作流节点：
- `id`: 主键
- `code`: 节点代码（daily_info, dev_hotspot, video_collection, notes）
- `name`: 节点名称
- `description`: 节点描述
- `icon`: 图标名称
- `order_index`: 显示顺序

**初始数据**：
```sql
INSERT INTO workflow_node (code, name, description, icon, order_index) VALUES
    ('daily_info', '每日信息差', '浏览今日热点资讯和信息差', 'newspaper', 1),
    ('dev_hotspot', '开发者热点', '关注开发者社区热点话题', 'trending', 2),
    ('video_collection', '视频/收藏夹', '整理和收藏相关视频', 'video', 3),
    ('notes', '笔记', '记录学习笔记和心得', 'note', 4);
```

#### 2. 每日工作流表 (`daily_workflow`)
用户级表，按日期隔离，记录每天的工作流完成情况：
- `id`: 主键
- `user_id`: 用户ID（外键）
- `workflow_date`: 工作流日期（按天隔离）
- `is_completed`: 是否全部完成
- `completed_at`: 完成时间
- 唯一约束：`(user_id, workflow_date)`

#### 3. 工作流节点完成情况表 (`workflow_node_progress`)
记录每个节点的完成状态：
- `id`: 主键
- `daily_workflow_id`: 关联的每日工作流（外键）
- `node_id`: 节点ID（外键）
- `is_completed`: 是否完成
- `completed_at`: 完成时间
- 唯一约束：`(daily_workflow_id, node_id)`

#### 4. 工作流完成历史表 (`workflow_completion_history`)
用于热力图统计和数据分析：
- `id`: 主键
- `user_id`: 用户ID（外键）
- `completion_date`: 完成日期
- `completed_nodes`: 完成的节点数
- `total_nodes`: 总节点数
- `completion_rate`: 完成率（0-100）
- 唯一约束：`(user_id, completion_date)`

### 核心函数

#### SQL 函数

**1. `get_or_create_daily_workflow(p_user_id, p_workflow_date)`**
- 获取或创建今日工作流
- 自动为所有节点创建进度记录
- 返回工作流ID

**2. `mark_node_completed(p_daily_workflow_id, p_node_id)`**
- 标记节点完成
- 检查是否所有节点都完成
- 自动更新完成历史
- 返回是否全部完成（布尔值）

**3. `get_workflow_stats(p_user_id, p_days)`**
- 获取用户工作流统计数据
- 用于热力图展示
- 返回指定天数内的完成情况

### 后端服务 (`lib/workflow-service.ts`)

提供 TypeScript 接口和函数：

```typescript
// 获取所有工作流节点
getWorkflowNodes(): Promise<WorkflowNode[]>

// 获取或创建今日工作流
getOrCreateDailyWorkflow(date?: Date): Promise<DailyWorkflow>

// 获取今日工作流概览
getTodayWorkflowOverview(): Promise<WorkflowOverview>

// 标记节点完成
markNodeCompleted(dailyWorkflowId: number, nodeId: number): Promise<boolean>

// 获取工作流统计数据（用于热力图）
getWorkflowStats(days?: number): Promise<WorkflowStats[]>

// 获取工作流完成率统计
getWorkflowCompletionStats(days?: number): Promise<{
  totalDays: number;
  completedDays: number;
  completionRate: number;
  averageNodesPerDay: number;
}>
```

### 前端组件

#### 1. DailyWorkflow 页面 (`components/pages/DailyWorkflow.tsx`)

主工作流页面，包含：
- **进度概览**：显示今日完成进度条
- **节点卡片网格**：4个节点卡片，支持点击进入和手动完成
- **统计信息**：完成率、平均完成节点数
- **热力图**：90天完成情况热力图，按周分组展示
- **纸屑动画**：全部完成时播放庆祝动画
- **完成弹窗**：全部完成时显示庆祝弹窗

**关键特性**：
- 实时更新进度
- 响应式设计（移动端和PC端）
- 平滑的过渡动画
- 热力图交互提示

#### 2. WorkflowPromptModal 组件 (`components/layout/WorkflowPromptModal.tsx`)

登录后首次显示的提示弹窗，包含：
- **完成状态指示**：显示今日完成情况
- **进度条**：可视化完成进度
- **节点列表**：显示所有节点及其完成状态
- **CTA按钮**：进入工作流或稍后再看

**特点**：
- 自动加载今日工作流数据
- 仅在登录后首次显示
- 支持关闭和稍后查看

### 集成到 App.tsx

#### 状态管理
```typescript
const [isDailyWorkflowOpen, setIsDailyWorkflowOpen] = useState(false);
const [showWorkflowPrompt, setShowWorkflowPrompt] = useState(false);
const [workflowPromptShownToday, setWorkflowPromptShownToday] = useState(false);
```

#### 登录后显示提示
```typescript
const handleLoginSuccess = async () => {
  // ... 其他逻辑
  setShowWorkflowPrompt(true);
  setWorkflowPromptShownToday(true);
};
```

#### 快捷访问入口
在快捷访问栏中添加工作流按钮：
```typescript
<button
  onClick={() => setIsDailyWorkflowOpen(true)}
  className="relative w-11 h-11 lg:w-full lg:h-14 bg-[#1a1f16] border border-white/10 rounded-xl flex items-center justify-center lg:justify-start lg:gap-3 lg:px-4 hover:bg-[#232d1e] transition-all active:scale-[0.98]"
  title="每日工作流"
>
  {/* 工作流图标 */}
</button>
```

#### 模态框渲染
```typescript
{isDailyWorkflowOpen && (
  <Suspense fallback={<SimpleLoader />}>
    <DailyWorkflow
      onClose={() => setIsDailyWorkflowOpen(false)}
      onNodeClick={(nodeCode) => {
        // 根据节点代码跳转到相应页面
      }}
    />
  </Suspense>
)}

{showWorkflowPrompt && !workflowPromptShownToday && (
  <Suspense fallback={null}>
    <WorkflowPromptModal
      onClose={() => setShowWorkflowPrompt(false)}
      onEnter={() => {
        setShowWorkflowPrompt(false);
        setIsDailyWorkflowOpen(true);
      }}
    />
  </Suspense>
)}
```

## 使用流程

### 用户流程

1. **登录**
   - 用户登录后，自动显示工作流提示弹窗
   - 弹窗显示今日工作流概览和完成进度

2. **查看工作流**
   - 用户点击"进入工作流"进入完整工作流页面
   - 或点击快捷访问栏的工作流按钮

3. **完成任务**
   - 用户点击节点卡片的"进入"按钮跳转到相应页面
   - 完成任务后，点击"完成"按钮标记节点完成
   - 系统自动更新进度

4. **全部完成**
   - 当所有节点都完成时，播放纸屑动画
   - 显示庆祝弹窗
   - 完成情况自动记录到热力图

5. **查看统计**
   - 用户可以查看90天的完成热力图
   - 查看完成率和平均完成节点数

### 数据流

```
用户登录
  ↓
显示工作流提示弹窗
  ↓
用户点击"进入工作流"
  ↓
加载今日工作流数据
  ↓
显示工作流页面
  ↓
用户点击"完成"按钮
  ↓
调用 markNodeCompleted()
  ↓
更新节点完成状态
  ↓
检查是否全部完成
  ↓
如果全部完成：
  - 播放纸屑动画
  - 显示庆祝弹窗
  - 更新完成历史
  ↓
用户查看热力图
  ↓
显示90天完成情况
```

## 数据库迁移

执行以下SQL脚本来创建工作流系统表：

```bash
# 在 Supabase Dashboard 中执行
supabase/migrations/create_daily_workflow.sql
```

该脚本包含：
- 4个表的创建
- 索引优化
- RLS策略
- 触发器
- 初始数据插入
- 3个核心函数

## 热力图算法

热力图基于完成率显示颜色：
- **0%**：灰色（`bg-white/5`）
- **1-24%**：橙色（`bg-orange-500/20`）
- **25-49%**：黄色（`bg-yellow-500/20`）
- **50-74%**：绿色（`bg-lime-500/20`）
- **75-100%**：亮绿色（`bg-cyber-lime/30`）

## 纸屑动画

使用CSS关键帧实现纸屑下落动画：
```css
@keyframes fall {
  to {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}
```

50个纸屑元素随机分布，各自独立下落。

## 性能优化

1. **数据库索引**
   - `idx_daily_workflow_user_date`：用户和日期查询
   - `idx_node_progress_workflow`：节点进度查询
   - `idx_completion_history_user_date`：热力图数据查询

2. **前端优化**
   - 使用 `memo` 优化组件重渲染
   - 使用 `useMemo` 缓存热力图数据
   - 使用 `useCallback` 缓存事件处理函数
   - 懒加载组件（`Suspense`）

3. **SQL优化**
   - 使用 RLS 策略进行行级安全
   - 使用函数封装复杂逻辑
   - 使用 `ON CONFLICT` 处理并发更新

## 扩展建议

### 1. 添加更多节点
在 `workflow_node` 表中插入新节点：
```sql
INSERT INTO workflow_node (code, name, description, icon, order_index) VALUES
    ('new_node', '新节点', '节点描述', 'icon', 5);
```

### 2. 自定义节点操作
在 `DailyWorkflow` 组件中的 `onNodeClick` 回调中添加自定义逻辑。

### 3. 添加节点提示
为每个节点添加详细的完成指南或教程。

### 4. 集成通知
当用户完成节点时发送通知。

### 5. 社交功能
添加分享完成情况到社交媒体的功能。

## 故障排除

### 问题：工作流提示不显示
**解决**：检查 `workflowPromptShownToday` 状态是否正确设置

### 问题：热力图数据为空
**解决**：确保 `workflow_completion_history` 表有数据，检查日期范围

### 问题：节点完成后进度不更新
**解决**：检查 `markNodeCompleted` 函数是否正确调用，确保网络连接正常

### 问题：纸屑动画不显示
**解决**：检查浏览器是否支持CSS动画，检查z-index是否正确

## 相关文件

- **数据库迁移**：`supabase/migrations/create_daily_workflow.sql`
- **后端服务**：`lib/workflow-service.ts`
- **工作流页面**：`components/pages/DailyWorkflow.tsx`
- **提示弹窗**：`components/layout/WorkflowPromptModal.tsx`
- **主应用**：`App.tsx`（集成点）

## 总结

每日工作流系统提供了一个完整的任务管理和追踪解决方案，包括：
- ✅ 多步骤任务追踪
- ✅ 实时进度更新
- ✅ 90天热力图统计
- ✅ 纸屑庆祝动画
- ✅ 登录后自动提示
- ✅ 快捷访问入口
- ✅ 响应式设计
- ✅ 完整的数据隔离和安全性

系统已无缝集成到现有的 FluxFilter 应用中，无需额外配置即可使用。
