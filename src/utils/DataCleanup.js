const DatabaseAdapter = require('../utils/db-adapter');
const db = new DatabaseAdapter();

/**
 * 数据清理服务
 * 以活动代码表为中心，清理所有无用的数据
 */
class DataCleanupService {
  constructor() {
    this.db = db;
  }

  /**
   * 执行完整的数据清理
   * 返回清理结果统计
   */
  async cleanupAll() {
    const results = {
      availability: 0,
      teamRebuildRequests: 0,
      activityInvites: 0,
      activityCodes: 0
    };

    const transaction = this.db.transaction(() => {
      // 1. 清理无用的时间申报（activity_code 不存在）
      results.availability = this.db.run(`
        DELETE FROM availability
        WHERE activity_code IS NOT NULL
        AND activity_code NOT IN (SELECT code FROM activity_codes)
      `).changes;

      // 2. 清理无用的组队请求（activity_code 不存在）
      results.teamRebuildRequests = this.db.run(`
        DELETE FROM team_rebuild_requests
        WHERE activity_code NOT IN (SELECT code FROM activity_codes)
      `).changes;

      // 3. 清理无用的活动邀请码（activity_code_id 不存在）
      results.activityInvites = this.db.run(`
        DELETE FROM activity_invites
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `).changes;

      // 4. 清理无用的活动代码用户关联（activity_code_id 不存在）
      const activityCodeUsers = this.db.run(`
        DELETE FROM activity_code_users
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `).changes;

      // 5. 清理无用的活动代码种子选手关联（activity_code_id 不存在）
      const activityCodeSeeds = this.db.run(`
        DELETE FROM activity_code_seeds
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `).changes;

      results.activityCodes = activityCodeUsers + activityCodeSeeds;
    });

    transaction();

    return results;
  }

  /**
   * 清理无用的时间申报
   */
  async cleanupAvailability() {
    const result = this.db.run(`
      DELETE FROM availability
      WHERE activity_code IS NOT NULL
      AND activity_code NOT IN (SELECT code FROM activity_codes)
    `);
    return result.changes;
  }

  /**
   * 清理无用的组队请求
   */
  async cleanupTeamRebuildRequests() {
    const result = this.db.run(`
      DELETE FROM team_rebuild_requests
      WHERE activity_code NOT IN (SELECT code FROM activity_codes)
    `);
    return result.changes;
  }

  /**
   * 清理无用的活动邀请码
   */
  async cleanupActivityInvites() {
    const result = this.db.run(`
      DELETE FROM activity_invites
      WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
    `);
    return result.changes;
  }

  /**
   * 获取数据完整性报告
   */
  async getDataIntegrityReport() {
    const report = {
      activityCodes: 0,
      activityCodeUsers: 0,
      activityCodeSeeds: 0,
      availability: 0,
      teamRebuildRequests: 0,
      activityInvites: 0,
      orphanedAvailability: 0,
      orphanedTeamRebuildRequests: 0,
      orphanedActivityInvites: 0
    };

    // 统计活动代码数量
    report.activityCodes = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_codes
    `).get().count;

    // 统计活动代码用户关联数量
    report.activityCodeUsers = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_code_users
    `).get().count;

    // 统计活动代码种子选手关联数量
    report.activityCodeSeeds = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_code_seeds
    `).get().count;

    // 统计时间申报数量
    report.availability = this.db.prepare(`
      SELECT COUNT(*) as count FROM availability
    `).get().count;

    // 统计组队请求数量
    report.teamRebuildRequests = this.db.prepare(`
      SELECT COUNT(*) as count FROM team_rebuild_requests
    `).get().count;

    // 统计活动邀请码数量
    report.activityInvites = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_invites
    `).get().count;

    // 统计无用的时间申报
    report.orphanedAvailability = this.db.prepare(`
      SELECT COUNT(*) as count FROM availability
      WHERE activity_code IS NOT NULL
      AND activity_code NOT IN (SELECT code FROM activity_codes)
    `).get().count;

    // 统计无用的组队请求
    report.orphanedTeamRebuildRequests = this.db.prepare(`
      SELECT COUNT(*) as count FROM team_rebuild_requests
      WHERE activity_code NOT IN (SELECT code FROM activity_codes)
    `).get().count;

    // 统计无用的活动邀请码
    report.orphanedActivityInvites = this.db.prepare(`
      SELECT COUNT(*) as count FROM activity_invites
      WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
    `).get().count;

    return report;
  }
}

module.exports = new DataCleanupService();
