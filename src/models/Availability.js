const { getDb } = require('../utils/init-db');

class AvailabilityModel {
  constructor() {
    this.db = getDb();
  }

  // 添加可用时间
  add(userId, date, timeSlot) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    return stmt.run(userId, date, timeSlot);
  }

  // 批量添加可用时间
  addBatch(userId, availabilities) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO availability (user_id, date, time_slot, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    const insertMany = this.db.transaction((userId, availabilities) => {
      for (const av of availabilities) {
        stmt.run(userId, av.date, av.timeSlot);
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
      SELECT id, user_id, date, time_slot, created_at 
      FROM availability 
      WHERE user_id = ? 
      ORDER BY date, time_slot
    `);
    return stmt.all(userId);
  }

  // 获取指定日期和时间段的所有可用用户
  getByDateAndSlot(date, timeSlot) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, a.date, a.time_slot
      FROM availability a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = ? AND a.time_slot = ?
      ORDER BY u.id
    `);
    return stmt.all(date, timeSlot);
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
      SELECT id, user_id, date, time_slot, created_at 
      FROM availability 
      WHERE user_id = ? AND date = ?
      ORDER BY time_slot
    `);
    return stmt.all(userId, date);
  }

  // 获取可修改的申报（3 天后的）
  getModifiableAvailabilities(userId) {
    const stmt = this.db.prepare(`
      SELECT * FROM availability 
      WHERE user_id = ? AND date > date('now', '+3 days')
      ORDER BY date, time_slot
    `);
    return stmt.all(userId);
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
