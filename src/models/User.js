const { getDb } = require('../utils/init-db');

class UserModel {
  constructor() {
    this.db = getDb();
  }

  // 创建用户
  create(email, password, name, role = 'user', activityAdminId = null) {
    const stmt = this.db.prepare(`
      INSERT INTO users (email, password, name, role, activity_admin_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(email, password, name, role, activityAdminId);
  }

  // 根据邮箱查找用户
  findByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  // 根据 ID 查找用户
  findById(id) {
    const stmt = this.db.prepare('SELECT id, email, name, role, is_seed, activity_admin_id, invite_code, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // 获取所有用户（超级管理员）
  findAll() {
    const stmt = this.db.prepare('SELECT id, email, name, role, is_seed, activity_admin_id, invite_code, created_at FROM users ORDER BY id');
    return stmt.all();
  }

  // 获取活动管理员下的所有用户
  findByActivityAdminId(adminId) {
    const stmt = this.db.prepare(`
      SELECT id, email, name, role, is_seed, activity_admin_id, created_at 
      FROM users 
      WHERE activity_admin_id = ? OR id = ?
      ORDER BY id
    `);
    return stmt.all(adminId, adminId);
  }

  // 获取种子选手
  findSeed() {
    const stmt = this.db.prepare('SELECT * FROM users WHERE is_seed = 1 LIMIT 1');
    return stmt.get();
  }

  // 获取活动管理员
  findActivityAdmins() {
    const stmt = this.db.prepare(`
      SELECT id, email, name, role, invite_code, created_at 
      FROM users 
      WHERE role = 'activity_admin'
      ORDER BY id
    `);
    return stmt.all();
  }

  // 更新用户信息
  update(id, data) {
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
    
    const stmt = this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }

  // 删除用户
  delete(id) {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  }

  // 获取普通用户（排除管理员）
  findRegularUsers() {
    const stmt = this.db.prepare(`
      SELECT id, email, name, role, is_seed, activity_admin_id, created_at 
      FROM users 
      WHERE role = 'user'
      ORDER BY id
    `);
    return stmt.all();
  }

  // 验证邀请码
  verifyInviteCode(code) {
    const stmt = this.db.prepare(`
      SELECT admin_id FROM admin_invite_codes WHERE code = ?
    `);
    return stmt.get(code);
  }

  // 为活动管理员生成邀请码
  generateInviteCode(adminId) {
    const code = 'INV' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
    const stmt = this.db.prepare(`
      INSERT INTO admin_invite_codes (admin_id, code)
      VALUES (?, ?)
    `);
    stmt.run(adminId, code);
    return code;
  }

  // 获取活动管理员的邀请码
  getInviteCode(adminId) {
    const stmt = this.db.prepare(`
      SELECT code FROM admin_invite_codes WHERE admin_id = ? ORDER BY created_at DESC LIMIT 1
    `);
    return stmt.get(adminId);
  }
}

module.exports = new UserModel();
