/**
 * 为所有用户随机申报时间
 * 用于测试组队功能
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 获取数据库连接
const dbPath = process.env.DATABASE_PATH || './data/autogame.db';
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// 辅助函数：格式化日期
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 辅助函数：获取星期
function getDayOfWeek(date) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return days[date.getDay()];
}

// 获取所有用户
const users = db.prepare('SELECT id, name, role FROM users').all();
console.log(`找到 ${users.length} 个用户`);

// 获取所有活动代码
const activityCodes = db.prepare('SELECT code, id FROM activity_codes').all();
console.log(`找到 ${activityCodes.length} 个活动代码`);

if (activityCodes.length === 0) {
  console.error('错误：没有找到活动代码，请先创建活动代码');
  process.exit(1);
}

// 获取未来 14 天的日期
const today = new Date();
const dates = [];
for (let i = 0; i < 14; i++) {
  const date = new Date(today);
  date.setDate(today.getDate() + i);
  dates.push(formatDate(date));
}

// 时间段：只生成 1=下午 和 2=晚上
const timeSlots = [1, 2];

// 为每个用户随机申报时间
let totalInserts = 0;

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO availability (user_id, date, time_slot, activity_code, created_at, updated_at, last_modified)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

const insertMany = db.transaction((availabilities) => {
  for (const av of availabilities) {
    insertStmt.run(av.userId, av.date, av.timeSlot, av.activityCode);
  }
});

for (const user of users) {
  console.log(`\n为用户 ${user.name} (ID: ${user.id}) 申报时间...`);
  
  const availabilities = [];
  
  // 为每个活动代码申报时间
  for (const activityCode of activityCodes) {
    // 随机选择 60% 的日期
    for (const date of dates) {
      // 60% 的概率申报这一天
      if (Math.random() < 0.6) {
        // 随机选择时间段
        // 40% 下午，40% 晚上，20% 全天
        const rand = Math.random();
        let timeSlot;
        if (rand < 0.4) {
          timeSlot = 1; // 下午
        } else if (rand < 0.8) {
          timeSlot = 2; // 晚上
        } else {
          timeSlot = 3; // 全天
        }
        
        availabilities.push({
          userId: user.id,
          date,
          timeSlot,
          activityCode: activityCode.code
        });
      }
    }
  }
  
  if (availabilities.length > 0) {
    insertMany(availabilities);
    totalInserts += availabilities.length;
    console.log(`  ✓ 申报了 ${availabilities.length} 个时间段`);
  } else {
    console.log(`  - 没有申报时间`);
  }
}

console.log(`\n✅ 完成！共插入 ${totalInserts} 条申报记录`);

// 显示统计信息
console.log('\n=== 申报统计 ===');
const stats = db.prepare(`
  SELECT u.name, COUNT(a.id) as count
  FROM users u
  LEFT JOIN availability a ON u.id = a.user_id
  GROUP BY u.id
  ORDER BY count DESC
`).all();

for (const stat of stats) {
  console.log(`${stat.name}: ${stat.count} 个时间段`);
}

// 按活动代码统计
console.log('\n=== 按活动代码统计 ===');
const codeStats = db.prepare(`
  SELECT activity_code, COUNT(*) as count
  FROM availability
  GROUP BY activity_code
`).all();

for (const stat of codeStats) {
  console.log(`${stat.activity_code}: ${stat.count} 条申报`);
}

// 按日期统计
console.log('\n=== 按日期统计（前 7 天）===');
const dateStats = db.prepare(`
  SELECT date, COUNT(*) as count
  FROM availability
  GROUP BY date
  ORDER BY date
  LIMIT 7
`).all();

for (const stat of dateStats) {
  const dateObj = new Date(stat.date);
  const dayOfWeek = getDayOfWeek(dateObj);
  console.log(`${stat.date} (${dayOfWeek}): ${stat.count} 条申报`);
}

db.close();
console.log('\n数据库连接已关闭');
