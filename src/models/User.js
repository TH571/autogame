const { getDb } = require('../utils/init-db');

class UserModel {
  constructor() {
    this.db = getDb();
  }

  // 创建用户
  create(email, password, name, role = 'user') {
    const stmt = this.db.prepare(`
      INSERT INTO users (email, password, name, role)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(email, password, name, role);
  }

  // 根据邮箱查找用户
  findByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }

  // 根据 ID 查找用户
  findById(id) {
    const stmt = this.db.prepare('SELECT id, email, name, role, is_seed, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  }

  // 获取所有用户
  findAll() {
    const stmt = this.db.prepare('SELECT id, email, name, role, is_seed, created_at FROM users ORDER BY id');
    return stmt.all();
  }

  // 获取种子选手
  findSeed() {
    const stmt = this.db.prepare('SELECT * FROM users WHERE is_seed = 1 LIMIT 1');
    return stmt.get();
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

  // 获取所有普通用户（非管理员、非种子）
  findRegularUsers() {
    const stmt = this.db.prepare(`
      SELECT id, email, name, role, is_seed, created_at 
      FROM users 
      WHERE role = 'user' AND is_seed = 0
      ORDER BY id
    `);
    return stmt.all();
  }
}

module.exports = new UserModel();
