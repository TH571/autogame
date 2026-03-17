const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class ActivityInviteModel {
  // 创建邀请码
  async create(activityCodeId, createdBy, maxUses = 1) {
    const inviteCode = this.generateInviteCode();
    const result = await db.run(`
      INSERT INTO activity_invites (activity_code_id, invite_code, created_by, max_uses)
      VALUES (?, ?, ?, ?)
    `, [activityCodeId, inviteCode, createdBy, maxUses]);
    
    // 返回完整的邀请码信息
    return await this.getByCode(inviteCode);
  }

  // 根据邀请码查找
  async getByCode(inviteCode) {
    return await db.get(`
      SELECT ai.*, ac.name as activity_name, ac.code as activity_code,
             u.name as creator_name, u.email as creator_email
      FROM activity_invites ai
      LEFT JOIN activity_codes ac ON ai.activity_code_id = ac.id
      LEFT JOIN users u ON ai.created_by = u.id
      WHERE ai.invite_code = ?
    `, [inviteCode]);
  }

  // 检查邀请码是否可用
  async isAvailable(inviteCode) {
    const invite = await this.getByCode(inviteCode);
    if (!invite) return false;
    if (invite.is_used === 1) return false;
    return true;
  }

  // 标记邀请码为已使用
  async markAsUsed(inviteCode, usedBy) {
    return await db.run(`
      UPDATE activity_invites
      SET is_used = 1, used_by = ?, used_at = CURRENT_TIMESTAMP
      WHERE invite_code = ?
    `, [usedBy, inviteCode]);
  }

  // 获取活动的所有邀请码
  async getByActivityCodeId(activityCodeId) {
    return await db.all(`
      SELECT ai.*, u.name as creator_name
      FROM activity_invites ai
      LEFT JOIN users u ON ai.created_by = u.id
      WHERE ai.activity_code_id = ?
      ORDER BY ai.created_at DESC
    `, [activityCodeId]);
  }

  // 删除邀请码
  async delete(inviteCode) {
    return await db.run(`
      DELETE FROM activity_invites WHERE invite_code = ?
    `, [inviteCode]);
  }

  // 生成邀请码（8 位字母数字组合）
  generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'INV-';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if (i === 3) code += '-';
    }
    return code;
  }
}

module.exports = new ActivityInviteModel();
