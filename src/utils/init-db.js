/**
 * 数据库初始化
 * 支持 SQLite 和 Vercel Postgres
 */

const db = require('./database');
const bcrypt = require('bcryptjs');

// 初始化数据库表结构
async function initDatabase() {
  if (db.isVercel) {
    // Vercel Postgres 环境，表应该已经通过迁移脚本创建
    console.log('✓ Vercel Postgres 环境已就绪');
  } else {
    // 本地 SQLite 环境
    const conn = await db.getDb();
    const sqliteDb = conn.db;
    
    // 创建所有表
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(255),
        role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('super_admin', 'activity_admin', 'user')),
        is_seed INTEGER DEFAULT 0,
        invite_code VARCHAR(50),
        activity_admin_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_admin_id) REFERENCES users(id)
      )
    `);
    
    sqliteDb.exec(`
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
        UNIQUE(user_id, date, time_slot)
      )
    `);
    
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time_slot)
      )
    `);
    
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS activity_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        notified INTEGER DEFAULT 0,
        notified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(activity_id, user_id)
      )
    `);
    
    sqliteDb.exec(`
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
    
    sqliteDb.exec(`
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
        require_seed INTEGER DEFAULT 1,
        seed_required INTEGER DEFAULT 1,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    
    sqliteDb.exec(`
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
    
    sqliteDb.exec(`
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
    
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS admin_invite_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        is_used INTEGER DEFAULT 0,
        used_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    
    // 创建索引
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`);
    sqliteDb.exec(`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`);
    
    console.log('✓ SQLite 数据库初始化完成');
  }
  
  // 创建默认用户（两种环境都执行）
  await createDefaultUsers();
}

async function createDefaultUsers() {
  const User = require('../models/User');
  
  // 检查超级管理员
  let superAdmin = await User.findByEmail('admin@autogame.com');
  if (!superAdmin) {
    const hashedPassword = bcrypt.hashSync('admin123456', 10);
    
    const userId = await User.create('admin@autogame.com', hashedPassword, '铁', 'super_admin');
    await User.generateInviteCode(userId);
    
    console.log('✓ 超级管理员账户已创建');
  }

  // 检查活动管理员
  let activityAdmin = await User.findByEmail('seed@autogame.com');
  if (!activityAdmin) {
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    
    const userId = await User.create('seed@autogame.com', hashedPassword, '蚊子', 'activity_admin');
    await User.update(userId, { is_seed: 1 });
    await User.generateInviteCode(userId);
    
    console.log('✓ 活动管理员账户已创建');
  }
}

module.exports = { initDatabase, createDefaultUsers };
