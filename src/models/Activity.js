/**
 * Activity 模型
 * 支持 SQLite 和 Vercel Postgres
 */

const db = require('../utils/database');

class ActivityModel {
  // 创建活动
  async create(date, timeSlot, status = 'pending') {
    const sql = db.isVercel ? `
      INSERT INTO activities (date, time_slot, status)
      VALUES ($1, $2, $3)
      ON CONFLICT (date, time_slot) DO NOTHING
      RETURNING id
    ` : `
      INSERT OR IGNORE INTO activities (date, time_slot, status)
      VALUES (?, ?, ?)
    `;
    
    const params = db.isVercel ? [date, timeSlot, status] : [date, timeSlot, status];
    return await db.insert(sql, params);
  }

  // 获取活动
  async getById(id) {
    const sql = db.isVercel
      ? 'SELECT * FROM activities WHERE id = $1'
      : 'SELECT * FROM activities WHERE id = ?';
    
    return await db.queryOne(sql, db.isVercel ? [id] : [id]);
  }

  // 获取所有活动
  async getAll() {
    const sql = db.isVercel
      ? 'SELECT * FROM activities ORDER BY date, time_slot'
      : 'SELECT * FROM activities ORDER BY date, time_slot';
    
    return await db.queryAll(sql);
  }

  // 获取未来活动
  async getUpcoming() {
    const sql = db.isVercel
      ? 'SELECT * FROM activities WHERE date >= CURRENT_DATE ORDER BY date, time_slot'
      : 'SELECT * FROM activities WHERE date >= date("now") ORDER BY date, time_slot';
    
    return await db.queryAll(sql);
  }

  // 更新活动状态
  async updateStatus(id, status) {
    const sql = db.isVercel
      ? 'UPDATE activities SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2'
      : 'UPDATE activities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    
    return await db.execute(sql, db.isVercel ? [status, id] : [status, id]);
  }

  // 删除活动
  async delete(id) {
    const sql = db.isVercel
      ? 'DELETE FROM activities WHERE id = $1'
      : 'DELETE FROM activities WHERE id = ?';
    
    return await db.execute(sql, db.isVercel ? [id] : [id]);
  }

  // 添加活动成员
  async addMember(activityId, userId) {
    const sql = db.isVercel
      ? 'INSERT INTO activity_members (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO activity_members (activity_id, user_id) VALUES (?, ?)';
    
    return await db.execute(sql, db.isVercel ? [activityId, userId] : [activityId, userId]);
  }

  // 批量添加成员
  async addMembersBatch(activityId, userIds) {
    for (const userId of userIds) {
      await this.addMember(activityId, userId);
    }
  }

  // 获取活动成员
  async getMembers(activityId) {
    const sql = db.isVercel ? `
      SELECT u.id, u.email, u.name, u.role, u.is_seed, am.notified, am.notified_at
      FROM activity_members am
      JOIN users u ON am.user_id = u.id
      WHERE am.activity_id = $1
    ` : `
      SELECT u.id, u.email, u.name, u.role, u.is_seed, am.notified, am.notified_at
      FROM activity_members am
      JOIN users u ON am.user_id = u.id
      WHERE am.activity_id = ?
    `;
    
    return await db.queryAll(sql, db.isVercel ? [activityId] : [activityId]);
  }

  // 获取成员数量
  async getMemberCount(activityId) {
    const sql = db.isVercel
      ? 'SELECT COUNT(*) as count FROM activity_members WHERE activity_id = $1'
      : 'SELECT COUNT(*) as count FROM activity_members WHERE activity_id = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [activityId] : [activityId]);
    return result?.count || 0;
  }

  // 移除活动成员
  async removeMember(activityId, userId) {
    const sql = db.isVercel
      ? 'DELETE FROM activity_members WHERE activity_id = $1 AND user_id = $2'
      : 'DELETE FROM activity_members WHERE activity_id = ? AND user_id = ?';
    
    return await db.execute(sql, db.isVercel ? [activityId, userId] : [activityId, userId]);
  }

  // 标记已通知
  async markNotified(activityId, userIds) {
    for (const userId of userIds) {
      const sql = db.isVercel
        ? 'UPDATE activity_members SET notified = true, notified_at = CURRENT_TIMESTAMP WHERE activity_id = $1 AND user_id = $2'
        : 'UPDATE activity_members SET notified = 1, notified_at = CURRENT_TIMESTAMP WHERE activity_id = ? AND user_id = ?';
      
      await db.execute(sql, db.isVercel ? [activityId, userId] : [activityId, userId]);
    }
  }

  // 获取用户的活动参与历史
  async getUserParticipationHistory(userId) {
    const sql = db.isVercel ? `
      SELECT a.id, a.date, a.time_slot, a.status, ph.created_at
      FROM participation_history ph
      JOIN activities a ON ph.activity_id = a.id
      WHERE ph.user_id = $1
      ORDER BY a.date DESC, a.time_slot DESC
    ` : `
      SELECT a.id, a.date, a.time_slot, a.status, ph.created_at
      FROM participation_history ph
      JOIN activities a ON ph.activity_id = a.id
      WHERE ph.user_id = ?
      ORDER BY a.date DESC, a.time_slot DESC
    `;
    
    return await db.queryAll(sql, db.isVercel ? [userId] : [userId]);
  }

  // 获取用户在某时间段是否已参与
  async hasParticipated(userId, date, timeSlot) {
    const sql = db.isVercel
      ? 'SELECT COUNT(*) as count FROM participation_history WHERE user_id = $1 AND date = $2 AND time_slot = $3'
      : 'SELECT COUNT(*) as count FROM participation_history WHERE user_id = ? AND date = ? AND time_slot = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [userId, date, timeSlot] : [userId, date, timeSlot]);
    return (result?.count || 0) > 0;
  }

  // 添加参与记录
  async addParticipationRecord(userId, activityId, date, timeSlot) {
    const sql = db.isVercel
      ? 'INSERT INTO participation_history (user_id, activity_id, date, time_slot) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO participation_history (user_id, activity_id, date, time_slot) VALUES (?, ?, ?, ?)';
    
    return await db.execute(sql, db.isVercel ? [userId, activityId, date, timeSlot] : [userId, activityId, date, timeSlot]);
  }

  // 获取用户的参与次数
  async getUserParticipationCount(userId) {
    const sql = db.isVercel
      ? 'SELECT COUNT(*) as count FROM participation_history WHERE user_id = $1'
      : 'SELECT COUNT(*) as count FROM participation_history WHERE user_id = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [userId] : [userId]);
    return result?.count || 0;
  }

  // 获取用户最近参与日期
  async getUserLastParticipationDate(userId) {
    const sql = db.isVercel
      ? 'SELECT MAX(date) as last_date FROM participation_history WHERE user_id = $1'
      : 'SELECT MAX(date) as last_date FROM participation_history WHERE user_id = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [userId] : [userId]);
    return result?.last_date || null;
  }

  // 获取某时间段的活动（含成员信息）
  async getActivityWithMembers(date, timeSlot) {
    const sql = db.isVercel ? `
      SELECT a.*,
        (SELECT COUNT(*) FROM activity_members WHERE activity_id = a.id) as member_count
      FROM activities a
      WHERE a.date = $1 AND a.time_slot = $2
    ` : `
      SELECT a.*,
        (SELECT COUNT(*) FROM activity_members WHERE activity_id = a.id) as member_count
      FROM activities a
      WHERE a.date = ? AND a.time_slot = ?
    `;
    
    return await db.queryOne(sql, db.isVercel ? [date, timeSlot] : [date, timeSlot]);
  }

  // 获取 pending 状态的活动
  async getPendingActivities() {
    const sql = db.isVercel
      ? "SELECT * FROM activities WHERE status = 'pending' ORDER BY date, time_slot"
      : "SELECT * FROM activities WHERE status = 'pending' ORDER BY date, time_slot";
    
    return await db.queryAll(sql);
  }
}

module.exports = new ActivityModel();
