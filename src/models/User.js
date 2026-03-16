const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class UserModel {
  // 创建用户
  async create(email, password, name, role = 'user', activityAdminId = null) {
    return await db.run(`
      INSERT INTO users (email, password, name, role, activity_admin_id)
      VALUES (?, ?, ?, ?, ?)
    `, [email, password, name, role, activityAdminId]);
  }

  // 根据邮箱查找用户
  async findByEmail(email) {
    return await db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  // 根据 ID 查找用户
  async findById(id) {
    return await db.get('SELECT id, email, name, role, is_seed, activity_admin_id, invite_code, created_at FROM users WHERE id = ?', [id]);
  }

  // 获取所有用户（超级管理员）
  async findAll() {
    return await db.all('SELECT id, email, name, role, is_seed, activity_admin_id, invite_code, created_at FROM users ORDER BY id');
  }

  // 获取活动管理员下的所有用户
  async findByActivityAdminId(adminId) {
    return await db.all(`
      SELECT id, email, name, role, is_seed, activity_admin_id, created_at
      FROM users
      WHERE activity_admin_id = ? OR id = ?
      ORDER BY id
    `, [adminId, adminId]);
  }

  // 获取种子选手
  async findSeed() {
    return await db.get('SELECT * FROM users WHERE is_seed = 1 LIMIT 1');
  }

  // 获取活动管理员
  async findActivityAdmins() {
    return await db.all(`
      SELECT id, email, name, role, invite_code, created_at
      FROM users
      WHERE role = 'activity_admin'
      ORDER BY id
    `);
  }

  // 更新用户信息
  async update(id, data) {
    const fields = [];
    const values = [];

    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.password !== undefined) {
      fields.push('password = ?');
      values.push(data.password);
    }
    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.role !== undefined) {
      fields.push('role = ?');
      values.push(data.role);
    }
    if (data.is_seed !== undefined) {
      fields.push('is_seed = ?');
      values.push(data.is_seed);
    }
    if (data.activity_admin_id !== undefined) {
      fields.push('activity_admin_id = ?');
      values.push(data.activity_admin_id);
    }

    if (fields.length === 0) return null;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    return await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // 删除用户
  async delete(id) {
    return await db.run('DELETE FROM users WHERE id = ?', [id]);
  }

  // 获取普通用户（排除管理员）
  async findRegularUsers() {
    return await db.all(`
      SELECT id, email, name, role, is_seed, activity_admin_id, created_at
      FROM users
      WHERE role = 'user'
      ORDER BY id
    `);
  }

  // 验证邀请码
  async verifyInviteCode(code) {
    return await db.get(`
      SELECT * FROM admin_invite_codes WHERE code = ? AND is_used = 0
    `, [code]);
  }

  // 标记邀请码为已使用
  async markInviteCodeAsUsed(code, usedByUserId) {
    return await db.run(`
      UPDATE admin_invite_codes
      SET is_used = 1, used_by = ?
      WHERE code = ?
    `, [usedByUserId, code]);
  }

  // 为活动管理员生成邀请码
  async generateInviteCode(adminId) {
    const code = 'INV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    await db.run(`
      INSERT INTO admin_invite_codes (admin_id, code, is_used, used_by)
      VALUES (?, ?, 0, NULL)
    `, [adminId, code]);
    return code;
  }

  // 获取活动管理员的邀请码
  async getInviteCode(adminId) {
    return await db.get(`
      SELECT code, is_used, used_by, created_at
      FROM admin_invite_codes
      WHERE admin_id = ? AND is_used = 0
      ORDER BY created_at DESC
      LIMIT 1
    `, [adminId]);
  }
}

module.exports = new UserModel();
