const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class AvailabilityModel {
  // 添加可用时间
  async add(userId, date, timeSlot, activityCode = null) {
    return await db.run(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at, last_modified, activity_code)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `, [userId, date, timeSlot, activityCode]);
  }

  // 批量添加可用时间
  async addBatch(userId, availabilities) {
    const insertMany = db.transaction((userId, availabilities) => {
      for (const av of availabilities) {
        db.run(`
          INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at, last_modified, activity_code)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
        `, [userId, av.date, av.timeSlot, av.activityCode || null]);
      }
    });
    return await insertMany(userId, availabilities);
  }

  // 删除可用时间
  async remove(userId, date, timeSlot) {
    return await db.run(`
      DELETE FROM availability
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `, [userId, date, timeSlot]);
  }

  // 获取用户的可用时间
  async getByUser(userId) {
    return await db.all(`
      SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified
      FROM availability
      WHERE user_id = ?
      ORDER BY date, time_slot
    `, [userId]);
  }

  // 获取用户在活动代码中的可用时间
  async getByUserAndCode(userId, activityCode) {
    return await db.all(`
      SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified
      FROM availability
      WHERE user_id = ? AND activity_code = ?
      ORDER BY date, time_slot
    `, [userId, activityCode]);
  }

  // 获取指定日期和时间段的所有可用用户
  async getByDateAndSlot(date, timeSlot, activityCode = null) {
    if (activityCode) {
      return await db.all(`
        SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot, a.activity_code
        FROM availability a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ? AND a.time_slot = ? AND a.activity_code = ?
      `, [date, timeSlot, activityCode]);
    }
    return await db.all(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ?
      ORDER BY u.id
    `, [date, timeSlot]);
  }

  // 获取活动代码中指定日期和时间段的所有可用用户
  async getByDateSlotAndCode(date, timeSlot, activityCode) {
    return await db.all(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ? AND a.activity_code = ?
      ORDER BY u.id
    `, [date, timeSlot, activityCode]);
  }

  // 获取未来 14 天某时间段的所有可用用户
  async getAvailableUsersForPeriod(startDate, endDate, timeSlot) {
    return await db.all(`
      SELECT DISTINCT u.id, u.email, u.name, u.role, u.is_seed
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date BETWEEN ? AND ?
      AND a.time_slot = ?
      ORDER BY u.id
    `, [startDate, endDate, timeSlot]);
  }

  // 检查用户在某日期时间段的可用性
  async checkAvailability(userId, date, timeSlot) {
    return await db.get(`
      SELECT * FROM availability
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `, [userId, date, timeSlot]);
  }

  // 获取用户在某天所有时间段
  async getByUserAndDate(userId, date) {
    return await db.all(`
      SELECT id, user_id, date, time_slot, created_at, last_modified
      FROM availability
      WHERE user_id = ? AND date = ?
      ORDER BY time_slot
    `, [userId, date]);
  }

  // 检查申报是否可以修改
  async canModify(userId, date, timeSlot) {
    const existing = await this.checkAvailability(userId, date, timeSlot);

    if (!existing) {
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
  async getModifiableAvailabilities(userId) {
    const all = await db.all(`
      SELECT * FROM availability
      WHERE user_id = ?
      ORDER BY date, time_slot
    `, [userId]);

    // 过滤出可以修改的
    const modifiable = [];
    for (const a of all) {
      const result = await this.canModify(userId, a.date, a.time_slot);
      if (result.canModify) {
        modifiable.push(a);
      }
    }
    return modifiable;
  }

  // 清理过期的申报
  async cleanupExpired() {
    return await db.run(`
      DELETE FROM availability
      WHERE date < date('now')
    `);
  }
}

module.exports = new AvailabilityModel();
