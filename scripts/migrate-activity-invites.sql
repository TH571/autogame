-- 活动邀请码表
CREATE TABLE IF NOT EXISTS activity_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_code_id INTEGER NOT NULL,
  invite_code VARCHAR(50) UNIQUE NOT NULL,
  created_by INTEGER NOT NULL,
  max_uses INTEGER DEFAULT 1,
  is_used BOOLEAN DEFAULT 0,
  used_by INTEGER,
  used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_code_id) REFERENCES activity_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_activity_invites_code ON activity_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_activity_invites_activity_code ON activity_invites(activity_code_id);
