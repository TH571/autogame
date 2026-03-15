/**
 * 创建测试用户
 * 运行：node scripts/create-test-users.js
 */

require('dotenv').config({ path: '.env.local' });
const db = require('../src/utils/database');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const ActivityCode = require('../src/models/ActivityCode');

async function createTestUsers() {
  console.log('开始创建测试用户...\n');
  
  if (!db.isVercel) {
    console.log('⚠️  请在 Vercel Postgres 环境中运行此脚本');
    return;
  }
  
  const conn = await db.getDb();
  
  // 测试用户数据
  const testUsers = [
    { name: '王强', email: 'wangqiang@example.com', password: '123456', activityCodes: ['BASKETBALL-2024'] },
    { name: '李娜', email: 'lina@example.com', password: '123456', activityCodes: ['BASKETBALL-2024'] },
    { name: '张敏', email: 'zhangmin@example.com', password: '123456', activityCodes: ['BASKETBALL-2024', 'BADMTON-2024'] },
    { name: '刘洋', email: 'liuyang@example.com', password: '123456', activityCodes: ['BADMTON-2024'] },
    { name: '陈静', email: 'chenjing@example.com', password: '123456', activityCodes: ['BADMTON-2024'] }
  ];
  
  // 获取活动代码
  const basketballCode = await ActivityCode.getByCode('BASKETBALL-2024');
  const badmintonCode = await ActivityCode.getByCode('BADMTON-2024');
  
  if (!basketballCode || !badmintonCode) {
    console.log('⚠️  活动代码不存在，请先创建活动代码');
    return;
  }
  
  for (const user of testUsers) {
    // 检查是否已存在
    const existing = await User.findByEmail(user.email);
    if (existing) {
      console.log(`✓ 用户已存在：${user.email}`);
      continue;
    }
    
    // 创建用户
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    const userId = await User.create(user.email, hashedPassword, user.name, 'user');
    
    // 分配到活动代码
    for (const code of user.activityCodes) {
      const activityCode = await ActivityCode.getByCode(code);
      if (activityCode) {
        await ActivityCode.addUser(activityCode.id, userId);
      }
    }
    
    console.log(`✓ 创建用户：${user.name} (${user.email}) - 活动：${user.activityCodes.join(', ')}`);
  }
  
  // 统计
  const allUsers = await conn.pool.query('SELECT COUNT(*) as count FROM users');
  console.log(`\n总用户数：${allUsers.rows[0].count}`);
  
  console.log('\n测试用户列表:');
  console.log('-------------------');
  testUsers.forEach(u => {
    console.log(`${u.name}: ${u.email} / ${u.password}`);
  });
  console.log('-------------------');
}

createTestUsers().catch(console.error);
