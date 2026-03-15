const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 确保数据目录存在
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(process.env.DATABASE_PATH || './data/autogame.db');

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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_participation_user ON participation_history(user_id)`);

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
      '系统管理员',
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
      '种子选手',
      'seed',
      1
    );
    console.log('✓ 种子选手账户已创建 (seed@autogame.com / seed123456)');
  }

  console.log('✓ 数据库初始化完成');
  console.log(`✓ 数据库路径：${process.env.DATABASE_PATH || './data/autogame.db'}`);
}

// 获取数据库实例
function getDb() {
  return db;
}

module.exports = { initDatabase, getDb };
