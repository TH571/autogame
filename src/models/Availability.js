/**
 * Availability 模型
 * 支持 SQLite 和 Vercel Postgres
 */

const db = require('../utils/database');

class AvailabilityModel {
  // 添加可用时间
  async add(userId, date, timeSlot, activityCode = null) {
    const sql = db.isVercel ? `
      INSERT INTO availability (user_id, date, time_slot, activity_code, last_modified)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, date, time_slot) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        last_modified = CURRENT_TIMESTAMP,
        activity_code = $4
    ` : `
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at, last_modified, activity_code)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
    `;
    
    const params = db.isVercel ? [userId, date, timeSlot, activityCode] : [userId, date, timeSlot, activityCode];
    return await db.execute(sql, params);
  }

  // 批量添加可用时间
  async addBatch(userId, availabilities) {
    for (const av of availabilities) {
      await this.add(userId, av.date, av.timeSlot, av.activityCode);
    }
  }

  // 删除可用时间
  async remove(userId, date, timeSlot) {
    const sql = db.isVercel
      ? 'DELETE FROM availability WHERE user_id = $1 AND date = $2 AND time_slot = $3'
      : 'DELETE FROM availability WHERE user_id = ? AND date = ? AND time_slot = ?';
    
    return await db.execute(sql, db.isVercel ? [userId, date, timeSlot] : [userId, date, timeSlot]);
  }

  // 获取用户的可用时间
  async getByUser(userId) {
    const sql = db.isVercel
      ? 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = $1 ORDER BY date, time_slot'
      : 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = ? ORDER BY date, time_slot';
    
    return await db.queryAll(sql, db.isVercel ? [userId] : [userId]);
  }

  // 获取用户在活动代码中的可用时间
  async getByUserAndCode(userId, activityCode) {
    const sql = db.isVercel
      ? 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = $1 AND activity_code = $2 ORDER BY date, time_slot'
      : 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = ? AND activity_code = ? ORDER BY date, time_slot';
    
    return await db.queryAll(sql, db.isVercel ? [userId, activityCode] : [userId, activityCode]);
  }

  // 获取指定日期和时间段的所有可用用户
  async getByDateAndSlot(date, timeSlot, activityCode = null) {
    let sql, params;
    
    if (activityCode) {
      sql = db.isVercel ? `
        SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot, a.activity_code
        FROM availability a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = $1 AND a.time_slot = $2 AND a.activity_code = $3
        ORDER BY u.id
      ` : `
        SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot, a.activity_code
        FROM availability a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ? AND a.time_slot = ? AND a.activity_code = ?
        ORDER BY u.id
      `;
      params = db.isVercel ? [date, timeSlot, activityCode] : [date, timeSlot, activityCode];
    } else {
      sql = db.isVercel ? `
        SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
        FROM availability a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = $1 AND a.time_slot = $2
        ORDER BY u.id
      ` : `
        SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
        FROM availability a
        JOIN users u ON a.user_id = u.id
        WHERE a.date = ? AND a.time_slot = ?
        ORDER BY u.id
      `;
      params = db.isVercel ? [date, timeSlot] : [date, timeSlot];
    }
    
    return await db.queryAll(sql, params);
  }

  // 获取活动代码中指定日期和时间段的所有可用用户
  async getByDateSlotAndCode(date, timeSlot, activityCode) {
    const sql = db.isVercel ? `
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = $1 AND a.time_slot = $2 AND a.activity_code = $3
      ORDER BY u.id
    ` : `
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ? AND a.activity_code = ?
      ORDER BY u.id
    `;
    
    return await db.queryAll(sql, db.isVercel ? [date, timeSlot, activityCode] : [date, timeSlot, activityCode]);
  }

  // 检查用户在某日期时间段的可用性
  async checkAvailability(userId, date, timeSlot) {
    const sql = db.isVercel
      ? 'SELECT * FROM availability WHERE user_id = $1 AND date = $2 AND time_slot = $3'
      : 'SELECT * FROM availability WHERE user_id = ? AND date = ? AND time_slot = ?';
    
    return await db.queryOne(sql, db.isVercel ? [userId, date, timeSlot] : [userId, date, timeSlot]);
  }

  // 获取用户在某天所有时间段
  async getByUserAndDate(userId, date) {
    const sql = db.isVercel
      ? 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = $1 AND date = $2 ORDER BY time_slot'
      : 'SELECT id, user_id, date, time_slot, activity_code, created_at, last_modified FROM availability WHERE user_id = ? AND date = ? ORDER BY time_slot';
    
    return await db.queryAll(sql, db.isVercel ? [userId, date] : [userId, date]);
  }

  // 检查申报是否可以修改（24 小时后悔期逻辑）
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

  // 清理过期的申报
  async cleanupExpired() {
    const sql = db.isVercel
      ? 'DELETE FROM availability WHERE date < CURRENT_DATE'
      : 'DELETE FROM availability WHERE date < date("now")';
    
    return await db.execute(sql);
  }
}

module.exports = new AvailabilityModel();
