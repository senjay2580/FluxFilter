-- ============================================
-- 每日工作流系统
-- 支持多步骤任务追踪、完成情况统计、热力图展示
-- ============================================

-- 1. 工作流节点定义表（系统级，不变）
CREATE TABLE IF NOT EXISTS workflow_node (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,    -- 节点代码: daily_info, dev_hotspot, video_collection, notes
    name VARCHAR(100) NOT NULL,          -- 节点名称
    description TEXT,                    -- 节点描述
    icon VARCHAR(50),                    -- 图标名称
    order_index INTEGER NOT NULL,        -- 显示顺序
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 每日工作流进度表（用户级，按日期隔离）
CREATE TABLE IF NOT EXISTS daily_workflow (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID
    workflow_date DATE NOT NULL,         -- 工作流日期（按天隔离）
    is_completed BOOLEAN DEFAULT false,  -- 是否全部完成
    completed_at TIMESTAMPTZ,            -- 完成时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_daily_workflow_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户同一天只有一条记录
    CONSTRAINT unique_user_workflow_date UNIQUE (user_id, workflow_date)
);

-- 3. 工作流节点完成情况表（用户级，记录每个节点的完成状态）
CREATE TABLE IF NOT EXISTS workflow_node_progress (
    id BIGSERIAL PRIMARY KEY,
    daily_workflow_id BIGINT NOT NULL,   -- 关联的每日工作流
    node_id INTEGER NOT NULL,            -- 节点ID
    is_completed BOOLEAN DEFAULT false,  -- 是否完成
    completed_at TIMESTAMPTZ,            -- 完成时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联
    CONSTRAINT fk_node_progress_workflow FOREIGN KEY (daily_workflow_id) REFERENCES daily_workflow(id) ON DELETE CASCADE,
    CONSTRAINT fk_node_progress_node FOREIGN KEY (node_id) REFERENCES workflow_node(id) ON DELETE CASCADE,
    -- 同一工作流下每个节点只有一条记录
    CONSTRAINT unique_workflow_node UNIQUE (daily_workflow_id, node_id)
);

-- 4. 工作流完成历史表（用于热力图统计）
CREATE TABLE IF NOT EXISTS workflow_completion_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID
    completion_date DATE NOT NULL,       -- 完成日期
    completed_nodes INTEGER DEFAULT 0,   -- 完成的节点数
    total_nodes INTEGER DEFAULT 0,       -- 总节点数
    completion_rate NUMERIC(5, 2) DEFAULT 0, -- 完成率 (0-100)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_completion_history_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户同一天只有一条记录
    CONSTRAINT unique_user_completion_date UNIQUE (user_id, completion_date)
);

-- ============================================
-- 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_daily_workflow_user_date 
ON daily_workflow(user_id, workflow_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_workflow_completed 
ON daily_workflow(user_id, is_completed, workflow_date DESC);

CREATE INDEX IF NOT EXISTS idx_node_progress_workflow 
ON workflow_node_progress(daily_workflow_id);

CREATE INDEX IF NOT EXISTS idx_node_progress_completed 
ON workflow_node_progress(daily_workflow_id, is_completed);

CREATE INDEX IF NOT EXISTS idx_completion_history_user_date 
ON workflow_completion_history(user_id, completion_date DESC);

CREATE INDEX IF NOT EXISTS idx_completion_history_rate 
ON workflow_completion_history(user_id, completion_rate DESC);

-- ============================================
-- RLS 策略
-- ============================================
ALTER TABLE workflow_node ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_node_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_completion_history ENABLE ROW LEVEL SECURITY;

-- workflow_node 允许所有用户读取（系统级数据）
CREATE POLICY "Allow read workflow_node" ON workflow_node FOR SELECT USING (true);

-- 其他表按 user_id 隔离
CREATE POLICY "Allow all daily_workflow" ON daily_workflow FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all node_progress" ON workflow_node_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all completion_history" ON workflow_completion_history FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 触发器：自动更新 updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_daily_workflow_updated_at ON daily_workflow;
CREATE TRIGGER update_daily_workflow_updated_at
    BEFORE UPDATE ON daily_workflow
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_node_progress_updated_at ON workflow_node_progress;
CREATE TRIGGER update_node_progress_updated_at
    BEFORE UPDATE ON workflow_node_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 初始化工作流节点数据
-- ============================================
INSERT INTO workflow_node (code, name, description, icon, order_index) VALUES
    ('daily_info', '每日信息差', '浏览今日热点资讯和信息差', 'newspaper', 1),
    ('dev_hotspot', '开发者热点', '关注开发者社区热点话题', 'trending', 2),
    ('video_collection', '视频/收藏夹', '整理和收藏相关视频', 'video', 3),
    ('notes', '笔记', '记录学习笔记和心得', 'note', 4)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 函数：获取或创建今日工作流
-- ============================================
CREATE OR REPLACE FUNCTION get_or_create_daily_workflow(
    p_user_id UUID,
    p_workflow_date DATE DEFAULT CURRENT_DATE
) RETURNS BIGINT AS $$
DECLARE
    v_workflow_id BIGINT;
    v_node_count INTEGER;
    v_node_id INTEGER;
BEGIN
    -- 尝试获取现有工作流
    SELECT id INTO v_workflow_id
    FROM daily_workflow
    WHERE user_id = p_user_id AND workflow_date = p_workflow_date;
    
    -- 如果不存在，创建新的
    IF v_workflow_id IS NULL THEN
        INSERT INTO daily_workflow (user_id, workflow_date)
        VALUES (p_user_id, p_workflow_date)
        RETURNING id INTO v_workflow_id;
        
        -- 为所有节点创建进度记录
        FOR v_node_id IN SELECT id FROM workflow_node ORDER BY order_index LOOP
            INSERT INTO workflow_node_progress (daily_workflow_id, node_id, is_completed)
            VALUES (v_workflow_id, v_node_id, false);
        END LOOP;
    END IF;
    
    RETURN v_workflow_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：标记节点完成
-- ============================================
CREATE OR REPLACE FUNCTION mark_node_completed(
    p_daily_workflow_id BIGINT,
    p_node_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    v_completed_count INTEGER;
    v_total_count INTEGER;
    v_user_id UUID;
    v_workflow_date DATE;
BEGIN
    -- 更新节点完成状态
    UPDATE workflow_node_progress
    SET is_completed = true, completed_at = NOW()
    WHERE daily_workflow_id = p_daily_workflow_id AND node_id = p_node_id;
    
    -- 检查是否所有节点都完成
    SELECT COUNT(*) INTO v_completed_count
    FROM workflow_node_progress
    WHERE daily_workflow_id = p_daily_workflow_id AND is_completed = true;
    
    SELECT COUNT(*) INTO v_total_count
    FROM workflow_node;
    
    -- 如果所有节点都完成，更新工作流状态
    IF v_completed_count = v_total_count THEN
        UPDATE daily_workflow
        SET is_completed = true, completed_at = NOW()
        WHERE id = p_daily_workflow_id;
        
        -- 更新完成历史
        SELECT user_id, workflow_date INTO v_user_id, v_workflow_date
        FROM daily_workflow
        WHERE id = p_daily_workflow_id;
        
        INSERT INTO workflow_completion_history (user_id, completion_date, completed_nodes, total_nodes, completion_rate)
        VALUES (v_user_id, v_workflow_date, v_total_count, v_total_count, 100)
        ON CONFLICT (user_id, completion_date) DO UPDATE SET
            completed_nodes = v_total_count,
            completion_rate = 100;
        
        RETURN true;
    ELSE
        -- 更新完成历史（部分完成）
        SELECT user_id, workflow_date INTO v_user_id, v_workflow_date
        FROM daily_workflow
        WHERE id = p_daily_workflow_id;
        
        INSERT INTO workflow_completion_history (user_id, completion_date, completed_nodes, total_nodes, completion_rate)
        VALUES (v_user_id, v_workflow_date, v_completed_count, v_total_count, ROUND((v_completed_count::NUMERIC / v_total_count) * 100, 2))
        ON CONFLICT (user_id, completion_date) DO UPDATE SET
            completed_nodes = v_completed_count,
            completion_rate = ROUND((v_completed_count::NUMERIC / v_total_count) * 100, 2);
        
        RETURN false;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：获取用户工作流统计（用于热力图）
-- ============================================
CREATE OR REPLACE FUNCTION get_workflow_stats(
    p_user_id UUID,
    p_days INTEGER DEFAULT 90
) RETURNS TABLE (
    completion_date DATE,
    completed_nodes INTEGER,
    total_nodes INTEGER,
    completion_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        wch.completion_date,
        wch.completed_nodes,
        wch.total_nodes,
        wch.completion_rate
    FROM workflow_completion_history wch
    WHERE wch.user_id = p_user_id
        AND wch.completion_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    ORDER BY wch.completion_date DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 表注释
-- ============================================
COMMENT ON TABLE workflow_node IS '工作流节点定义表：系统级，定义所有可用的工作流节点';
COMMENT ON TABLE daily_workflow IS '每日工作流进度表：用户级，记录每天的工作流完成情况';
COMMENT ON TABLE workflow_node_progress IS '工作流节点完成情况表：记录每个节点的完成状态';
COMMENT ON TABLE workflow_completion_history IS '工作流完成历史表：用于热力图统计和数据分析';

COMMENT ON COLUMN workflow_node.code IS '节点代码：daily_info, dev_hotspot, video_collection, notes';
COMMENT ON COLUMN daily_workflow.workflow_date IS '工作流日期，用于按天隔离数据';
COMMENT ON COLUMN workflow_completion_history.completion_rate IS '完成率百分比（0-100）';
