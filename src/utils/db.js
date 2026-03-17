const { createClient } = require('@vercel/postgres');

// 检查是否为 Vercel 环境
const isVercel = process.env.VERCEL === '1';

let client = null;
let sqliteDb = null;

// 获取数据库连接
async function getDb() {
  if (isVercel) {
    // Vercel Postgres - 使用 createClient 和 NON_POOLING 连接字符串
    if (!client) {
      client = createClient({
        connectionString: process.env.POSTGRES_URL_NON_POOLING
      });
      await client.connect();
      console.log('[DB] Vercel Postgres 已连接');
    }
    return client;
  } else {
    // 本地 SQLite（开发环境）
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (!sqliteDb) {
      sqliteDb = new Database(dbPath);
      sqliteDb.pragma('foreign_keys = ON');
    }

    return sqliteDb;
  }
}

// 初始化数据库（创建表）
async function initDatabase() {
  if (isVercel) {
    // Vercel Postgres 初始化
    await initPostgres();
  } else {
    // 本地 SQLite 初始化
    await initSqlite();
  }
}

// 初始化 PostgreSQL
async function initPostgres() {
  try {
    const db = await getDb();
    
    // 创建用户表
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(255),
        role VARCHAR(20) DEFAULT 'user' CHECK(role IN ('super_admin', 'activity_admin', 'user')),
        is_seed BOOLEAN DEFAULT false,
        invite_code VARCHAR(50),
        activity_admin_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建可用性表
    await db.query(`
      CREATE TABLE IF NOT EXISTS availability (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
        activity_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date, time_slot)
      )
    `);

    // 创建活动表
    await db.query(`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time_slot)
      )
    `);

    // 创建活动成员表
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_members (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        notified BOOLEAN DEFAULT false,
        notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_id, user_id)
      )
    `);

    // 创建参与历史表
    await db.query(`
      CREATE TABLE IF NOT EXISTS participation_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, activity_id)
      )
    `);

    // 创建活动代码表
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        min_players INTEGER DEFAULT 4,
        max_players INTEGER DEFAULT 4,
        players_per_game INTEGER DEFAULT 4,
        require_seed BOOLEAN DEFAULT true,
        seed_required BOOLEAN DEFAULT true
      )
    `);

    // 创建活动代码用户关联表
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_code_users (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )
    `);

    // 创建活动代码种子选手关联表
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_code_seeds (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )
    `);

    // 创建管理员邀请码表
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_invite_codes (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(50) UNIQUE NOT NULL,
        is_used BOOLEAN DEFAULT false,
        used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await db.query(`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`);

    console.log('✓ Vercel Postgres 数据库初始化完成');

    // 创建默认用户
    await createDefaultUsers();

  } catch (error) {
    console.error('Postgres 初始化错误:', error);
    throw error;
  }
}

// 初始化 SQLite（本地开发）
async function initSqlite() {
  const Database = require('better-sqlite3');
  const bcrypt = require('bcryptjs');
  const path = require('path');
  const fs = require('fs');

  const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  // 读取并执行 SQL 文件
  const sqlPath = path.join(__dirname, 'schema.sqlite.sql');
  if (fs.existsSync(sqlPath)) {
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    db.exec(sqlContent);
  }

  console.log('✓ SQLite 数据库初始化完成');

  // 创建默认用户
  await createDefaultUsersSqlite(db, bcrypt);

  return db;
}

// 创建默认用户（Postgres）
async function createDefaultUsers() {
  const bcrypt = require('bcryptjs');
  const db = await getDb();

  // 检查超级管理员
  const superAdminCheck = await db.query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
  if (superAdminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();

    await db.query(`
      INSERT INTO users (email, password, name, role, invite_code)
      VALUES ($1, $2, $3, $4, $5)
    `, [process.env.ADMIN_EMAIL || 'admin@autogame.com', hashedPassword, '铁', 'super_admin', inviteCode]);

    await db.query(`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (currval('users_id_seq'), $1, false)
    `, [inviteCode]);

    console.log('✓ 超级管理员账户已创建');
  }

  // 检查活动管理员
  const activityAdminCheck = await db.query(`SELECT id FROM users WHERE role = 'activity_admin' LIMIT 1`);
  if (activityAdminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    const inviteCode = 'ADMIN' + Date.now().toString(36).toUpperCase();

    await db.query(`
      INSERT INTO users (email, password, name, role, is_seed, invite_code)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['seed@autogame.com', hashedPassword, '蚊子', 'activity_admin', true, inviteCode]);

    await db.query(`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (currval('users_id_seq'), $1, false)
    `, [inviteCode]);

    console.log('✓ 活动管理员账户已创建');
  }
}

// 创建默认用户（SQLite）
async function createDefaultUsersSqlite(db, bcrypt) {
  // 检查超级管理员
  const superAdminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('super_admin');
  if (superAdminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();
    
    const result = db.prepare(`
      INSERT INTO users (email, password, name, role, invite_code)
      VALUES (?, ?, ?, ?, ?)
    `).run(process.env.ADMIN_EMAIL || 'admin@autogame.com', hashedPassword, '铁', 'super_admin', inviteCode);
    
    db.prepare(`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (?, ?, 0)
    `).run(result.lastInsertRowid, inviteCode);
    
    console.log('✓ 超级管理员账户已创建');
  }

  // 检查活动管理员
  const activityAdminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('activity_admin');
  if (activityAdminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    const inviteCode = 'ADMIN' + Date.now().toString(36).toUpperCase();
    
    const result = db.prepare(`
      INSERT INTO users (email, password, name, role, is_seed, invite_code)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run('seed@autogame.com', hashedPassword, '蚊子', 'activity_admin', inviteCode);
    
    db.prepare(`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (?, ?, 0)
    `).run(result.lastInsertRowid, inviteCode);
    
    console.log('✓ 活动管理员账户已创建');
  }
}

module.exports = { getDb, initDatabase, isVercel };
