/**
 * 数据库适配层
 * 统一 SQLite 和 PostgreSQL 的 API
 */

const { getDb, usePostgres } = require('./database');

// PostgreSQL 查询包装器
async function postgresQuery(sqlText, params = []) {
  const { sql } = require('@vercel/postgres');
  
  // 将 ? 占位符转换为 $1, $2, ...
  let paramIndex = 1;
  const formattedSql = sqlText.replace(/\?/g, () => `$${paramIndex++}`);
  
  return sql.unsafe(formattedSql, params);
}

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

// 将 SQLite SQL 转换为 PostgreSQL SQL
function convertSqliteToPostgres(sql) {
  return sql
    .replace(/INSERT OR IGNORE/g, 'INSERT')
    .replace(/INSERT OR REPLACE/g, 'INSERT')
    .replace(/date\('now'\)/g, 'CURRENT_DATE')
    .replace(/CURRENT_TIMESTAMP/g, 'NOW()')
    .replace(/datetime\('now'\)/g, 'NOW()');
}

// 数据库操作类
class DatabaseAdapter {
  constructor() {
    this.db = null;
    if (!usePostgres) {
      this.db = getDb();
    }
  }

  // 执行查询（返回多行）
  async all(sql, params = []) {
    if (usePostgres) {
      const convertedSql = convertSqliteToPostgres(sql);
      const result = await postgresQuery(convertedSql, params);
      return convertPostgresResult(result.rows);
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  // 执行查询（返回单行）
  async get(sql, params = []) {
    if (usePostgres) {
      const convertedSql = convertSqliteToPostgres(sql);
      const result = await postgresQuery(convertedSql, params);
      return convertPostgresResult(result.rows, true);
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  // 执行插入/更新/删除
  async run(sql, params = []) {
    if (usePostgres) {
      const convertedSql = convertSqliteToPostgres(sql);
      
      // 处理 UNIQUE 冲突
      if (convertedSql.includes('INSERT') && convertedSql.includes('activity_code_users') || 
          convertedSql.includes('activity_code_seeds') ||
          convertedSql.includes('participation_history') ||
          convertedSql.includes('activity_members')) {
        // 对于有 UNIQUE 约束的表，使用 ON CONFLICT DO NOTHING
        const insertMatch = convertedSql.match(/INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/);
        if (insertMatch) {
          const tableName = insertMatch[1];
          const columns = insertMatch[2];
          const values = insertMatch[3];
          const conflictColumns = tableName === 'activity_code_users' || tableName === 'activity_code_seeds' || tableName === 'activity_members'
            ? 'activity_code_id, user_id'
            : tableName === 'participation_history'
            ? 'user_id, activity_id'
            : columns.split(',')[0].trim();
          
          const newSql = `INSERT INTO ${tableName} (${columns}) VALUES (${values}) ON CONFLICT (${conflictColumns}) DO NOTHING`;
          const result = await postgresQuery(newSql, params);
          return {
            lastInsertRowid: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : null,
            changes: result.rowCount
          };
        }
      }
      
      // 处理 REPLACE INTO
      if (convertedSql.includes('INSERT') && convertedSql.includes('availability')) {
        const insertMatch = convertedSql.match(/INSERT INTO (\w+) \(([^)]+)\) VALUES \(([^)]+)\)/);
        if (insertMatch) {
          const tableName = insertMatch[1];
          const columns = insertMatch[2];
          const values = insertMatch[3];
          // 提取列名用于 ON CONFLICT
          const conflictColumns = 'user_id, date, time_slot';
          
          // 将 VALUES 中的值转换为 SET 子句
          const valueParts = values.split(',').map(v => v.trim());
          const columnList = columns.split(',').map(c => c.trim());
          const setClause = columnList.slice(1).map((col, i) => `${col} = EXCLUDED.${col}`).join(', ');
          
          const newSql = `INSERT INTO ${tableName} (${columns}) VALUES (${values}) ON CONFLICT (${conflictColumns}) DO UPDATE SET ${setClause}`;
          const result = await postgresQuery(newSql, params);
          return {
            lastInsertRowid: result.rows && result.rows[0] && result.rows[0].id ? result.rows[0].id : null,
            changes: result.rowCount
          };
        }
      }
      
      const result = await postgresQuery(convertedSql, params);
      let lastInsertRowid = null;
      if (result.command === 'INSERT' && result.rows && result.rows[0] && result.rows[0].id) {
        lastInsertRowid = result.rows[0].id;
      }
      return {
        lastInsertRowid,
        changes: result.rowCount
      };
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  // 执行事务
  transaction(callback) {
    if (usePostgres) {
      // PostgreSQL 事务
      return async (...args) => {
        const { sql } = require('@vercel/postgres');
        await sql`BEGIN`;
        try {
          await callback(...args);
          await sql`COMMIT`;
        } catch (error) {
          await sql`ROLLBACK`;
          throw error;
        }
      };
    }
    
    // SQLite 事务
    return this.db.transaction(callback);
  }
}

module.exports = DatabaseAdapter;
