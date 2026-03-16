const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class ActivityModel {
  // 创建活动
  async create(date, timeSlot, status = 'pending') {
    return await db.run(`
      INSERT OR IGNORE INTO activities (date, time_slot, status)
      VALUES (?, ?, ?)
    `, [date, timeSlot, status]);
  }

  // 获取活动
  async getById(id) {
    return await db.get('SELECT * FROM activities WHERE id = ?', [id]);
  }

  // 获取所有活动
  async getAll() {
    return await db.all(`
      SELECT * FROM activities
      ORDER BY date, time_slot
    `);
  }

  // 获取未来活动
  async getUpcoming() {
    return await db.all(`
      SELECT * FROM activities
      WHERE date >= date('now')
      ORDER BY date, time_slot
    `);
  }

  // 更新活动状态
  async updateStatus(id, status) {
    return await db.run(`
      UPDATE activities
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, id]);
  }

  // 删除活动
  async delete(id) {
    return await db.run('DELETE FROM activities WHERE id = ?', [id]);
  }

  // 添加活动成员
  async addMember(activityId, userId) {
    return await db.run(`
      INSERT OR IGNORE INTO activity_members (activity_id, user_id)
      VALUES (?, ?)
    `, [activityId, userId]);
  }

  // 批量添加成员
  async addMembersBatch(activityId, userIds) {
    const insertMany = db.transaction((activityId, userIds) => {
      for (const userId of userIds) {
        db.run(`
          INSERT OR IGNORE INTO activity_members (activity_id, user_id)
          VALUES (?, ?)
        `, [activityId, userId]);
      }
    });
    return await insertMany(activityId, userIds);
  }

  // 获取活动成员
  async getMembers(activityId) {
    return await db.all(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, am.notified, am.notified_at
      FROM activity_members am
      JOIN users u ON am.user_id = u.id
      WHERE am.activity_id = ?
    `, [activityId]);
  }

  // 获取成员数量
  async getMemberCount(activityId) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM activity_members WHERE activity_id = ?
    `, [activityId]);
    return result ? result.count : 0;
  }

  // 移除活动成员
  async removeMember(activityId, userId) {
    return await db.run(`
      DELETE FROM activity_members
      WHERE activity_id = ? AND user_id = ?
    `, [activityId, userId]);
  }

  // 标记已通知
  async markNotified(activityId, userIds) {
    const updateMany = db.transaction((activityId, userIds) => {
      for (const userId of userIds) {
        db.run(`
          UPDATE activity_members
          SET notified = 1, notified_at = CURRENT_TIMESTAMP
          WHERE activity_id = ? AND user_id = ?
        `, [activityId, userId]);
      }
    });
    return await updateMany(activityId, userIds);
  }

  // 获取用户的活动参与历史
  async getUserParticipationHistory(userId) {
    return await db.all(`
      SELECT a.id, a.date, a.time_slot, a.status, ph.created_at
      FROM participation_history ph
      JOIN activities a ON ph.activity_id = a.id
      WHERE ph.user_id = ?
      ORDER BY a.date DESC, a.time_slot DESC
    `, [userId]);
  }

  // 获取用户在某时间段是否已参与
  async hasParticipated(userId, date, timeSlot) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM participation_history
      WHERE user_id = ? AND date = ? AND time_slot = ?
    `, [userId, date, timeSlot]);
    return result ? result.count > 0 : false;
  }

  // 添加参与记录
  async addParticipationRecord(userId, activityId, date, timeSlot) {
    return await db.run(`
      INSERT OR IGNORE INTO participation_history (user_id, activity_id, date, time_slot)
      VALUES (?, ?, ?, ?)
    `, [userId, activityId, date, timeSlot]);
  }

  // 获取用户的参与次数
  async getUserParticipationCount(userId) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM participation_history WHERE user_id = ?
    `, [userId]);
    return result ? result.count : 0;
  }

  // 获取用户最近参与日期（用于避免连续参与）
  async getUserLastParticipationDate(userId) {
    const result = await db.get(`
      SELECT MAX(date) as last_date FROM participation_history WHERE user_id = ?
    `, [userId]);
    return result ? result.last_date : null;
  }

  // 获取某时间段的活动（含成员信息）
  async getActivityWithMembers(date, timeSlot) {
    return await db.get(`
      SELECT a.*,
        (SELECT COUNT(*) FROM activity_members WHERE activity_id = a.id) as member_count
      FROM activities a
      WHERE a.date = ? AND a.time_slot = ?
    `, [date, timeSlot]);
  }

  // 获取 pending 状态的活动
  async getPendingActivities() {
    return await db.all(`
      SELECT * FROM activities
      WHERE status = 'pending'
      ORDER BY date, time_slot
    `);
  }
}

module.exports = new ActivityModel();
