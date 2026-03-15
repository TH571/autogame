/**
 * 数据库抽象层
 * 支持 SQLite（本地开发）和 Vercel Postgres（生产环境）
 */

const isVercel = process.env.VERCEL === '1' || process.env.POSTGRES_URL;

let sqliteDb = null;
let pgPool = null;

// 获取数据库连接
async function getDb() {
  if (isVercel) {
    // Vercel Postgres
    if (!pgPool) {
      const { Pool } = require('pg');
      pgPool = new Pool({
        connectionString: process.env.POSTGRES_URL,
        ssl: { rejectUnauthorized: false }
      });
    }
    return { type: 'postgres', pool: pgPool };
  } else {
    // 本地 SQLite
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
    }
    return { type: 'sqlite', db: sqliteDb };
  }
}

// 执行查询（通用）
async function query(sql, params = []) {
  const conn = await getDb();
  
  if (conn.type === 'postgres') {
    const result = await conn.pool.query(sql, params);
    return { rows: result.rows };
  } else {
    const stmt = conn.db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return { rows: stmt.all(...params) };
    } else {
      const result = stmt.run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    }
  }
}

// 获取单行
async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows ? result.rows[0] : null;
}

// 获取所有行
async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows || [];
}

// 执行插入并返回 ID
async function insert(sql, params = []) {
  const conn = await getDb();
  
  if (conn.type === 'postgres') {
    // 对于 Postgres，如果 SQL 没有 RETURNING，添加它
    if (!sql.toUpperCase().includes('RETURNING')) {
      sql = sql.replace(/;$/, ' RETURNING id;');
    }
    const result = await conn.pool.query(sql, params);
    return result.rows[0]?.id || null;
  } else {
    const stmt = conn.db.prepare(sql);
    return stmt.run(...params).lastInsertRowid;
  }
}

// 执行更新/删除
async function execute(sql, params = []) {
  const result = await query(sql, params);
  return result.changes || 0;
}

// 关闭数据库连接
async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
}

module.exports = {
  getDb,
  query,
  queryOne,
  queryAll,
  insert,
  execute,
  closeDb,
  isVercel
};
