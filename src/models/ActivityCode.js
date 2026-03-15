const { getDb } = require('../utils/init-db');

class ActivityCodeModel {
  constructor() {
    this.db = getDb();
  }

  // 创建活动代码
  create(code, name, description, createdBy, rules = {}) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO activity_codes (code, name, description, created_by, min_players, max_players, players_per_game, require_seed, seed_required)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      return stmt.run(
        code,
        name,
        description || null,
        createdBy,
        rules.minPlayers || 4,
        rules.maxPlayers || 4,
        rules.playersPerGame || 4,
        rules.requireSeed !== undefined ? (rules.requireSeed ? 1 : 0) : 1,
        rules.seedRequired !== undefined ? (rules.seedRequired ? 1 : 0) : 1
      );
    } catch (error) {
      console.error('创建活动代码失败:', error.message);
      throw error;
    }
  }

  // 获取所有活动代码
  getAll() {
    const stmt = this.db.prepare(`
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_users WHERE activity_code_id = ac.id) as user_count,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      ORDER BY ac.created_at DESC
    `);
    return stmt.all();
  }

  // 根据 ID 获取活动代码
  getById(id) {
    const stmt = this.db.prepare(`
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      WHERE ac.id = ?
    `);
    return stmt.get(id);
  }

  // 根据代码获取活动代码
  getByCode(code) {
    const stmt = this.db.prepare(`
      SELECT * FROM activity_codes WHERE code = ?
    `);
    return stmt.get(code);
  }

  // 更新活动代码
  update(id, name, description, rules = {}) {
    const fields = ['name = ?', 'description = ?'];
    const values = [name, description];

    if (rules.minPlayers !== undefined) {
      fields.push('min_players = ?');
      values.push(rules.minPlayers);
    }
    if (rules.maxPlayers !== undefined) {
      fields.push('max_players = ?');
      values.push(rules.maxPlayers);
    }
    if (rules.playersPerGame !== undefined) {
      fields.push('players_per_game = ?');
      values.push(rules.playersPerGame);
    }
    if (rules.requireSeed !== undefined) {
      fields.push('require_seed = ?');
      values.push(rules.requireSeed ? 1 : 0);
    }
    if (rules.seedRequired !== undefined) {
      fields.push('seed_required = ?');
      values.push(rules.seedRequired ? 1 : 0);
    }

    values.push(id);

    const stmt = this.db.prepare(`UPDATE activity_codes SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  }

  // 删除活动代码
  delete(id) {
    const stmt = this.db.prepare('DELETE FROM activity_codes WHERE id = ?');
    return stmt.run(id);
  }

  // 为活动代码添加用户
  addUser(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_code_users (activity_code_id, user_id)
      VALUES (?, ?)
    `);
    return stmt.run(activityCodeId, userId);
  }

  // 批量添加用户
  addUsersBatch(activityCodeId, userIds) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_code_users (activity_code_id, user_id)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((activityCodeId, userIds) => {
      for (const userId of userIds) {
        stmt.run(activityCodeId, userId);
      }
    });

    return insertMany(activityCodeId, userIds);
  }

  // 移除活动代码中的用户
  removeUser(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      DELETE FROM activity_code_users
      WHERE activity_code_id = ? AND user_id = ?
    `);
    return stmt.run(activityCodeId, userId);
  }

  // 获取活动代码的所有用户
  getUsersByCodeId(activityCodeId) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, acu.created_at
      FROM activity_code_users acu
      JOIN users u ON acu.user_id = u.id
      WHERE acu.activity_code_id = ?
      ORDER BY acu.created_at
    `);
    return stmt.all(activityCodeId);
  }

  // 获取用户参与的所有活动代码
  getCodesByUserId(userId) {
    const stmt = this.db.prepare(`
      SELECT ac.*, acu.created_at as joined_at
      FROM activity_codes ac
      JOIN activity_code_users acu ON ac.id = acu.activity_code_id
      WHERE acu.user_id = ?
      ORDER BY ac.created_at DESC
    `);
    return stmt.all(userId);
  }

  // 检查用户是否在活动代码中
  isUserInCode(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_code_users
      WHERE activity_code_id = ? AND user_id = ?
    `);
    return stmt.get(activityCodeId, userId).count > 0;
  }

  // 获取活动代码的用户 ID 列表
  getUserIdsByCodeId(activityCodeId) {
    const stmt = this.db.prepare(`
      SELECT user_id FROM activity_code_users WHERE activity_code_id = ?
    `);
    const rows = stmt.all(activityCodeId);
    return rows.map(r => r.user_id);
  }

  // ========== 种子选手相关方法 ==========

  // 为活动代码添加种子选手
  addSeed(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_code_seeds (activity_code_id, user_id)
      VALUES (?, ?)
    `);
    return stmt.run(activityCodeId, userId);
  }

  // 批量添加种子选手
  addSeedsBatch(activityCodeId, userIds) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO activity_code_seeds (activity_code_id, user_id)
      VALUES (?, ?)
    `);

    const insertMany = this.db.transaction((activityCodeId, userIds) => {
      for (const userId of userIds) {
        stmt.run(activityCodeId, userId);
      }
    });

    return insertMany(activityCodeId, userIds);
  }

  // 移除活动代码的种子选手
  removeSeed(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      DELETE FROM activity_code_seeds
      WHERE activity_code_id = ? AND user_id = ?
    `);
    return stmt.run(activityCodeId, userId);
  }

  // 获取活动代码的所有种子选手
  getSeedsByCodeId(activityCodeId) {
    const stmt = this.db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, acs.created_at
      FROM activity_code_seeds acs
      JOIN users u ON acs.user_id = u.id
      WHERE acs.activity_code_id = ?
      ORDER BY acs.created_at
    `);
    return stmt.all(activityCodeId);
  }

  // 获取用户作为种子选手的活动代码
  getCodesWhereUserIsSeed(userId) {
    const stmt = this.db.prepare(`
      SELECT ac.*, acs.created_at as seed_since
      FROM activity_codes ac
      JOIN activity_code_seeds acs ON ac.id = acs.activity_code_id
      WHERE acs.user_id = ?
      ORDER BY ac.created_at DESC
    `);
    return stmt.all(userId);
  }

  // 检查用户是否是活动代码的种子选手
  isUserSeedInCode(activityCodeId, userId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_code_seeds
      WHERE activity_code_id = ? AND user_id = ?
    `);
    return stmt.get(activityCodeId, userId).count > 0;
  }

  // 获取活动代码的种子选手 ID 列表
  getSeedIdsByCodeId(activityCodeId) {
    const stmt = this.db.prepare(`
      SELECT user_id FROM activity_code_seeds WHERE activity_code_id = ?
    `);
    const rows = stmt.all(activityCodeId);
    return rows.map(r => r.user_id);
  }
}

module.exports = new ActivityCodeModel();
