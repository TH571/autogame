-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(255),
  role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('super_admin', 'activity_admin', 'user')),
  is_seed BOOLEAN DEFAULT 0,
  invite_code VARCHAR(50),
  activity_admin_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_admin_id) REFERENCES users(id)
);

-- 可用性表
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,
  time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
  activity_code VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_code) REFERENCES activity_codes(code) ON DELETE CASCADE,
  UNIQUE(user_id, date, time_slot)
);

-- 活动表
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, time_slot)
);

-- 活动成员表
CREATE TABLE IF NOT EXISTS activity_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  notified BOOLEAN DEFAULT 0,
  notified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(activity_id, user_id)
);

-- 参与历史表
CREATE TABLE IF NOT EXISTS participation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  activity_id INTEGER NOT NULL,
  date DATE NOT NULL,
  time_slot INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
  UNIQUE(user_id, activity_id)
);

-- 活动代码表
CREATE TABLE IF NOT EXISTS activity_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  min_players INTEGER DEFAULT 4,
  max_players INTEGER DEFAULT 4,
  players_per_game INTEGER DEFAULT 4,
  require_seed BOOLEAN DEFAULT 1,
  seed_required BOOLEAN DEFAULT 1,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

-- 活动代码用户关联表
CREATE TABLE IF NOT EXISTS activity_code_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_code_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_code_id) REFERENCES activity_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(activity_code_id, user_id)
);

-- 活动代码种子选手关联表
CREATE TABLE IF NOT EXISTS activity_code_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_code_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (activity_code_id) REFERENCES activity_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(activity_code_id, user_id)
);

-- 管理员邀请码表
CREATE TABLE IF NOT EXISTS admin_invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  is_used BOOLEAN DEFAULT 0,
  used_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 活动邀请码表（新增）
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

-- 索引
CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date);
CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code);
CREATE INDEX IF NOT EXISTS idx_availability_date_slot ON availability(date, time_slot);
CREATE INDEX IF NOT EXISTS idx_availability_last_modified ON availability(last_modified);
CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status);
CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id);
CREATE INDEX IF NOT EXISTS idx_participation_user ON participation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_code_users ON activity_code_users(activity_code_id, user_id);
CREATE INDEX IF NOT EXISTS idx_activity_invites_code ON activity_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_activity_invites_activity_code ON activity_invites(activity_code_id);
