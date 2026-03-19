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

    try {
      // 1. 清理无用的时间申报（activity_code 不存在）
      const availResult = await this.db.run(`
        DELETE FROM availability
        WHERE activity_code IS NOT NULL
        AND activity_code NOT IN (SELECT code FROM activity_codes)
      `);
      results.availability = availResult.changes || 0;

      // 2. 清理无用的组队请求（activity_code 不存在）
      const reqResult = await this.db.run(`
        DELETE FROM team_rebuild_requests
        WHERE activity_code NOT IN (SELECT code FROM activity_codes)
      `);
      results.teamRebuildRequests = reqResult.changes || 0;

      // 3. 清理无用的活动邀请码（activity_code_id 不存在）
      const inviteResult = await this.db.run(`
        DELETE FROM activity_invites
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `);
      results.activityInvites = inviteResult.changes || 0;

      // 4. 清理无用的活动代码用户关联（activity_code_id 不存在）
      const userResult = await this.db.run(`
        DELETE FROM activity_code_users
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `);
      results.activityCodes += userResult.changes || 0;

      // 5. 清理无用的活动代码种子选手关联（activity_code_id 不存在）
      const seedResult = await this.db.run(`
        DELETE FROM activity_code_seeds
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `);
      results.activityCodes += seedResult.changes || 0;
    } catch (error) {
      console.error('数据清理错误:', error);
      throw error;
    }

    return results;
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

    try {
      // 统计活动代码数量
      const acResult = await this.db.get(`SELECT COUNT(*) as count FROM activity_codes`);
      report.activityCodes = acResult ? acResult.count : 0;

      // 统计活动代码用户关联数量
      const acuResult = await this.db.get(`SELECT COUNT(*) as count FROM activity_code_users`);
      report.activityCodeUsers = acuResult ? acuResult.count : 0;

      // 统计活动代码种子选手关联数量
      const acsResult = await this.db.get(`SELECT COUNT(*) as count FROM activity_code_seeds`);
      report.activityCodeSeeds = acsResult ? acsResult.count : 0;

      // 统计时间申报数量
      const availResult = await this.db.get(`SELECT COUNT(*) as count FROM availability`);
      report.availability = availResult ? availResult.count : 0;

      // 统计组队请求数量
      const reqResult = await this.db.get(`SELECT COUNT(*) as count FROM team_rebuild_requests`);
      report.teamRebuildRequests = reqResult ? reqResult.count : 0;

      // 统计活动邀请码数量
      const inviteResult = await this.db.get(`SELECT COUNT(*) as count FROM activity_invites`);
      report.activityInvites = inviteResult ? inviteResult.count : 0;

      // 统计无用的时间申报
      const orphAvailResult = await this.db.get(`
        SELECT COUNT(*) as count FROM availability
        WHERE activity_code IS NOT NULL
        AND activity_code NOT IN (SELECT code FROM activity_codes)
      `);
      report.orphanedAvailability = orphAvailResult ? orphAvailResult.count : 0;

      // 统计无用的组队请求
      const orphReqResult = await this.db.get(`
        SELECT COUNT(*) as count FROM team_rebuild_requests
        WHERE activity_code NOT IN (SELECT code FROM activity_codes)
      `);
      report.orphanedTeamRebuildRequests = orphReqResult ? orphReqResult.count : 0;

      // 统计无用的活动邀请码
      const orphInviteResult = await this.db.get(`
        SELECT COUNT(*) as count FROM activity_invites
        WHERE activity_code_id NOT IN (SELECT id FROM activity_codes)
      `);
      report.orphanedActivityInvites = orphInviteResult ? orphInviteResult.count : 0;
    } catch (error) {
      console.error('获取数据报告错误:', error);
      throw error;
    }

    return report;
  }
}

module.exports = new DataCleanupService();
