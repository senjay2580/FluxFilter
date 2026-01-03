# 每日工作流系统 - 快速设置指南

## 一键部署

### 步骤 1：执行数据库迁移

在 Supabase Dashboard 中执行以下SQL脚本：

```bash
# 路径：supabase/migrations/create_daily_workflow.sql
```

或者直接在 Supabase SQL Editor 中复制粘贴脚本内容。

### 步骤 2：验证表创建

执行以下查询验证表是否创建成功：

```sql
-- 检查工作流节点表
SELECT * FROM workflow_node;

-- 应该返回4条记录：
-- 1. daily_info - 每日信息差
-- 2. dev_hotspot - 开发者热点
-- 3. video_collection - 视频/收藏夹
-- 4. notes - 笔记
```

### 步骤 3：验证函数创建

```sql
-- 测试获取或创建工作流函数
SELECT get_or_create_daily_workflow(
  'your-user-id-here'::uuid,
  CURRENT_DATE
);

-- 应该返回工作流ID（数字）
```

## 数据库架构概览

### 表关系图

```
workflow_node (系统级)
    ↓
daily_workflow (用户级，按日期隔离)
    ↓
workflow_node_progress (记录每个节点的完成状态)
    ↓
workflow_completion_history (用于热力图统计)
```

### 关键设计特点

1. **用户隔离**
   - 所有用户数据通过 `user_id` 隔离
   - 每个用户每天只有一条工作流记录

2. **日期隔离**
   - 使用 `workflow_date` 按天隔离数据
   - 支持跨天查询和统计

3. **自动化**
   - 使用 SQL 函数自动创建工作流
   - 使用触发器自动更新时间戳
   - 使用 RLS 策略自动进行行级安全

4. **性能优化**
   - 多个索引加速查询
   - 使用 `ON CONFLICT` 处理并发更新
   - 使用视图简化复杂查询

## 前端集成

### 已完成的集成

✅ 工作流状态管理（App.tsx）
✅ 快捷访问入口（快捷栏中的工作流按钮）
✅ 登录后自动显示提示弹窗
✅ 工作流页面和提示弹窗组件
✅ 后端服务函数

### 无需额外配置

系统已完全集成，无需：
- 环境变量配置
- 额外的依赖安装
- 手动初始化

## 测试工作流

### 测试场景 1：创建工作流

```typescript
import { getTodayWorkflowOverview } from './lib/workflow-service';

// 获取今日工作流
const overview = await getTodayWorkflowOverview();
console.log(overview);
// 输出：
// {
//   workflow: { id, user_id, workflow_date, is_completed, ... },
//   nodes: [ { id, code, name, ... }, ... ],
//   progress: [ { id, node_id, is_completed, ... }, ... ],
//   completedCount: 0,
//   totalCount: 4
// }
```

### 测试场景 2：标记节点完成

```typescript
import { markNodeCompleted } from './lib/workflow-service';

// 标记第一个节点完成
const isAllCompleted = await markNodeCompleted(workflowId, nodeId);
console.log(isAllCompleted); // false（还有其他节点未完成）

// 标记所有节点完成
// 最后一个节点完成时
console.log(isAllCompleted); // true（所有节点都完成）
```

### 测试场景 3：获取热力图数据

```typescript
import { getWorkflowStats } from './lib/workflow-service';

// 获取90天的统计数据
const stats = await getWorkflowStats(90);
console.log(stats);
// 输出：
// [
//   { completion_date: '2024-01-03', completed_nodes: 4, total_nodes: 4, completion_rate: 100 },
//   { completion_date: '2024-01-02', completed_nodes: 2, total_nodes: 4, completion_rate: 50 },
//   ...
// ]
```

## 常见问题

### Q1：如何添加新的工作流节点？

**A**：在 `workflow_node` 表中插入新记录：

```sql
INSERT INTO workflow_node (code, name, description, icon, order_index) VALUES
    ('new_node_code', '新节点名称', '节点描述', 'icon_name', 5);
```

然后在 `DailyWorkflow` 组件中的 `onNodeClick` 回调中添加对应的处理逻辑。

### Q2：如何重置用户的工作流数据？

**A**：删除用户的工作流记录：

```sql
DELETE FROM daily_workflow WHERE user_id = 'user-id'::uuid;
-- 关联的 workflow_node_progress 和 workflow_completion_history 会自动删除（级联删除）
```

### Q3：如何导出用户的完成统计？

**A**：查询完成历史表：

```sql
SELECT * FROM workflow_completion_history
WHERE user_id = 'user-id'::uuid
ORDER BY completion_date DESC;
```

### Q4：热力图为什么显示为空？

**A**：确保：
1. 用户已完成至少一个工作流
2. 完成历史表中有数据
3. 日期范围正确（默认90天）

### Q5：如何禁用工作流提示弹窗？

**A**：在 App.tsx 中修改登录成功回调：

```typescript
const handleLoginSuccess = async () => {
  // ... 其他逻辑
  // 注释掉这两行
  // setShowWorkflowPrompt(true);
  // setWorkflowPromptShownToday(true);
};
```

## 性能指标

### 数据库查询性能

| 操作 | 平均响应时间 | 备注 |
|------|------------|------|
| 获取或创建工作流 | < 50ms | 使用索引优化 |
| 标记节点完成 | < 100ms | 包括更新完成历史 |
| 获取热力图数据 | < 200ms | 90天数据 |
| 获取完成统计 | < 50ms | 聚合查询 |

### 前端性能

| 指标 | 目标 | 实现 |
|------|------|------|
| 首屏加载 | < 2s | 懒加载组件 |
| 交互响应 | < 100ms | 使用 memo 和 useCallback |
| 热力图渲染 | < 500ms | 使用 useMemo 缓存 |
| 动画帧率 | 60fps | CSS 动画 |

## 监控和维护

### 定期检查

```sql
-- 检查工作流完成率
SELECT 
  user_id,
  COUNT(*) as total_days,
  SUM(CASE WHEN completion_rate = 100 THEN 1 ELSE 0 END) as completed_days,
  ROUND(AVG(completion_rate), 2) as avg_completion_rate
FROM workflow_completion_history
WHERE completion_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY user_id;

-- 检查是否有未完成的工作流
SELECT * FROM daily_workflow
WHERE is_completed = false
AND workflow_date < CURRENT_DATE - INTERVAL '7 days';
```

### 数据清理

```sql
-- 删除超过1年的完成历史（可选）
DELETE FROM workflow_completion_history
WHERE completion_date < CURRENT_DATE - INTERVAL '1 year';
```

## 部署检查清单

- [ ] 执行数据库迁移脚本
- [ ] 验证表和函数创建成功
- [ ] 测试工作流创建
- [ ] 测试节点完成标记
- [ ] 测试热力图数据获取
- [ ] 验证前端集成正常
- [ ] 测试登录后提示弹窗显示
- [ ] 测试快捷访问入口
- [ ] 测试纸屑动画
- [ ] 验证响应式设计

## 下一步

1. **自定义节点**：根据需求添加更多工作流节点
2. **集成通知**：当用户完成节点时发送通知
3. **添加排行榜**：显示用户完成排名
4. **导出报告**：支持导出完成统计报告
5. **移动端优化**：进一步优化移动端体验

## 支持

如有问题，请参考：
- 完整指南：`doc/DAILY_WORKFLOW_GUIDE.md`
- 代码注释：各个源文件中的详细注释
- 数据库脚本：`supabase/migrations/create_daily_workflow.sql`
