/**
 * 直接创建 Vercel Postgres 数据库表
 * 运行：node scripts/setup-postgres-tables.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

async function setup() {
  console.log('开始创建数据库表...\n');
  
  if (!process.env.POSTGRES_URL) {
    console.error('❌ 错误：未找到 POSTGRES_URL 环境变量');
    return;
  }

  const { Pool } = require('pg');
  const pool = new Pool({ 
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const tables = [
      // users 表
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        avatar VARCHAR(255),
        role VARCHAR(20) DEFAULT 'user',
        is_seed BOOLEAN DEFAULT false,
        invite_code VARCHAR(50),
        activity_admin_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // activity_codes 表
      `CREATE TABLE IF NOT EXISTS activity_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        min_players INTEGER DEFAULT 4,
        max_players INTEGER DEFAULT 4,
        players_per_game INTEGER DEFAULT 4,
        require_seed BOOLEAN DEFAULT true,
        seed_required BOOLEAN DEFAULT true
      )`,
      
      // availability 表
      `CREATE TABLE IF NOT EXISTS availability (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL,
        activity_code VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date, time_slot)
      )`,
      
      // activities 表
      `CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        time_slot INTEGER NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, time_slot)
      )`,
      
      // activity_members 表
      `CREATE TABLE IF NOT EXISTS activity_members (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER,
        user_id INTEGER,
        notified BOOLEAN DEFAULT false,
        notified_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_id, user_id)
      )`,
      
      // activity_code_users 表
      `CREATE TABLE IF NOT EXISTS activity_code_users (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )`,
      
      // activity_code_seeds 表
      `CREATE TABLE IF NOT EXISTS activity_code_seeds (
        id SERIAL PRIMARY KEY,
        activity_code_id INTEGER,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(activity_code_id, user_id)
      )`,
      
      // admin_invite_codes 表
      `CREATE TABLE IF NOT EXISTS admin_invite_codes (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER,
        code VARCHAR(50) UNIQUE NOT NULL,
        is_used BOOLEAN DEFAULT false,
        used_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
      console.log(`创建 ${tableName} 表...`);
      await pool.query(tables[i]);
    }
    
    console.log('\n✅ 所有表创建完成！');
    
    // 创建默认用户
    console.log('\n创建默认用户...');
    await createDefaultUsers(pool);
    
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
  } finally {
    await pool.end();
  }
}

async function createDefaultUsers(pool) {
  try {
    // 检查超级管理员
    const superAdminCheck = await pool.query(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`);
    if (superAdminCheck.rows.length === 0) {
      const hashedPassword = bcrypt.hashSync('admin123456', 10);
      const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();
      
      await pool.query(`
        INSERT INTO users (email, password, name, role, invite_code)
        VALUES ('admin@autogame.com', '${hashedPassword}', '铁', 'super_admin', '${inviteCode}')
      `);
      
      const adminResult = await pool.query(`SELECT id FROM users WHERE email = 'admin@autogame.com'`);
      const adminId = adminResult.rows[0].id;
      
      await pool.query(`
        INSERT INTO admin_invite_codes (admin_id, code, is_used)
        VALUES (${adminId}, '${inviteCode}', false)
      `);
      
      console.log('  ✓ 超级管理员账户已创建');
    } else {
      console.log('  ✓ 超级管理员账户已存在');
    }

    // 检查活动管理员
    const activityAdminCheck = await pool.query(`SELECT id FROM users WHERE role = 'activity_admin' LIMIT 1`);
    if (activityAdminCheck.rows.length === 0) {
      const hashedPassword = bcrypt.hashSync('seed123456', 10);
      const inviteCode = 'ADMIN' + Date.now().toString(36).toUpperCase();
      
      await pool.query(`
        INSERT INTO users (email, password, name, role, is_seed, invite_code)
        VALUES ('seed@autogame.com', '${hashedPassword}', '蚊子', 'activity_admin', true, '${inviteCode}')
      `);
      
      const seedResult = await pool.query(`SELECT id FROM users WHERE email = 'seed@autogame.com'`);
      const seedId = seedResult.rows[0].id;
      
      await pool.query(`
        INSERT INTO admin_invite_codes (admin_id, code, is_used)
        VALUES (${seedId}, '${inviteCode}', false)
      `);
      
      console.log('  ✓ 活动管理员账户已创建');
    } else {
      console.log('  ✓ 活动管理员账户已存在');
    }
    
    console.log('\n✅ 数据库设置完成！\n');
    console.log('默认账户:');
    console.log('  超级管理员：admin@autogame.com / admin123456');
    console.log('  活动管理员：seed@autogame.com / seed123456\n');
    
  } catch (error) {
    console.error('创建默认用户失败:', error.message);
  }
}

setup();
