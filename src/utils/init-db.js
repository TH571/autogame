const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Vercel Serverless 环境使用 /tmp 目录
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel 
  ? '/tmp/autogame.db' 
  : (process.env.DATABASE_PATH || './data/autogame.db');

// 确保数据目录存在（本地开发）
if (!isVercel) {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 创建数据库表
function initDatabase() {
  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(100) NOT NULL,
      avatar VARCHAR(255),                -- 用户头像 URL
      role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('super_admin', 'activity_admin', 'user')),
      is_seed BOOLEAN DEFAULT 0,
      invite_code VARCHAR(50),              -- 活动管理员的邀请码
      activity_admin_id INTEGER,            -- 关联的活动管理员 ID
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_admin_id) REFERENCES users(id)
    )
  `);

  // 为 users 表添加 avatar 列（旧数据库升级）
  const usersTableInfo = db.pragma('table_info(users)');
  const hasAvatar = usersTableInfo.some(col => col.name === 'avatar');
  if (!hasAvatar) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar VARCHAR(255)`);
    console.log('✓ 已为 users 表添加 avatar 列');
  }

  // 时间申报表 - 记录用户未来 14 天的可用时间
  db.exec(`
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
      -- time_slot: 1=下午，2=晚上，3=下午连晚上
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
      -- last_modified: 记录最后一次修改时间，用于 24 小时后悔期
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, date, time_slot)
    )
  `);

  // 活动表
  db.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
      status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, time_slot)
    )
  `);

  // 活动成员表
  db.exec(`
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
    )
  `);

  // 用户活动参与历史（用于公平分配）
  db.exec(`
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
    )
  `);

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_date_slot ON availability(date, time_slot)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_last_modified ON availability(last_modified)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_participation_user ON participation_history(user_id)`);

  // 检查是否需要添加 last_modified 列（旧数据库升级）
  const tableInfo = db.pragma('table_info(availability)');
  const hasLastModified = tableInfo.some(col => col.name === 'last_modified');
  if (!hasLastModified) {
    db.exec(`ALTER TABLE availability ADD COLUMN last_modified DATETIME DEFAULT CURRENT_TIMESTAMP`);
    console.log('✓ 已添加 last_modified 列');
  }

  // 创建活动代码 - 种子选手关联表（一个活动可以有多个种子选手）
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_code_seeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_code_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_code_id) REFERENCES activity_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(activity_code_id, user_id)
    )
  `);

  // 创建活动代码 - 用户关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_code_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_code_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (activity_code_id) REFERENCES activity_codes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(activity_code_id, user_id)
    )
  `);

  // 活动管理员邀请码表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      is_used BOOLEAN DEFAULT 0,
      used_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 为 admin_invite_codes 表添加使用状态列（旧数据库升级）
  const inviteTableInfo = db.pragma('table_info(admin_invite_codes)');
  const hasIsUsed = inviteTableInfo.some(col => col.name === 'is_used');
  const hasUsedBy = inviteTableInfo.some(col => col.name === 'used_by');
  
  if (!hasIsUsed) db.exec(`ALTER TABLE admin_invite_codes ADD COLUMN is_used DEFAULT 0`);
  if (!hasUsedBy) db.exec(`ALTER TABLE admin_invite_codes ADD COLUMN used_by INTEGER`);
  
  if (!hasIsUsed || !hasUsedBy) {
    console.log('✓ 已为 admin_invite_codes 添加使用状态列');
  }

  // 检查是否存在超级管理员
  const superAdminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('super_admin');
  if (superAdminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    const result = db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(
      process.env.ADMIN_EMAIL || 'admin@autogame.com',
      hashedPassword,
      '铁',
      'super_admin'
    );
    
    // 为超级管理员生成邀请码
    const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();
    db.prepare(`
      INSERT INTO admin_invite_codes (admin_id, code)
      VALUES (?, ?)
    `).run(result.lastInsertRowid, inviteCode);
    
    console.log('✓ 超级管理员账户已创建 (admin@autogame.com / admin123456)');
    console.log(`✓ 超级管理员邀请码：${inviteCode}`);
  }

  // 检查是否存在活动管理员（蚊子）
  const activityAdminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('activity_admin');
  if (activityAdminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    const result = db.prepare(`
      INSERT INTO users (email, password, name, role, is_seed)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'seed@autogame.com',
      hashedPassword,
      '蚊子',
      'activity_admin',
      1
    );
    
    // 为活动管理员生成邀请码
    const inviteCode = 'ADMIN' + Date.now().toString(36).toUpperCase();
    db.prepare(`
      INSERT INTO admin_invite_codes (admin_id, code)
      VALUES (?, ?)
    `).run(result.lastInsertRowid, inviteCode);
    
    console.log('✓ 活动管理员账户已创建 (seed@autogame.com / seed123456)');
    console.log(`✓ 活动管理员邀请码：${inviteCode}`);
  }

  // 升级现有的 admin 角色为 super_admin
  const oldAdminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
  if (oldAdminCount.count > 0) {
    db.prepare(`UPDATE users SET role = 'super_admin' WHERE role = 'admin'`).run();
    console.log('✓ 已升级现有管理员为超级管理员');
  }

  // 创建活动代码表
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      -- 活动规则配置
      min_players INTEGER DEFAULT 4,          -- 最低组局人数
      max_players INTEGER DEFAULT 4,          -- 最高组局人数
      players_per_game INTEGER DEFAULT 4,     -- 每局人数
      require_seed BOOLEAN DEFAULT 1,         -- 是否要求种子选手参与
      seed_required BOOLEAN DEFAULT 1,        -- 种子选手是否强制参与每场
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 为 activity_codes 表添加规则列（旧数据库升级）
  const codeTableInfo = db.pragma('table_info(activity_codes)');
  const hasMinPlayers = codeTableInfo.some(col => col.name === 'min_players');
  const hasMaxPlayers = codeTableInfo.some(col => col.name === 'max_players');
  const hasPlayersPerGame = codeTableInfo.some(col => col.name === 'players_per_game');
  const hasRequireSeed = codeTableInfo.some(col => col.name === 'require_seed');
  const hasSeedRequired = codeTableInfo.some(col => col.name === 'seed_required');
  
  if (!hasMinPlayers) db.exec(`ALTER TABLE activity_codes ADD COLUMN min_players DEFAULT 4`);
  if (!hasMaxPlayers) db.exec(`ALTER TABLE activity_codes ADD COLUMN max_players DEFAULT 4`);
  if (!hasPlayersPerGame) db.exec(`ALTER TABLE activity_codes ADD COLUMN players_per_game DEFAULT 4`);
  if (!hasRequireSeed) db.exec(`ALTER TABLE activity_codes ADD COLUMN require_seed DEFAULT 1`);
  if (!hasSeedRequired) db.exec(`ALTER TABLE activity_codes ADD COLUMN seed_required DEFAULT 1`);
  
  if (!hasMinPlayers || !hasMaxPlayers || !hasPlayersPerGame || !hasRequireSeed || !hasSeedRequired) {
    console.log('✓ 已为 activity_codes 添加规则列');
  }

  // 为 availability 表添加 activity_code 列
  const tableInfo2 = db.pragma('table_info(availability)');
  const hasActivityCode = tableInfo2.some(col => col.name === 'activity_code');
  if (!hasActivityCode) {
    db.exec(`ALTER TABLE availability ADD COLUMN activity_code VARCHAR(50)`);
    console.log('✓ 已添加 activity_code 列');
  }

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_code_users ON activity_code_users(activity_code_id, user_id)`);

  // 创建默认活动代码
  const ActivityCode = require('../models/ActivityCode');
  const User = require('../models/User');
  const defaultCodes = [
    { code: 'BASKETBALL-2024', name: '篮球活动', description: '每周篮球活动' },
    { code: 'BADMTON-2024', name: '羽毛球活动', description: '周末羽毛球活动' }
  ];
  
  for (const ac of defaultCodes) {
    const existing = ActivityCode.getByCode(ac.code);
    if (!existing) {
      const superAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('super_admin');
      ActivityCode.create(ac.code, ac.name, ac.description, superAdmin.id);
      console.log(`✓ 创建活动代码：${ac.code} - ${ac.name}`);
    }
  }

  // 创建默认普通用户
  const defaultUsers = [
    { name: '王强', email: 'wangqiang@example.com', password: '123456', activityCodes: ['BASKETBALL-2024'] },
    { name: '李娜', email: 'lina@example.com', password: '123456', activityCodes: ['BASKETBALL-2024'] },
    { name: '张敏', email: 'zhangmin@example.com', password: '123456', activityCodes: ['BASKETBALL-2024', 'BADMTON-2024'] },
    { name: '刘洋', email: 'liuyang@example.com', password: '123456', activityCodes: ['BADMTON-2024'] },
    { name: '陈静', email: 'chenjing@example.com', password: '123456', activityCodes: ['BADMTON-2024'] }
  ];

  // 为超级管理员和活动管理员也分配所有活动代码
  const superAdminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('super_admin');
  const activityAdminUser = db.prepare('SELECT id FROM users WHERE role = ?').get('activity_admin');
  
  if (superAdminUser) {
    for (const ac of defaultCodes) {
      const activityCode = ActivityCode.getByCode(ac.code);
      if (activityCode) {
        ActivityCode.addUser(activityCode.id, superAdminUser.id);
      }
    }
    console.log('✓ 超级管理员已分配到所有活动代码');
  }
  
  if (activityAdminUser) {
    for (const ac of defaultCodes) {
      const activityCode = ActivityCode.getByCode(ac.code);
      if (activityCode) {
        ActivityCode.addUser(activityCode.id, activityAdminUser.id);
      }
    }
    console.log('✓ 活动管理员已分配到所有活动代码');
  }
  
  for (const u of defaultUsers) {
    const existing = User.findByEmail(u.email);
    if (!existing) {
      const hashedPassword = bcrypt.hashSync(u.password, 10);
      const result = User.create(u.email, hashedPassword, u.name, 'user');
      const userId = result.lastInsertRowid;
      
      // 分配用户到活动代码
      for (const code of u.activityCodes) {
        const activityCode = ActivityCode.getByCode(code);
        if (activityCode) {
          ActivityCode.addUser(activityCode.id, userId);
        }
      }
      
      console.log(`✓ 创建用户：${u.name} (${u.email}) - 活动：${u.activityCodes.join(', ')}`);
    }
  }

  console.log('✓ 数据库初始化完成');
  console.log(`✓ 数据库路径：${process.env.DATABASE_PATH || './data/autogame.db'}`);
}

// 获取数据库实例
function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, isVercel };
