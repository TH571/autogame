/**
 * Vercel Postgres 数据库迁移脚本
 * 运行：node scripts/migrate-to-postgres.js
 */

const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

async function migrate() {
  console.log('开始迁移到 Vercel Postgres...\n');

  try {
    // 创建用户表
    console.log('创建 users 表...');
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
    console.log('创建 availability 表...');
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
    console.log('创建 activities 表...');
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
    console.log('创建 activity_members 表...');
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
    console.log('创建 participation_history 表...');
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
    console.log('创建 activity_codes 表...');
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
    console.log('创建 activity_code_users 表...');
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
    console.log('创建 activity_code_seeds 表...');
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
    console.log('创建 admin_invite_codes 表...');
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
    console.log('创建索引...');
    await sql`CREATE INDEX IF NOT EXISTS idx_availability_user_date ON availability(user_id, date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_availability_activity_code ON availability(activity_code)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activities_date_slot ON activities(date, time_slot, status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_activity_members_activity ON activity_members(activity_id)`;

    // 创建默认用户
    console.log('\n创建默认用户...');
    await createDefaultUsers();

    console.log('\n✅ Vercel Postgres 数据库迁移完成！\n');
    console.log('默认账户:');
    console.log('  超级管理员：admin@autogame.com / admin123456');
    console.log('  活动管理员：seed@autogame.com / seed123456\n');

  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    if (error.message.includes('POSTGRES_URL')) {
      console.error('\n请确保已在 Vercel 创建 Postgres 数据库并连接项目');
      console.error('访问：https://vercel.com/dashboard → Storage → Add Database → Postgres\n');
    }
    throw error;
  }
}

async function createDefaultUsers() {
  // 检查超级管理员
  const superAdminCheck = await sql`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`;
  if (superAdminCheck.rows.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123456', 10);
    const inviteCode = 'SUPER' + Date.now().toString(36).toUpperCase();
    
    await sql`
      INSERT INTO users (email, password, name, role, invite_code)
      VALUES ('admin@autogame.com', ${hashedPassword}, '铁', 'super_admin', ${inviteCode})
    `;
    
    const adminResult = await sql`SELECT id FROM users WHERE email = 'admin@autogame.com'`;
    const adminId = adminResult.rows[0].id;
    
    await sql`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (${adminId}, ${inviteCode}, false)
    `;
    
    console.log('  ✓ 超级管理员账户已创建');
  } else {
    console.log('  ✓ 超级管理员账户已存在');
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
    
    const seedResult = await sql`SELECT id FROM users WHERE email = 'seed@autogame.com'`;
    const seedId = seedResult.rows[0].id;
    
    await sql`
      INSERT INTO admin_invite_codes (admin_id, code, is_used)
      VALUES (${seedId}, ${inviteCode}, false)
    `;
    
    console.log('  ✓ 活动管理员账户已创建');
  } else {
    console.log('  ✓ 活动管理员账户已存在');
  }
}

// 运行迁移
migrate().catch(console.error);
