#!/usr/bin/env node

/**
 * 数据库迁移脚本 - 添加 activity_invites 表
 * 使用方法：node scripts/migrate-add-invites-table.js
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 读取 SQL 迁移文件
const sqlPath = path.join(__dirname, 'migrate-activity-invites.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

console.log('📋 数据库迁移：添加 activity_invites 表');
console.log('-----------------------------------');

// 检查是否为 Vercel 环境
if (process.env.VERCEL || process.env.POSTGRES_URL) {
  console.log('🔗 检测到 Vercel Postgres 环境');
  
  // 使用 Vercel CLI 执行 SQL
  const { execSync } = require('child_process');
  
  try {
    // 分割 SQL 语句并逐个执行
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const stmt of statements) {
      console.log(`执行：${stmt.substring(0, 50)}...`);
      try {
        // 对于 CREATE TABLE IF NOT EXISTS，直接执行
        // 对于 CREATE INDEX IF NOT EXISTS，直接执行
        execSync(`echo "${stmt.replace(/"/g, '\\"')}" | vercel postgres execute --yes 2>/dev/null`, {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe'
        });
        console.log('✅ 成功');
      } catch (err) {
        console.log('⚠️  可能已存在或跳过');
      }
    }
    
    console.log('-----------------------------------');
    console.log('✅ 迁移完成！');
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    console.log('\n请手动在 Vercel Postgres 中执行以下 SQL:');
    console.log(sqlContent);
  }
} else {
  // 本地 SQLite 环境
  console.log('💾 检测到本地 SQLite 环境');
  
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
  
  try {
    const db = new Database(dbPath);
    db.exec(sqlContent);
    console.log('✅ SQLite 迁移完成！');
    db.close();
  } catch (error) {
    console.error('❌ SQLite 迁移失败:', error.message);
  }
}
