/**
 * 添加测试用户和可用时间数据
 * 运行：node scripts/add-test-users.js
 */

const bcrypt = require('bcryptjs');
const { getDb, initDatabase } = require('../src/utils/init-db');

// 测试用户数据
const testUsers = [
  { name: '李明', email: 'liming@example.com', password: '123456' },
  { name: '王芳', email: 'wangfang@example.com', password: '123456' },
  { name: '张伟', email: 'zhangwei@example.com', password: '123456' },
  { name: '刘娜', email: 'liuna@example.com', password: '123456' },
  { name: '陈杰', email: 'chenjie@example.com', password: '123456' }
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

// 生成用户的可用时间
function generateAvailabilities(userId, pattern) {
  const availabilities = [];
  const db = getDb();
  
  for (let i = 0; i < 14; i++) {
    const date = getDate(i);
    
    // 根据不同模式生成可用时间
    let slots = [];
    switch (pattern) {
      case 'afternoon': // 主要下午有空
        slots = i % 3 === 0 ? [3] : [1]; // 每 3 天全天，其他下午
        break;
      case 'evening': // 主要晚上有空
        slots = i % 2 === 0 ? [2] : [3]; // 交替晚上和全天
        break;
      case 'full': // 经常有空
        slots = [1, 2, 3][Math.floor(Math.random() * 3)];
        slots = [slots];
        if (Math.random() > 0.5) slots = [1, 2]; // 有时下午和晚上
        break;
      case 'weekend': // 周末有空
        const dayOfWeek = new Date().getDay();
        const targetDay = (dayOfWeek + i) % 7;
        if (targetDay === 0 || targetDay === 6) {
          slots = [3]; // 周末全天
        } else {
          slots = Math.random() > 0.7 ? [2] : []; // 工作日偶尔晚上
        }
        break;
      case 'random': // 随机
        const rand = Math.random();
        if (rand > 0.7) slots = [3];
        else if (rand > 0.4) slots = [2];
        else if (rand > 0.2) slots = [1];
        else slots = [];
        break;
    }
    
    // 确保至少有 10 天以上有空
    if (slots.length === 0 && i < 10) {
      slots = [Math.floor(Math.random() * 3) + 1];
    }
    
    for (const slot of slots) {
      availabilities.push({ userId, date, timeSlot: slot });
    }
  }
  
  return availabilities;
}

async function addTestUsers() {
  console.log('开始添加测试用户...\n');
  
  const db = getDb();
  const User = require('../src/models/User');
  const Availability = require('../src/models/Availability');
  
  const patterns = ['afternoon', 'evening', 'full', 'weekend', 'random'];
  const createdUsers = [];
  
  for (let i = 0; i < testUsers.length; i++) {
    const user = testUsers[i];
    
    // 检查是否已存在
    const existing = User.findByEmail(user.email);
    if (existing) {
      console.log(`跳过已存在的用户：${user.email}`);
      createdUsers.push({ ...existing, pattern: patterns[i] });
      continue;
    }
    
    // 创建用户
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    const result = User.create(user.email, hashedPassword, user.name, 'user');
    
    const newUser = User.findById(result.lastInsertRowid);
    createdUsers.push({ ...newUser, pattern: patterns[i] });
    
    console.log(`✓ 创建用户：${user.name} (${user.email})`);
  }
  
  console.log('\n开始添加可用时间申报...\n');
  
  // 为每个用户添加可用时间
  for (const user of createdUsers) {
    const availabilities = generateAvailabilities(user.id, user.pattern);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot)
      VALUES (?, ?, ?)
    `);
    
    const insertMany = db.transaction((avails) => {
      for (const av of avails) {
        stmt.run(av.userId, av.date, av.timeSlot);
      }
    });
    
    insertMany(availabilities);
    
    console.log(`✓ 为用户 ${user.name} 添加了 ${availabilities.length} 条可用时间 (模式：${user.pattern})`);
  }
  
  // 统计
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalAvailabilities = db.prepare('SELECT COUNT(*) as count FROM availability').get().count;
  
  console.log('\n========== 完成 ==========');
  console.log(`总用户数：${totalUsers}`);
  console.log(`总可用时间记录：${totalAvailabilities}`);
  console.log('\n测试用户列表:');
  console.log('-------------------');
  createdUsers.forEach(u => {
    console.log(`  ${u.name} - ${u.email} / 123456 (模式：${u.pattern})`);
  });
  console.log('-------------------');
}

// 初始化数据库并添加数据
initDatabase();
addTestUsers();
