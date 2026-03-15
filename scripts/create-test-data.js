/**
 * 创建测试活动代码和用户数据
 * 运行：node scripts/create-test-data.js
 */

const bcrypt = require('bcryptjs');
const { getDb, initDatabase } = require('../src/utils/init-db');

// 测试活动代码
const activityCodes = [
  { code: 'BASKETBALL-2024', name: '篮球活动', description: '每周篮球活动' },
  { code: 'BADMTON-2024', name: '羽毛球活动', description: '周末羽毛球活动' }
];

// 测试用户
const testUsers = [
  { name: '王强', email: 'wangqiang@example.com', password: '123456' },
  { name: '李娜', email: 'lina@example.com', password: '123456' },
  { name: '张敏', email: 'zhangmin@example.com', password: '123456' },
  { name: '刘洋', email: 'liuyang@example.com', password: '123456' },
  { name: '陈静', email: 'chenjing@example.com', password: '123456' }
];

// 获取未来日期
function getDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createTestData() {
  console.log('开始创建测试数据...\n');
  
  const db = getDb();
  const User = require('../src/models/User');
  const ActivityCode = require('../src/models/ActivityCode');
  const Availability = require('../src/models/Availability');
  
  // 1. 创建活动代码
  console.log('=== 创建活动代码 ===');
  const createdCodes = [];
  
  for (const ac of activityCodes) {
    const existing = ActivityCode.getByCode(ac.code);
    if (existing) {
      console.log(`✓ 活动代码已存在：${ac.code}`);
      createdCodes.push(existing);
    } else {
      const result = ActivityCode.create(ac.code, ac.name, ac.description, 1);
      const code = ActivityCode.getById(result.lastInsertRowid);
      createdCodes.push(code);
      console.log(`✓ 创建活动代码：${ac.code} - ${ac.name}`);
    }
  }
  
  // 2. 创建用户
  console.log('\n=== 创建测试用户 ===');
  const createdUsers = [];
  
  for (const user of testUsers) {
    const existing = User.findByEmail(user.email);
    if (existing) {
      console.log(`✓ 用户已存在：${user.email}`);
      createdUsers.push(existing);
    } else {
      const hashedPassword = bcrypt.hashSync(user.password, 10);
      const result = User.create(user.email, hashedPassword, user.name, 'user');
      const newUser = User.findById(result.lastInsertRowid);
      createdUsers.push(newUser);
      console.log(`✓ 创建用户：${user.name} (${user.email})`);
    }
  }
  
  // 3. 分配用户到活动代码
  console.log('\n=== 分配用户到活动代码 ===');
  
  // 篮球活动：王强、李娜、张敏
  const basketballUsers = createdUsers.slice(0, 3);
  for (const user of basketballUsers) {
    ActivityCode.addUser(createdCodes[0].id, user.id);
    console.log(`✓ 添加 ${user.name} 到 ${createdCodes[0].code}`);
  }
  
  // 羽毛球活动：张敏、刘洋、陈静
  const badmintonUsers = createdUsers.slice(2, 5);
  for (const user of badmintonUsers) {
    ActivityCode.addUser(createdCodes[1].id, user.id);
    console.log(`✓ 添加 ${user.name} 到 ${createdCodes[1].code}`);
  }
  
  // 4. 为用户创建时间申报
  console.log('\n=== 创建时间申报 ===');
  
  // 为每个用户创建不同的申报模式
  const patterns = {
    'wangqiang@example.com': 'morning',    // 主要下午
    'lina@example.com': 'evening',         // 主要晚上
    'zhangmin@example.com': 'full',        // 全天（两个活动都参加）
    'liuyang@example.com': 'weekend',      // 周末
    'chenjing@example.com': 'random'       // 随机
  };
  
  for (const user of createdUsers) {
    const pattern = patterns[user.email];
    const availabilities = [];
    
    // 获取用户的活动代码
    const userCodes = [];
    if (basketballUsers.includes(user)) {
      userCodes.push(createdCodes[0].code);
    }
    if (badmintonUsers.includes(user)) {
      userCodes.push(createdCodes[1].code);
    }
    
    // 为每个活动代码创建申报
    for (const activityCode of userCodes) {
      for (let i = 0; i < 14; i++) {
        const date = getDate(i);
        let slots = [];
        
        switch (pattern) {
          case 'morning':
            slots = i % 2 === 0 ? [1] : [1, 2];
            break;
          case 'evening':
            slots = i % 2 === 0 ? [2] : [1, 2];
            break;
          case 'full':
            slots = [1, 2];
            break;
          case 'weekend':
            const dayOfWeek = (new Date().getDay() + i) % 7;
            slots = (dayOfWeek === 0 || dayOfWeek === 6) ? [1, 2] : [];
            break;
          case 'random':
            const rand = Math.random();
            if (rand > 0.6) slots = [1, 2];
            else if (rand > 0.3) slots = [2];
            else if (rand > 0.1) slots = [1];
            else slots = [];
            break;
        }
        
        for (const slot of slots) {
          availabilities.push({
            userId: user.id,
            date,
            timeSlot: slot,
            activityCode
          });
        }
      }
      
      // 批量插入
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO availability (user_id, date, time_slot, activity_code, last_modified)
        VALUES (?, ?, ?, ?, datetime('now'))
      `);
      
      const insertMany = db.transaction((avails) => {
        for (const av of avails) {
          stmt.run(av.userId, av.date, av.timeSlot, av.activityCode);
        }
      });
      
      insertMany(availabilities);
      
      console.log(`✓ 为 ${user.name} 创建 ${availabilities.length} 条申报 (${activityCode})`);
    }
  }
  
  // 5. 统计
  console.log('\n========== 完成 ==========');
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalCodes = db.prepare('SELECT COUNT(*) as count FROM activity_codes').get().count;
  const totalAvailabilities = db.prepare('SELECT COUNT(*) as count FROM availability').get().count;
  
  console.log(`总用户数：${totalUsers}`);
  console.log(`总活动代码：${totalCodes}`);
  console.log(`总申报记录：${totalAvailabilities}`);
  
  console.log('\n=== 活动代码 ===');
  createdCodes.forEach(code => {
    const userCount = ActivityCode.getUsersByCodeId(code.id).length;
    console.log(`  ${code.code} - ${code.name}: ${userCount}人`);
  });
  
  console.log('\n=== 用户列表 ===');
  createdUsers.forEach(user => {
    const codes = [];
    if (basketballUsers.includes(user)) codes.push('BASKETBALL-2024');
    if (badmintonUsers.includes(user)) codes.push('BADMTON-2024');
    console.log(`  ${user.name} (${user.email}): ${codes.join(', ')}`);
  });
  
  console.log('\n=== 登录信息 ===');
  console.log('管理员：admin@autogame.com / admin123456');
  console.log('种子选手：seed@autogame.com / seed123456');
  createdUsers.forEach(user => {
    console.log(`${user.name}: ${user.email} / 123456`);
  });
}

// 初始化并运行
initDatabase();
createTestData();
