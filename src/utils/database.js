/**
 * 统一数据库模块
 * 支持 SQLite（本地开发）和 PostgreSQL（Vercel 生产环境）
 */

// 检查是否为 Vercel 环境
const isVercel = process.env.VERCEL === '1' || process.env.POSTGRES_URL;

let sqliteDb = null;
let usePostgres = isVercel;

// 获取数据库连接
function getDb() {
  if (usePostgres) {
    return null; // PostgreSQL 使用 sql 对象直接查询
  }
  
  if (!sqliteDb) {
    const Database = require('better-sqlite3');
    const path = require('path');
    const fs = require('fs');

    const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
    const dataDir = path.dirname(dbPath);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    sqliteDb = new Database(dbPath);
    sqliteDb.pragma('foreign_keys = ON');
    sqliteDb.pragma('encoding = "UTF-8"');
  }
  
  return sqliteDb;
}

// 执行 SQL 查询（PostgreSQL）
async function query(sql, params = []) {
  if (!usePostgres) {
    const db = getDb();
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params);
    } else {
      return stmt.run(...params);
    }
  }
  
  const { sql: postgresSql } = require('@vercel/postgres');
  const formattedSql = sql.replace(/\?/g, () => {
    const param = params.shift();
    return typeof param === 'string' ? `'${param}'` : param;
  });
  return postgresSql.query(formattedSql);
}

// 初始化数据库（创建表）
async function initDatabase() {
  if (usePostgres) {
    await initPostgres();
  } else {
    initSqlite();
  }
}

// 初始化 PostgreSQL
async function initPostgres() {
  const { sql } = require('@vercel/postgres');
  const bcrypt = require('bcryptjs');

  try {
    // 创建用户表
    await sql`
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
    `;

    // 创建可用性表
    await sql`
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
    `;

    // 创建活动表
    await sql`
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL CHECK(time_slot IN (1, 2, 3)),
        status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time_slot)
      )
    `;

    // 创建活动成员表
    await sql`
      CREATE TABLE IF NOT EXISTS activity_members (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        notified BOOLEAN DEFAULT false,
        notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_id, user_id)
      )
    `;

    // 创建参与历史表
    await sql`
      CREATE TABLE IF NOT EXISTS participation_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, activity_id)
      )
    `;

    // 创建活动代码表
    await sql`
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
    `;

    // 创建活动代码用户关联表
    await sql`
      CREATE TABLE IF NOT EXISTS activity_code_users (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )
    `;

    // 创建活动代码种子选手关联表
    await sql`
      CREATE TABLE IF NOT EXISTS activity_code_seeds (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )
    `;

    // 创建管理员邀请码表
    await sql`
      CREATE TABLE IF NOT EXISTS admin_invite_codes (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(50) UNIQUE NOT NULL,
        is_used BOOLEAN DEFAULT false,
        used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 创建索引
    await sql`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_code_users ON activity_code_users(activity_code_id, user_id)`;

    console.log('✓ Vercel Postgres 数据库初始化完成');

    // 创建默认用户
    await createDefaultUsersPostgres(sql, bcrypt);

  } catch (error) {
    console.error('Postgres 初始化错误:', error);
    throw error;
  }
}

// 初始化 SQLite
function initSqlite() {
  const db = getDb();
  const bcrypt = require('bcryptjs');

  // 用户表
  db.exec(`
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
    )
  `);

  // 可用性表
  db.exec(`
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

  // 参与历史表
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

  // 活动代码表
  db.exec(`
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
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // 活动代码用户关联表
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

  // 活动代码种子选手关联表
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

  // 管理员邀请码表
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

  // 创建索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_date_slot ON availability(date, time_slot)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_availability_last_modified ON availability(last_modified)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_participation_user ON participation_history(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_code_users ON activity_code_users(activity_code_id, user_id)`);

  console.log('✓ SQLite 数据库初始化完成');
  console.log(`✓ 数据库路径：${process.env.DATABASE_PATH || './data/autogame.db'}`);

  // 创建默认用户
  createDefaultUsersSqlite(db, bcrypt);
}

// 创建默认用户（Postgres）
async function createDefaultUsersPostgres(sql, bcrypt) {
  // 检查超级管理员
  const superAdminCheck = await sql`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`;
  if (superAdminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123456', 10);
    const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();

    await sql`
      INSERT INTO users (email, password, name, role, invite_code)
      VALUES (${process.env.ADMIN_EMAIL || 'admin@autogame.com'}, ${hashedPassword}, '铁', 'super_admin', ${inviteCode})
    `;

    await sql`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (currval('users_id_seq'), ${inviteCode}, false)
    `;

    console.log('✓ 超级管理员账户已创建 (admin@autogame.com / admin123456)');
    console.log(`✓ 超级管理员邀请码：${inviteCode}`);
  }

  // 检查活动管理员
  const activityAdminCheck = await sql`SELECT id FROM users WHERE role = 'activity_admin' LIMIT 1`;
  if (activityAdminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync('seed123456', 10);
    const inviteCode = 'ADMIN' + Date.now().toString(36).toUpperCase();

    await sql`
      INSERT INTO users (email, password, name, role, is_seed, invite_code)
      VALUES ('seed@autogame.com', ${hashedPassword}, '蚊子', 'activity_admin', true, ${inviteCode})
    `;

    await sql`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (currval('users_id_seq'), ${inviteCode}, false)
    `;

    console.log('✓ 活动管理员账户已创建 (seed@autogame.com / seed123456)');
    console.log(`✓ 活动管理员邀请码：${inviteCode}`);
  }
}

// 创建默认用户（SQLite）
function createDefaultUsersSqlite(db, bcrypt) {
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

    console.log('✓ 超级管理员账户已创建 (admin@autogame.com / admin123456)');
    console.log(`✓ 超级管理员邀请码：${inviteCode}`);
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

    console.log('✓ 活动管理员账户已创建 (seed@autogame.com / seed123456)');
    console.log(`✓ 活动管理员邀请码：${inviteCode}`);
  }
}

// 辅助函数：Postgres 查询包装器
async function postgresQuery(sqlText, params = []) {
  const { sql } = require('@vercel/postgres');
  
  // 将 ? 占位符转换为 $1, $2, ...
  let paramIndex = 1;
  const formattedSql = sqlText.replace(/\?/g, () => `$${paramIndex++}`);
  
  return sql.unsafe(formattedSql, params);
}

module.exports = { 
  getDb, 
  initDatabase, 
  isVercel,
  usePostgres,
  query,
  postgresQuery
};
