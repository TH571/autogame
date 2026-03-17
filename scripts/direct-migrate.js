#!/usr/bin/env node
/**
 * 直接执行数据库迁移
 */

require('dotenv').config({ path: '.env.prod' });

const { Client } = require('pg');

const migrationSQL = `
-- 活动邀请码表 (PostgreSQL)
CREATE TABLE IF NOT EXISTS activity_invites (
  id SERIAL PRIMARY KEY,
  activity_code_id INTEGER REFERENCES activity_codes(id) ON DELETE CASCADE,
  invite_code VARCHAR(50) UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT 1,
  is_used BOOLEAN DEFAULT false,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_activity_invites_code ON activity_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_activity_invites_activity_code ON activity_invites(activity_code_id);
`;

async function runMigration() {
  console.log('🚀 开始数据库迁移...');
  console.log('连接字符串:', process.env.POSTGRES_URL ? '已找到' : '未找到');
  
  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    await client.query(migrationSQL);
    console.log('✅ 数据库迁移成功！activity_invites 表已创建');
    
    // 验证表是否创建成功
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'activity_invites'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ 验证成功：activity_invites 表已存在');
    } else {
      console.log('❌ 验证失败：activity_invites 表不存在');
    }
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

runMigration().catch(console.error);
