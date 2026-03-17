-- 活动邀请码表 (PostgreSQL)
CREATE TABLE IF NOT EXISTS activity_invites (
  id SERIAL PRIMARY KEY,
  activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
  invite_code VARCHAR(50) UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT 1,
  is_used BOOLEAN DEFAULT false,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_activity_invites_code ON activity_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_activity_invites_activity_code ON activity_invites(activity_code_id);
