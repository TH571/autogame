/**
 * 数据库适配层
 * 统一 SQLite 和 PostgreSQL 的 API
 */

const { getDb } = require('./db');

// 检查是否为 Vercel 环境
const isVercel = process.env.VERCEL === '1';

// 转换 PostgreSQL 结果为 SQLite 格式
function convertPostgresResult(rows, isSingle = false) {
  if (!rows || rows.length === 0) {
    return isSingle ? null : [];
  }

  // PostgreSQL 返回的是对象数组，需要转换布尔值和序列号
  const converted = rows.map(row => {
    const convertedRow = {};
    for (const key in row) {
      let value = row[key];
      // 转换布尔值
      if (typeof value === 'boolean') {
        convertedRow[key] = value ? 1 : 0;
      } else if (value instanceof Date) {
        convertedRow[key] = value.toISOString().replace('T', ' ').substring(0, 19);
      } else {
        convertedRow[key] = value;
      }
    }
    return convertedRow;
  });

  return isSingle ? converted[0] : converted;
}

// 数据库操作类
class DatabaseAdapter {
  constructor() {
    this.db = null;
    this.client = null;
    // 同步获取 SQLite 连接（非 Vercel 环境）
    if (!isVercel) {
      const Database = require('better-sqlite3');
      const path = require('path');
      const fs = require('fs');

      const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
      const dataDir = path.dirname(dbPath);

      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Database(dbPath);
      this.db.pragma('foreign_keys = ON');
    }
  }

  // 执行查询（返回多行）
  async all(sql, params = []) {
    if (isVercel) {
      if (!this.client) {
        this.client = await getDb();
      }
      // 将 ? 占位符转换为 $1, $2, ...
      let paramIndex = 1;
      const formattedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await this.client.query(formattedSql, params);
      return convertPostgresResult(result.rows);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // 执行查询（返回单行）
  async get(sql, params = []) {
    if (isVercel) {
      if (!this.client) {
        this.client = await getDb();
      }
      // 将 ? 占位符转换为 $1, $2, ...
      let paramIndex = 1;
      const formattedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
      const result = await this.client.query(formattedSql, params);
      return convertPostgresResult(result.rows, true);
    }

    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  // 执行插入/更新/删除
  async run(sql, params = []) {
    if (isVercel) {
      if (!this.client) {
        this.client = await getDb();
      }
      // 将 ? 占位符转换为 $1, $2, ...
      let paramIndex = 1;
      let formattedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

      // PostgreSQL 语法转换
      // INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
      // INSERT OR REPLACE -> INSERT ... ON CONFLICT DO UPDATE SET ...
      formattedSql = formattedSql.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT');
      formattedSql = formattedSql.replace(/INSERT\s+OR\s+REPLACE/gi, 'INSERT');
      
      // 对于 INSERT，添加 RETURNING id 来获取插入的 ID
      let finalSql = formattedSql;
      let isInsert = formattedSql.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !formattedSql.toUpperCase().includes('RETURNING') && !formattedSql.toUpperCase().includes('ON CONFLICT')) {
        // 检查是否是 INSERT OR REPLACE 转换后的语句
        if (formattedSql.toUpperCase().includes('AVAILABILITY') && formattedSql.toUpperCase().includes('USER_ID') && formattedSql.toUpperCase().includes('DATE')) {
          // availability 表有 UNIQUE(user_id, date, time_slot) 约束
          finalSql = formattedSql.replace(/VALUES\s*\([^)]+\)/i, (match) => `${match} ON CONFLICT (user_id, date, time_slot) DO UPDATE SET updated_at = CURRENT_TIMESTAMP, last_modified = CURRENT_TIMESTAMP, activity_code = EXCLUDED.activity_code`);
        } else if (formattedSql.toUpperCase().includes('ON CONFLICT')) {
          finalSql = formattedSql;
        } else {
          finalSql = formattedSql.replace(/;?\s*$/, ' RETURNING id');
        }
      } else if (formattedSql.toUpperCase().includes('ON CONFLICT')) {
        finalSql = formattedSql;
      }

      const result = await this.client.query(finalSql, params);
      return {
        lastInsertRowid: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : null,
        changes: result.rowCount
      };
    }

    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  // 执行事务
  transaction(callback) {
    if (isVercel) {
      // PostgreSQL 事务（简化处理）
      return async (...args) => {
        await callback(...args);
      };
    }

    // SQLite 事务
    return this.db.transaction(callback);
  }
}

module.exports = DatabaseAdapter;
