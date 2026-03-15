const { getDb } = require('../utils/init-db');

class AvailabilityModel {
  constructor() {
    this.db = getDb();
  }

  // 添加可用时间
  add(userId, date, timeSlot, activityCode = null) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at, last_modified, activity_code)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);
    return stmt.run(userId, date, timeSlot, activityCode);
  }

  // 批量添加可用时间
  addBatch(userId, availabilities) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at, last_modified, activity_code)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `);

    const insertMany = this.db.transaction((userId, availabilities) => {
      for (const av of availabilities) {
        stmt.run(userId, av.date, av.timeSlot, av.activityCode || null);
      }
    });

    return insertMany(userId, availabilities);
  }

  // 删除可用时间
  remove(userId, date, timeSlot) {
    const stmt = this.db.prepare(`
      DELETE FROM availability
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `);
    return stmt.run(userId, date, timeSlot);
  }

  // 获取用户的可用时间
  getByUser(userId) {
    const stmt = this.db.prepare(`
      SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified
      FROM availability
      WHERE user_id = ?
      ORDER BY date, time_slot
    `);
    return stmt.all(userId);
  }

  // 获取用户在活动代码中的可用时间
  getByUserAndCode(userId, activityCode) {
    const stmt = this.db.prepare(`
      SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified
      FROM availability
      WHERE user_id = ? AND activity_code = ?
      ORDER BY date, time_slot
    `);
    return stmt.all(userId, activityCode);
  }

  // 获取指定日期和时间段的所有可用用户
  getByDateAndSlot(date, timeSlot, activityCode = null) {
    let sql = `
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot, a.activity_code
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ?
    `;
    
    if (activityCode) {
      sql += ` AND a.activity_code = ?`;
      return this.db.prepare(sql).all(date, timeSlot, activityCode);
    }
    
    sql += ` ORDER BY u.id`;
    return this.db.prepare(sql).all(date, timeSlot);
  }

  // 获取活动代码中指定日期和时间段的所有可用用户
  getByDateSlotAndCode(date, timeSlot, activityCode) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ? AND a.activity_code = ?
      ORDER BY u.id
    `);
    return stmt.all(date, timeSlot, activityCode);
  }

  // 获取未来 14 天某时间段的所有可用用户
  getAvailableUsersForPeriod(startDate, endDate, timeSlot) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT u.id, u.email, u.name, u.role, u.is_seed
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date BETWEEN ? AND ?
      AND a.time_slot = ?
      ORDER BY u.id
    `);
    return stmt.all(startDate, endDate, timeSlot);
  }

  // 检查用户在某日期时间段的可用性
  checkAvailability(userId, date, timeSlot) {
    const stmt = this.db.prepare(`
      SELECT * FROM availability
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `);
    return stmt.get(userId, date, timeSlot);
  }

  // 获取用户在某天所有时间段
  getByUserAndDate(userId, date) {
    const stmt = this.db.prepare(`
      SELECT id, user_id, date, time_slot, created_at, last_modified
      FROM availability
      WHERE user_id = ? AND date = ?
      ORDER BY time_slot
    `);
    return stmt.all(userId, date);
  }

  // 检查申报是否可以修改
  // 规则：提交后 24 小时内可以修改任何时间，24 小时后只能修改 3 天后的时间
  canModify(userId, date, timeSlot) {
    const existing = this.checkAvailability(userId, date, timeSlot);
    
    if (!existing) {
      // 新申报，可以添加
      return { canModify: true, reason: '' };
    }

    const now = new Date();
    const lastModified = new Date(existing.last_modified);
    const hoursSinceLastModified = (now - lastModified) / (1000 * 60 * 60);

    // 24 小时后悔期内，可以修改
    if (hoursSinceLastModified < 24) {
      return { canModify: true, reason: 'regret_period' };
    }

    // 24 小时后，只能修改 3 天后的日期
    const inputDate = new Date(date);
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(now.getDate() + 3);
    threeDaysLater.setHours(0, 0, 0, 0);

    if (inputDate >= threeDaysLater) {
      return { canModify: true, reason: 'future_date' };
    }

    return { 
      canModify: false, 
      reason: 'locked',
      lastModified: existing.last_modified,
      hoursRemaining: Math.ceil(24 - hoursSinceLastModified)
    };
  }

  // 获取可修改的申报
  getModifiableAvailabilities(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM availability
      WHERE user_id = ?
      ORDER BY date, time_slot
    `);
    const all = stmt.all(userId);
    
    // 过滤出可以修改的
    return all.filter(a => {
      const result = this.canModify(userId, a.date, a.time_slot);
      return result.canModify;
    });
  }

  // 清理过期的申报
  cleanupExpired() {
    const stmt = this.db.prepare(`
      DELETE FROM availability
      WHERE date < date('now')
    `);
    return stmt.run();
  }
}

module.exports = new AvailabilityModel();
