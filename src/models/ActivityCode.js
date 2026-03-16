const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

class ActivityCodeModel {
  // 创建活动代码
  async create(code, name, description, createdBy, rules = {}) {
    return await db.run(`
      INSERT INTO activity_codes (code, name, description, created_by, min_players, max_players, players_per_game, require_seed, seed_required)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      code,
      name,
      description || null,
      createdBy,
      rules.minPlayers || 4,
      rules.maxPlayers || 4,
      rules.playersPerGame || 4,
      rules.requireSeed !== undefined ? (rules.requireSeed ? 1 : 0) : 1,
      rules.seedRequired !== undefined ? (rules.seedRequired ? 1 : 0) : 1
    ]);
  }

  // 获取所有活动代码
  async getAll() {
    return await db.all(`
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_users WHERE activity_code_id = ac.id) as user_count,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      ORDER BY ac.created_at DESC
    `);
  }

  // 根据 ID 获取活动代码
  async getById(id) {
    return await db.get(`
      SELECT ac.*, u.name as creator_name,
        (SELECT COUNT(*) FROM activity_code_seeds WHERE activity_code_id = ac.id) as seed_count
      FROM activity_codes ac
      LEFT JOIN users u ON ac.created_by = u.id
      WHERE ac.id = ?
    `, [id]);
  }

  // 根据代码获取活动代码
  async getByCode(code) {
    return await db.get(`
      SELECT * FROM activity_codes WHERE code = ?
    `, [code]);
  }

  // 更新活动代码
  async update(id, name, description, rules = {}) {
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

    return await db.run(`UPDATE activity_codes SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // 删除活动代码
  async delete(id) {
    return await db.run('DELETE FROM activity_codes WHERE id = ?', [id]);
  }

  // 为活动代码添加用户
  async addUser(activityCodeId, userId) {
    return await db.run(`
      INSERT OR IGNORE INTO activity_code_users (activity_code_id, user_id)
      VALUES (?, ?)
    `, [activityCodeId, userId]);
  }

  // 批量添加用户
  async addUsersBatch(activityCodeId, userIds) {
    const insertMany = db.transaction((activityCodeId, userIds) => {
      for (const userId of userIds) {
        db.run(`
          INSERT OR IGNORE INTO activity_code_users (activity_code_id, user_id)
          VALUES (?, ?)
        `, [activityCodeId, userId]);
      }
    });
    return await insertMany(activityCodeId, userIds);
  }

  // 移除活动代码中的用户
  async removeUser(activityCodeId, userId) {
    return await db.run(`
      DELETE FROM activity_code_users
      WHERE activity_code_id = ? AND user_id = ?
    `, [activityCodeId, userId]);
  }

  // 获取活动代码的所有用户
  async getUsersByCodeId(activityCodeId) {
    return await db.all(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, acu.created_at
      FROM activity_code_users acu
      JOIN users u ON acu.user_id = u.id
      WHERE acu.activity_code_id = ?
      ORDER BY acu.created_at
    `, [activityCodeId]);
  }

  // 获取用户参与的所有活动代码
  async getCodesByUserId(userId) {
    return await db.all(`
      SELECT ac.*, acu.created_at as joined_at
      FROM activity_codes ac
      JOIN activity_code_users acu ON ac.id = acu.activity_code_id
      WHERE acu.user_id = ?
      ORDER BY ac.created_at DESC
    `, [userId]);
  }

  // 检查用户是否在活动代码中
  async isUserInCode(activityCodeId, userId) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM activity_code_users
      WHERE activity_code_id = ? AND user_id = ?
    `, [activityCodeId, userId]);
    return result ? result.count > 0 : false;
  }

  // 获取活动代码的用户 ID 列表
  async getUserIdsByCodeId(activityCodeId) {
    const rows = await db.all(`
      SELECT user_id FROM activity_code_users WHERE activity_code_id = ?
    `, [activityCodeId]);
    return rows.map(r => r.user_id);
  }

  // ========== 种子选手相关方法 ==========

  // 为活动代码添加种子选手
  async addSeed(activityCodeId, userId) {
    return await db.run(`
      INSERT OR IGNORE INTO activity_code_seeds (activity_code_id, user_id)
      VALUES (?, ?)
    `, [activityCodeId, userId]);
  }

  // 批量添加种子选手
  async addSeedsBatch(activityCodeId, userIds) {
    const insertMany = db.transaction((activityCodeId, userIds) => {
      for (const userId of userIds) {
        db.run(`
          INSERT OR IGNORE INTO activity_code_seeds (activity_code_id, user_id)
          VALUES (?, ?)
        `, [activityCodeId, userId]);
      }
    });
    return await insertMany(activityCodeId, userIds);
  }

  // 移除活动代码的种子选手
  async removeSeed(activityCodeId, userId) {
    return await db.run(`
      DELETE FROM activity_code_seeds
      WHERE activity_code_id = ? AND user_id = ?
    `, [activityCodeId, userId]);
  }

  // 获取活动代码的所有种子选手
  async getSeedsByCodeId(activityCodeId) {
    return await db.all(`
      SELECT u.id, u.email, u.name, u.role, u.is_seed, acs.created_at
      FROM activity_code_seeds acs
      JOIN users u ON acs.user_id = u.id
      WHERE acs.activity_code_id = ?
      ORDER BY acs.created_at
    `, [activityCodeId]);
  }

  // 获取用户作为种子选手的活动代码
  async getCodesWhereUserIsSeed(userId) {
    return await db.all(`
      SELECT ac.*, acs.created_at as seed_since
      FROM activity_codes ac
      JOIN activity_code_seeds acs ON ac.id = acs.activity_code_id
      WHERE acs.user_id = ?
      ORDER BY ac.created_at DESC
    `, [userId]);
  }

  // 检查用户是否是活动代码的种子选手
  async isUserSeedInCode(activityCodeId, userId) {
    const result = await db.get(`
      SELECT COUNT(*) as count FROM activity_code_seeds
      WHERE activity_code_id = ? AND user_id = ?
    `, [activityCodeId, userId]);
    return result ? result.count > 0 : false;
  }

  // 获取活动代码的种子选手 ID 列表
  async getSeedIdsByCodeId(activityCodeId) {
    const rows = await db.all(`
      SELECT user_id FROM activity_code_seeds WHERE activity_code_id = ?
    `, [activityCodeId]);
    return rows.map(r => r.user_id);
  }
}

module.exports = new ActivityCodeModel();
