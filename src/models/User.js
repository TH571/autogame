/**
 * User 模型
 * 支持 SQLite 和 Vercel Postgres
 */

const db = require('../utils/database');
const bcrypt = require('bcryptjs');

class UserModel {
  // 创建用户
  async create(email, password, name, role = 'user', activityAdminId = null) {
    const sql = db.isVercel ? `
      INSERT INTO users (email, password, name, role, activity_admin_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    ` : `
      INSERT INTO users (email, password, name, role, activity_admin_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = db.isVercel 
      ? [email, password, name, role, activityAdminId]
      : [email, password, name, role, activityAdminId];
    
    return await db.insert(sql, params);
  }

  // 根据邮箱查找用户
  async findByEmail(email) {
    const sql = db.isVercel 
      ? 'SELECT * FROM users WHERE email = $1'
      : 'SELECT * FROM users WHERE email = ?';
    
    return await db.queryOne(sql, db.isVercel ? [email] : [email]);
  }

  // 根据 ID 查找用户
  async findById(id) {
    const sql = db.isVercel
      ? 'SELECT * FROM users WHERE id = $1'
      : 'SELECT * FROM users WHERE id = ?';
    
    return await db.queryOne(sql, db.isVercel ? [id] : [id]);
  }

  // 获取所有用户
  async findAll() {
    const sql = db.isVercel
      ? 'SELECT * FROM users ORDER BY id'
      : 'SELECT * FROM users ORDER BY id';
    
    const result = await db.queryAll(sql);
    return result || [];
  }

  // 获取活动管理员下的所有用户
  async findByActivityAdminId(adminId) {
    const sql = db.isVercel
      ? `SELECT * FROM users WHERE activity_admin_id = $1 OR id = $1 ORDER BY id`
      : `SELECT * FROM users WHERE activity_admin_id = ? OR id = ? ORDER BY id`;
    
    return await db.queryAll(sql, db.isVercel ? [adminId] : [adminId, adminId]);
  }

  // 获取活动管理员列表
  async findActivityAdmins() {
    const sql = db.isVercel
      ? `SELECT id, email, name, role, invite_code, created_at FROM users WHERE role = 'activity_admin' ORDER BY id`
      : `SELECT id, email, name, role, invite_code, created_at FROM users WHERE role = 'activity_admin' ORDER BY id`;
    
    return await db.queryAll(sql);
  }

  // 更新用户信息
  async update(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        if (db.isVercel) {
          fields.push(`${key} = $${paramIndex++}`);
        } else {
          fields.push(`${key} = ?`);
        }
        values.push(value);
      }
    }

    if (fields.length === 0) return 0;

    fields.push('updated_at = CURRENT_TIMESTAMP');
    
    if (db.isVercel) {
      fields.push(`id = $${paramIndex}`);
      values.push(id);
    } else {
      fields.push('id = ?');
      values.push(id);
    }

    const sql = `UPDATE users SET ${fields.join(', ')}`;
    return await db.execute(sql, values);
  }

  // 删除用户
  async delete(id) {
    const sql = db.isVercel
      ? 'DELETE FROM users WHERE id = $1'
      : 'DELETE FROM users WHERE id = ?';
    
    return await db.execute(sql, db.isVercel ? [id] : [id]);
  }

  // 验证邀请码
  async verifyInviteCode(code) {
    const sql = db.isVercel
      ? 'SELECT * FROM admin_invite_codes WHERE code = $1 AND is_used = false'
      : 'SELECT * FROM admin_invite_codes WHERE code = ? AND is_used = 0';
    
    return await db.queryOne(sql, db.isVercel ? [code] : [code]);
  }

  // 标记邀请码为已使用
  async markInviteCodeAsUsed(code, usedByUserId) {
    const sql = db.isVercel
      ? 'UPDATE admin_invite_codes SET is_used = true, used_by = $2 WHERE code = $1'
      : 'UPDATE admin_invite_codes SET is_used = 1, used_by = ? WHERE code = ?';
    
    const params = db.isVercel ? [code, usedByUserId] : [code, usedByUserId];
    return await db.execute(sql, params);
  }

  // 生成邀请码
  async generateInviteCode(adminId) {
    const code = 'INV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    
    const sql = db.isVercel
      ? 'INSERT INTO admin_invite_codes (admin_id, code, is_used) VALUES ($1, $2, false) RETURNING id'
      : 'INSERT INTO admin_invite_codes (admin_id, code, is_used) VALUES (?, ?, 0)';
    
    await db.insert(sql, db.isVercel ? [adminId, code] : [adminId, code]);
    return code;
  }

  // 获取活动管理员的邀请码
  async getInviteCode(adminId) {
    const sql = db.isVercel
      ? `SELECT code, is_used, used_by, created_at FROM admin_invite_codes WHERE admin_id = $1 AND is_used = false ORDER BY created_at DESC LIMIT 1`
      : `SELECT code, is_used, used_by, created_at FROM admin_invite_codes WHERE admin_id = ? AND is_used = 0 ORDER BY created_at DESC LIMIT 1`;
    
    return await db.queryOne(sql, db.isVercel ? [adminId] : [adminId]);
  }
}

module.exports = new UserModel();
