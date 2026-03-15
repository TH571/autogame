/**
 * ActivityCode 模型
 * 支持 SQLite 和 Vercel Postgres
 */

const db = require('../utils/database');

class ActivityCodeModel {
  // 创建活动代码
  async create(code, name, description, createdBy, rules = {}) {
    const sql = db.isVercel ? `
      INSERT INTO activity_codes (code, name, description, created_by, min_players, max_players, players_per_game, require_seed, seed_required)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    ` : `
      INSERT INTO activity_codes (code, name, description, created_by, min_players, max_players, players_per_game, require_seed, seed_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      code,
      name,
      description || null,
      createdBy,
      rules.minPlayers || 4,
      rules.maxPlayers || 4,
      rules.playersPerGame || 4,
      rules.requireSeed !== undefined ? rules.requireSeed : true,
      rules.seedRequired !== undefined ? rules.seedRequired : true
    ];
    
    return await db.insert(sql, db.isVercel ? params : params);
  }

  // 获取所有活动代码
  async getAll() {
    const sql = db.isVercel ? `
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_users WHERE activity_code_id = ac.id) as user_count,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      ORDER BY ac.created_at DESC
    ` : `
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_users WHERE activity_code_id = ac.id) as user_count,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      ORDER BY ac.created_at DESC
    `;
    
    return await db.queryAll(sql);
  }

  // 根据 ID 获取活动代码
  async getById(id) {
    const sql = db.isVercel
      ? 'SELECT * FROM activity_codes WHERE id = $1'
      : 'SELECT * FROM activity_codes WHERE id = ?';
    
    return await db.queryOne(sql, db.isVercel ? [id] : [id]);
  }

  // 根据代码获取活动代码
  async getByCode(code) {
    const sql = db.isVercel
      ? 'SELECT * FROM activity_codes WHERE code = $1'
      : 'SELECT * FROM activity_codes WHERE code = ?';
    
    return await db.queryOne(sql, db.isVercel ? [code] : [code]);
  }

  // 更新活动代码
  async update(id, name, description, rules = {}) {
    const fields = [];
    const values = [];
    
    if (name) {
      fields.push(db.isVercel ? 'name = $' : 'name = ?');
      values.push(name);
    }
    
    if (description !== undefined) {
      fields.push(db.isVercel ? 'description = $' : 'description = ?');
      values.push(description);
    }
    
    if (rules.minPlayers !== undefined) {
      fields.push(db.isVercel ? 'min_players = $' : 'min_players = ?');
      values.push(rules.minPlayers);
    }
    
    if (rules.maxPlayers !== undefined) {
      fields.push(db.isVercel ? 'max_players = $' : 'max_players = ?');
      values.push(rules.maxPlayers);
    }
    
    if (rules.playersPerGame !== undefined) {
      fields.push(db.isVercel ? 'players_per_game = $' : 'players_per_game = ?');
      values.push(rules.playersPerGame);
    }
    
    if (rules.requireSeed !== undefined) {
      fields.push(db.isVercel ? 'require_seed = $' : 'require_seed = ?');
      values.push(rules.requireSeed);
    }
    
    if (rules.seedRequired !== undefined) {
      fields.push(db.isVercel ? 'seed_required = $' : 'seed_required = ?');
      values.push(rules.seedRequired);
    }
    
    if (fields.length === 0) return 0;
    
    fields.push(db.isVercel ? 'id = $' : 'id = ?');
    values.push(id);
    
    // 为 Postgres 设置参数索引
    if (db.isVercel) {
      for (let i = 0; i < fields.length; i++) {
        fields[i] = fields[i] + (i + 1);
      }
    }
    
    const sql = `UPDATE activity_codes SET ${fields.join(', ')}`;
    return await db.execute(sql, db.isVercel ? values : values);
  }

  // 删除活动代码
  async delete(id) {
    const sql = db.isVercel
      ? 'DELETE FROM activity_codes WHERE id = $1'
      : 'DELETE FROM activity_codes WHERE id = ?';
    
    return await db.execute(sql, db.isVercel ? [id] : [id]);
  }

  // 为活动代码添加用户
  async addUser(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'INSERT INTO activity_code_users (activity_code_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO activity_code_users (activity_code_id, user_id) VALUES (?, ?)';
    
    return await db.execute(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
  }

  // 批量添加用户
  async addUsersBatch(activityCodeId, userIds) {
    for (const userId of userIds) {
      await this.addUser(activityCodeId, userId);
    }
  }

  // 移除活动代码中的用户
  async removeUser(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'DELETE FROM activity_code_users WHERE activity_code_id = $1 AND user_id = $2'
      : 'DELETE FROM activity_code_users WHERE activity_code_id = ? AND user_id = ?';
    
    return await db.execute(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
  }

  // 获取活动代码的所有用户
  async getUsersByCodeId(activityCodeId) {
    const sql = db.isVercel
      ? `SELECT u.id, u.email, u.name, u.role, u.is_seed, acu.created_at
         FROM activity_code_users acu
         JOIN users u ON acu.user_id = u.id
         WHERE acu.activity_code_id = $1
         ORDER BY acu.created_at`
      : `SELECT u.id, u.email, u.name, u.role, u.is_seed, acu.created_at
         FROM activity_code_users acu
         JOIN users u ON acu.user_id = u.id
         WHERE acu.activity_code_id = ?
         ORDER BY acu.created_at`;
    
    return await db.queryAll(sql, db.isVercel ? [activityCodeId] : [activityCodeId]);
  }

  // 获取用户参与的所有活动代码
  async getCodesByUserId(userId) {
    const sql = db.isVercel
      ? `SELECT ac.*, acu.created_at as joined_at
         FROM activity_codes ac
         JOIN activity_code_users acu ON ac.id = acu.activity_code_id
         WHERE acu.user_id = $1
         ORDER BY ac.created_at DESC`
      : `SELECT ac.*, acu.created_at as joined_at
         FROM activity_codes ac
         JOIN activity_code_users acu ON ac.id = acu.activity_code_id
         WHERE acu.user_id = ?
         ORDER BY ac.created_at DESC`;
    
    return await db.queryAll(sql, db.isVercel ? [userId] : [userId]);
  }

  // 检查用户是否在活动代码中
  async isUserInCode(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'SELECT COUNT(*) as count FROM activity_code_users WHERE activity_code_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*) as count FROM activity_code_users WHERE activity_code_id = ? AND user_id = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
    return (result?.count || 0) > 0;
  }

  // ========== 种子选手相关方法 ==========

  // 为活动代码添加种子选手
  async addSeed(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'INSERT INTO activity_code_seeds (activity_code_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
      : 'INSERT OR IGNORE INTO activity_code_seeds (activity_code_id, user_id) VALUES (?, ?)';
    
    return await db.execute(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
  }

  // 批量添加种子选手
  async addSeedsBatch(activityCodeId, userIds) {
    for (const userId of userIds) {
      await this.addSeed(activityCodeId, userId);
    }
  }

  // 移除活动代码的种子选手
  async removeSeed(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'DELETE FROM activity_code_seeds WHERE activity_code_id = $1 AND user_id = $2'
      : 'DELETE FROM activity_code_seeds WHERE activity_code_id = ? AND user_id = ?';
    
    return await db.execute(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
  }

  // 获取活动代码的所有种子选手
  async getSeedsByCodeId(activityCodeId) {
    const sql = db.isVercel
      ? `SELECT u.id, u.email, u.name, u.role, u.is_seed, acs.created_at
         FROM activity_code_seeds acs
         JOIN users u ON acs.user_id = u.id
         WHERE acs.activity_code_id = $1
         ORDER BY acs.created_at`
      : `SELECT u.id, u.email, u.name, u.role, u.is_seed, acs.created_at
         FROM activity_code_seeds acs
         JOIN users u ON acs.user_id = u.id
         WHERE acs.activity_code_id = ?
         ORDER BY acs.created_at`;
    
    return await db.queryAll(sql, db.isVercel ? [activityCodeId] : [activityCodeId]);
  }

  // 获取用户作为种子选手的活动代码
  async getCodesWhereUserIsSeed(userId) {
    const sql = db.isVercel
      ? `SELECT ac.*, acs.created_at as seed_since
         FROM activity_codes ac
         JOIN activity_code_seeds acs ON ac.id = acs.activity_code_id
         WHERE acs.user_id = $1
         ORDER BY ac.created_at DESC`
      : `SELECT ac.*, acs.created_at as seed_since
         FROM activity_codes ac
         JOIN activity_code_seeds acs ON ac.id = acs.activity_code_id
         WHERE acs.user_id = ?
         ORDER BY ac.created_at DESC`;
    
    return await db.queryAll(sql, db.isVercel ? [userId] : [userId]);
  }

  // 检查用户是否是活动代码的种子选手
  async isUserSeedInCode(activityCodeId, userId) {
    const sql = db.isVercel
      ? 'SELECT COUNT(*) as count FROM activity_code_seeds WHERE activity_code_id = $1 AND user_id = $2'
      : 'SELECT COUNT(*) as count FROM activity_code_seeds WHERE activity_code_id = ? AND user_id = ?';
    
    const result = await db.queryOne(sql, db.isVercel ? [activityCodeId, userId] : [activityCodeId, userId]);
    return (result?.count || 0) > 0;
  }
}

module.exports = new ActivityCodeModel();
