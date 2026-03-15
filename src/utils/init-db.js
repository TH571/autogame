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
      role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('user', 'admin', 'seed')),
      is_seed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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

  // 检查是否存在管理员账户
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin');
  if (adminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `).run(
      process.env.ADMIN_EMAIL || 'admin@autogame.com',
      hashedPassword,
      '铁',
      'admin'
    );
    console.log('✓ 管理员账户已创建');
  }

  // 检查是否存在种子选手
  const seedCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_seed = 1').get();
  if (seedCount.count === 0) {
    // 创建一个默认种子选手账户
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    db.prepare(`
      INSERT INTO users (email, password, name, role, is_seed)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'seed@autogame.com',
      hashedPassword,
      '蚊子',
      'seed',
      1
    );
    console.log('✓ 种子选手账户已创建 (seed@autogame.com / seed123456)');
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
      FOREIGN KEY (created_by) REFERENCES users(id)
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

  console.log('✓ 数据库初始化完成');
  console.log(`✓ 数据库路径：${process.env.DATABASE_PATH || './data/autogame.db'}`);
}

// 获取数据库实例
function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
