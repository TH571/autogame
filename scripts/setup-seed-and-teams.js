/**
 * 为种子选手添加可用时间并执行自动组队测试
 */

const { getDb, initDatabase } = require('../src/utils/init-db');

function getDate(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function setupSeedAndBuildTeams() {
  console.log('开始设置种子选手可用时间并执行组队...\n');
  
  const db = getDb();
  const User = require('../src/models/User');
  const Availability = require('../src/models/Availability');
  const TeamBuilder = require('../src/utils/TeamBuilder');
  
  // 获取种子选手
  const seedUser = User.findSeed();
  if (!seedUser) {
    console.log('未找到种子选手！');
    return;
  }
  
  console.log(`种子选手：${seedUser.name} (${seedUser.email})\n`);
  
  // 为种子选手添加未来 14 天的可用时间（大部分时间有空）
  const availabilities = [];
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO availability (user_id, date, time_slot)
    VALUES (?, ?, ?)
  `);
  
  for (let i = 0; i < 14; i++) {
    const date = getDate(i);
    // 种子选手大部分时间有空
    if (i % 5 !== 0) { // 每 5 天有一天没空
      availabilities.push({ userId: seedUser.id, date, timeSlot: 1 });
      availabilities.push({ userId: seedUser.id, date, timeSlot: 2 });
      if (i % 3 === 0) {
        availabilities.push({ userId: seedUser.id, date, timeSlot: 3 });
      }
    }
  }
  
  const insertMany = db.transaction((avails) => {
    for (const av of avails) {
      stmt.run(av.userId, av.date, av.timeSlot);
    }
  });
  
  insertMany(availabilities);
  console.log(`✓ 为种子选手添加了 ${availabilities.length} 条可用时间`);
  
  // 统计当前可用时间情况
  console.log('\n当前可用时间统计:');
  console.log('-------------------');
  
  const users = User.findAll();
  for (const user of users) {
    const count = db.prepare('SELECT COUNT(*) as c FROM availability WHERE user_id = ?').get(user.id).c;
    console.log(`  ${user.name}: ${count} 个时间段`);
  }
  console.log('-------------------\n');
  
  // 执行自动组队
  console.log('开始执行自动组队...\n');
  const result = TeamBuilder.buildTeams();
  
  if (result.success) {
    console.log(`\n✓ 组队完成！共创建 ${result.results.length} 个活动`);
    
    if (result.results.length > 0) {
      console.log('\n活动列表:');
      console.log('-------------------');
      result.results.forEach((activity, index) => {
        console.log(`${index + 1}. ${activity.date} ${activity.timeSlotText}`);
        console.log(`   成员：${activity.members.map(m => m.name + (m.isSeed ? ' (种子)' : '')).join(', ')}`);
      });
      console.log('-------------------');
    }
  } else {
    console.log('组队失败:', result.error);
  }
  
  // 最终统计
  const totalActivities = db.prepare('SELECT COUNT(*) as c FROM activities').get().count;
  const totalMembers = db.prepare('SELECT COUNT(*) as c FROM activity_members').get().count;
  
  console.log('\n========== 最终统计 ==========');
  console.log(`总用户数：${users.length}`);
  console.log(`总活动数：${totalActivities}`);
  console.log(`总参与人次：${totalMembers}`);
}

// 初始化并运行
initDatabase();
setupSeedAndBuildTeams();
