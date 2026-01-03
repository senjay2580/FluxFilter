# 每日工作流系统 - 部署检查清单

## 📋 部署前检查

### 代码文件检查
- [x] `supabase/migrations/create_daily_workflow.sql` - 数据库迁移脚本
- [x] `lib/workflow-service.ts` - 后端服务
- [x] `components/pages/DailyWorkflow.tsx` - 工作流主页面
- [x] `components/layout/WorkflowPromptModal.tsx` - 提示弹窗
- [x] `App.tsx` - 应用集成（已修改）

### 文档文件检查
- [x] `doc/DAILY_WORKFLOW_GUIDE.md` - 完整实现指南
- [x] `doc/WORKFLOW_SETUP.md` - 快速设置指南
- [x] `doc/WORKFLOW_IMPLEMENTATION_SUMMARY.md` - 实现总结
- [x] `doc/WORKFLOW_DEPLOYMENT_CHECKLIST.md` - 本文档

## 🚀 部署步骤

### 第 1 步：数据库迁移

**时间估计**：5 分钟

```bash
# 在 Supabase Dashboard 中执行以下步骤：
# 1. 打开 SQL Editor
# 2. 打开文件：supabase/migrations/create_daily_workflow.sql
# 3. 复制全部内容
# 4. 粘贴到 SQL Editor
# 5. 点击 "Run" 执行
```

**验证**：
```sql
-- 检查表是否创建
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name LIKE 'workflow%';

-- 应该返回 4 个表：
-- - workflow_node
-- - daily_workflow
-- - workflow_node_progress
-- - workflow_completion_history
```

- [ ] 表创建成功
- [ ] 索引创建成功
- [ ] 函数创建成功
- [ ] 初始数据插入成功

### 第 2 步：前端代码部署

**时间估计**：2 分钟

```bash
# 1. 确保所有文件已保存
# 2. 运行构建
npm run build

# 3. 验证构建成功
# 应该没有错误或警告
```

- [ ] 代码编译成功
- [ ] 没有 TypeScript 错误
- [ ] 没有 ESLint 警告

### 第 3 步：本地测试

**时间估计**：10 分钟

```bash
# 启动开发服务器
npm run dev

# 打开浏览器访问 http://localhost:5173
```

**测试场景**：

#### 3.1 工作流创建
- [ ] 登录应用
- [ ] 验证工作流提示弹窗显示
- [ ] 检查提示弹窗中的节点列表正确

#### 3.2 进入工作流页面
- [ ] 点击"进入工作流"按钮
- [ ] 验证工作流页面加载成功
- [ ] 检查 4 个节点卡片显示正确
- [ ] 验证进度条显示为 0%

#### 3.3 标记节点完成
- [ ] 点击第一个节点的"完成"按钮
- [ ] 验证节点卡片变为绿色
- [ ] 检查进度条更新为 25%
- [ ] 验证完成时间显示

#### 3.4 全部完成
- [ ] 依次完成所有 4 个节点
- [ ] 验证纸屑动画播放
- [ ] 检查完成弹窗显示
- [ ] 验证热力图更新

#### 3.5 热力图显示
- [ ] 查看 90 天热力图
- [ ] 验证今天的完成率为 100%
- [ ] 检查颜色编码正确

#### 3.6 快捷访问入口
- [ ] 返回首页
- [ ] 验证快捷访问栏中有工作流按钮
- [ ] 点击工作流按钮进入工作流页面

#### 3.7 响应式设计
- [ ] 在移动设备上测试（使用浏览器开发者工具）
- [ ] 验证布局正确
- [ ] 检查按钮可点击
- [ ] 验证文本可读

### 第 4 步：生产部署

**时间估计**：5 分钟

```bash
# 1. 提交代码
git add .
git commit -m "feat(workflow): add daily workflow system"

# 2. 推送到远程仓库
git push origin main

# 3. 部署到 Vercel（如果使用 Vercel）
# 自动部署或手动触发部署

# 4. 验证生产环境
# 访问生产 URL 进行测试
```

- [ ] 代码提交成功
- [ ] 部署完成
- [ ] 生产环境可访问
- [ ] 功能正常工作

## ✅ 功能验证清单

### 核心功能
- [ ] 工作流自动创建
- [ ] 节点完成标记
- [ ] 进度实时更新
- [ ] 热力图数据正确
- [ ] 纸屑动画播放
- [ ] 完成弹窗显示

### 用户体验
- [ ] 登录后自动显示提示
- [ ] 提示弹窗可关闭
- [ ] 快捷访问入口可用
- [ ] 页面加载流畅
- [ ] 动画平滑
- [ ] 响应式设计正常

### 数据完整性
- [ ] 用户数据隔离正确
- [ ] 日期隔离正确
- [ ] 完成历史记录正确
- [ ] 热力图数据准确

### 性能指标
- [ ] 首屏加载 < 2s
- [ ] 交互响应 < 100ms
- [ ] 热力图渲染 < 500ms
- [ ] 动画帧率 60fps

## 🔍 故障排除

### 问题 1：数据库迁移失败

**症状**：SQL 执行出错

**解决步骤**：
1. 检查 SQL 语法是否正确
2. 确保 Supabase 连接正常
3. 检查是否有权限执行 DDL 操作
4. 查看错误日志获取详细信息

**验证**：
```sql
-- 检查表是否存在
SELECT * FROM workflow_node;
```

- [ ] 问题已解决

### 问题 2：前端编译错误

**症状**：`npm run build` 失败

**解决步骤**：
1. 检查 TypeScript 类型错误
2. 运行 `npm run lint` 检查代码风格
3. 清除 node_modules 和 dist 目录
4. 重新安装依赖

```bash
rm -rf node_modules dist
npm install
npm run build
```

- [ ] 问题已解决

### 问题 3：工作流提示不显示

**症状**：登录后没有看到提示弹窗

**解决步骤**：
1. 检查浏览器控制台是否有错误
2. 验证 `workflowPromptShownToday` 状态
3. 检查 `handleLoginSuccess` 是否被调用
4. 清除浏览器缓存

- [ ] 问题已解决

### 问题 4：热力图数据为空

**症状**：热力图显示为空

**解决步骤**：
1. 检查 `workflow_completion_history` 表是否有数据
2. 验证日期范围是否正确
3. 检查用户 ID 是否正确
4. 运行以下查询验证数据

```sql
SELECT * FROM workflow_completion_history 
WHERE user_id = 'your-user-id'::uuid
ORDER BY completion_date DESC;
```

- [ ] 问题已解决

### 问题 5：纸屑动画不显示

**症状**：完成所有节点后没有看到动画

**解决步骤**：
1. 检查浏览器是否支持 CSS 动画
2. 检查浏览器控制台是否有错误
3. 验证 `showCompletion` 状态是否为 true
4. 检查 z-index 是否正确

- [ ] 问题已解决

## 📊 部署后监控

### 第一周
- [ ] 监控错误日志
- [ ] 检查用户反馈
- [ ] 验证数据准确性
- [ ] 监控性能指标

### 第一个月
- [ ] 收集用户使用数据
- [ ] 分析完成率趋势
- [ ] 优化 UI/UX
- [ ] 修复发现的 bug

### 持续维护
- [ ] 定期备份数据
- [ ] 监控数据库性能
- [ ] 更新文档
- [ ] 收集用户反馈

## 📝 部署记录

| 日期 | 环境 | 状态 | 备注 |
|------|------|------|------|
| | 开发 | | |
| | 测试 | | |
| | 生产 | | |

## 🎯 后续计划

### 立即执行（第 1 周）
- [ ] 收集用户反馈
- [ ] 修复发现的 bug
- [ ] 优化性能

### 短期计划（第 2-4 周）
- [ ] 添加更多节点
- [ ] 自定义节点图标
- [ ] 添加节点完成指南

### 中期计划（第 1-2 个月）
- [ ] 集成通知系统
- [ ] 添加用户排行榜
- [ ] 支持导出报告

### 长期计划（第 2-3 个月）
- [ ] AI 推荐功能
- [ ] 个性化工作流
- [ ] 团队协作

## 📞 支持联系

如有问题，请参考：
- 完整指南：`doc/DAILY_WORKFLOW_GUIDE.md`
- 快速设置：`doc/WORKFLOW_SETUP.md`
- 实现总结：`doc/WORKFLOW_IMPLEMENTATION_SUMMARY.md`

## ✨ 部署完成

当所有检查项都完成后，部署即完成！

**部署完成时间**：_____________
**部署人员**：_____________
**验证人员**：_____________

---

**祝贺！每日工作流系统已成功部署！** 🎉
