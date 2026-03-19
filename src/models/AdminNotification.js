const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class AdminNotificationModel {
  // 创建通知
  async create(adminId, userId, title, content, type = 'rebuild_request', relatedId = null, relatedType = null) {
    return await db.run(`
      INSERT INTO admin_notifications (admin_id, user_id, title, content, type, related_id, related_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [adminId, userId, title, content, type, relatedId, relatedType]);
  }

  // 获取管理员的未读通知数量
  async getUnreadCount(adminId) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM admin_notifications
      WHERE admin_id = ? AND is_read = 0
    `, [adminId]);
    return result ? result.count : 0;
  }

  // 获取管理员的所有通知
  async getAll(adminId, limit = 50) {
    return await db.all(`
      SELECT n.*, u.name as user_name, u.email as user_email
      FROM admin_notifications n
      JOIN users u ON n.user_id = u.id
      WHERE n.admin_id = ?
      ORDER BY n.is_read ASC, n.created_at DESC
      LIMIT ?
    `, [adminId, limit]);
  }

  // 获取管理员的未读通知
  async getUnread(adminId) {
    return await db.all(`
      SELECT n.*, u.name as user_name, u.email as user_email
      FROM admin_notifications n
      JOIN users u ON n.user_id = u.id
      WHERE n.admin_id = ? AND n.is_read = 0
      ORDER BY n.created_at DESC
    `, [adminId]);
  }

  // 标记通知为已读
  async markAsRead(id) {
    return await db.run(`
      UPDATE admin_notifications
      SET is_read = 1
      WHERE id = ?
    `, [id]);
  }

  // 批量标记为已读
  async markAllAsRead(adminId) {
    return await db.run(`
      UPDATE admin_notifications
      SET is_read = 1
      WHERE admin_id = ?
    `, [adminId]);
  }

  // 删除通知
  async delete(id) {
    return await db.run(`
      DELETE FROM admin_notifications
      WHERE id = ?
    `, [id]);
  }

  // 获取活动管理员 ID
  async getActivityAdminId(activityCode) {
    const ActivityCode = require('./ActivityCode');
    const activityCodeData = await ActivityCode.getByCode(activityCode);
    if (activityCodeData && activityCodeData.created_by) {
      return activityCodeData.created_by;
    }
    return null;
  }
}

module.exports = new AdminNotificationModel();
