const { getDb } = require('../utils/init-db');

class ActivityModel {
  constructor() {
    this.db = getDb();
  }

  // 创建活动
  create(date, timeSlot, status = 'pending') {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activities (date, time_slot, status)
      VALUES (?, ?, ?)
    `);
    return stmt.run(date, timeSlot, status);
  }

  // 获取活动
  getById(id) {
    const stmt = this.db.prepare('SELECT * FROM activities WHERE id = ?');
    return stmt.get(id);
  }

  // 获取所有活动
  getAll() {
    const stmt = this.db.prepare(`
      SELECT * FROM activities 
      ORDER BY date, time_slot
    `);
    return stmt.all();
  }

  // 获取未来活动
  getUpcoming() {
    const stmt = this.db.prepare(`
      SELECT * FROM activities 
      WHERE date >= date('now')
      ORDER BY date, time_slot
    `);
    return stmt.all();
  }

  // 更新活动状态
  updateStatus(id, status) {
    const stmt = this.db.prepare(`
      UPDATE activities 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `);
    return stmt.run(status, id);
  }

  // 删除活动
  delete(id) {
    const stmt = this.db.prepare('DELETE FROM activities WHERE id = ?');
    return stmt.run(id);
  }

  // 添加活动成员
  addMember(activityId, userId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_members (activity_id, user_id)
      VALUES (?, ?)
    `);
    return stmt.run(activityId, userId);
  }

  // 批量添加成员
  addMembersBatch(activityId, userIds) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_members (activity_id, user_id)
      VALUES (?, ?)
    `);
    
    const insertMany = this.db.transaction((activityId, userIds) => {
      for (const userId of userIds) {
        stmt.run(activityId, userId);
      }
    });
    
    return insertMany(activityId, userIds);
  }

  // 获取活动成员
  getMembers(activityId) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, am.notified, am.notified_at
      FROM activity_members am
      JOIN users u ON am.user_id = u.id
      WHERE am.activity_id = ?
    `);
    return stmt.all(activityId);
  }

  // 获取成员数量
  getMemberCount(activityId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_members WHERE activity_id = ?
    `);
    return stmt.get(activityId).count;
  }

  // 移除活动成员
  removeMember(activityId, userId) {
    const stmt = this.db.prepare(`
      DELETE FROM activity_members 
      WHERE activity_id = ? AND user_id = ?
    `);
    return stmt.run(activityId, userId);
  }

  // 标记已通知
  markNotified(activityId, userIds) {
    const stmt = this.db.prepare(`
      UPDATE activity_members 
      SET notified = 1, notified_at = CURRENT_TIMESTAMP 
      WHERE activity_id = ? AND user_id = ?
    `);
    
    const updateMany = this.db.transaction((activityId, userIds) => {
      for (const userId of userIds) {
        stmt.run(activityId, userId);
      }
    });
    
    return updateMany(activityId, userIds);
  }

  // 获取用户的活动参与历史
  getUserParticipationHistory(userId) {
    const stmt = this.db.prepare(`
      SELECT a.id, a.date, a.time_slot, a.status, ph.created_at
      FROM participation_history ph
      JOIN activities a ON ph.activity_id = a.id
      WHERE ph.user_id = ?
      ORDER BY a.date DESC, a.time_slot DESC
    `);
    return stmt.all(userId);
  }

  // 获取用户在某时间段是否已参与
  hasParticipated(userId, date, timeSlot) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM participation_history 
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `);
    return stmt.get(userId, date, timeSlot).count > 0;
  }

  // 添加参与记录
  addParticipationRecord(userId, activityId, date, timeSlot) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO participation_history (user_id, activity_id, date, time_slot)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(userId, activityId, date, timeSlot);
  }

  // 获取用户的参与次数
  getUserParticipationCount(userId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM participation_history WHERE user_id = ?
    `);
    return stmt.get(userId).count;
  }

  // 获取用户最近参与日期（用于避免连续参与）
  getUserLastParticipationDate(userId) {
    const stmt = this.db.prepare(`
      SELECT MAX(date) as last_date FROM participation_history WHERE user_id = ?
    `);
    const result = stmt.get(userId);
    return result.last_date;
  }

  // 获取某时间段的活动（含成员信息）
  getActivityWithMembers(date, timeSlot) {
    const stmt = this.db.prepare(`
      SELECT a.*, 
        (SELECT COUNT(*) FROM activity_members WHERE activity_id = a.id) as member_count
      FROM activities a
      WHERE a.date = ? AND a.time_slot = ?
    `);
    return stmt.get(date, timeSlot);
  }

  // 获取 pending 状态的活动
  getPendingActivities() {
    const stmt = this.db.prepare(`
      SELECT * FROM activities 
      WHERE status = 'pending'
      ORDER BY date, time_slot
    `);
    return stmt.all();
  }
}

module.exports = new ActivityModel();
