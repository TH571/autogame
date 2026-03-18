const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class TeamRebuildRequestModel {
  // 创建组队请求
  async create(userId, activityCode, date, timeSlot, reason = '') {
    return await db.run(`
      INSERT INTO team_rebuild_requests (user_id, activity_code, date, time_slot, reason)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, activityCode, date, timeSlot, reason]);
  }

  // 获取用户的待处理请求
  async getPendingByUser(userId) {
    return await db.all(`
      SELECT * FROM team_rebuild_requests
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `, [userId]);
  }

  // 获取所有待处理的请求（管理员）
  async getAllPending() {
    return await db.all(`
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM team_rebuild_requests r
      JOIN users u ON r.user_id = u.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `);
  }

  // 获取请求详情
  async getById(id) {
    return await db.get(`
      SELECT r.*, u.name as user_name, u.email as user_email
      FROM team_rebuild_requests r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `, [id]);
  }

  // 更新请求状态
  async updateStatus(id, status, adminId, adminNote = '') {
    return await db.run(`
      UPDATE team_rebuild_requests
      SET status = ?, admin_id = ?, admin_note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, adminId, adminNote, id]);
  }

  // 检查是否存在待处理的请求
  async hasPendingRequest(userId, activityCode, date, timeSlot) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM team_rebuild_requests
      WHERE user_id = ? AND activity_code = ? AND date = ? AND time_slot = ? AND status = 'pending'
    `, [userId, activityCode, date, timeSlot]);
    return result ? result.count > 0 : false;
  }

  // 删除请求
  async delete(id) {
    return await db.run('DELETE FROM team_rebuild_requests WHERE id = ?', [id]);
  }
}

module.exports = new TeamRebuildRequestModel();
