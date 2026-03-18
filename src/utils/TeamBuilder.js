const { getDb } = require('../utils/init-db');
const Activity = require('../models/Activity');
const Availability = require('../models/Availability');
const User = require('../models/User');
const ActivityCode = require('../models/ActivityCode');

/**
 * 自动组队服务
 *
 * 规则：
 * 1. 每队 4 人
 * 2. 种子选手必须参加每场活动
 * 3. 普通用户需轮流参与，避免连续被选
 * 4. ≥4 人有时空即可组队
 * 5. 保证每位用户在未来 14 天内至少参与一次（如果可能）
 * 6. 只有相同活动代码的用户才会被组队
 */
class TeamBuilderService {
  constructor() {
    this.db = getDb();
  }

  /**
   * 执行自动组队
   * 遍历未来 14 天，检查每个时间段，进行组队
   */
  async buildTeams(activityCode = null) {
    const results = [];
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 13); // 未来 14 天

    // 获取种子选手
    const seedUser = await User.findSeed();
    if (!seedUser) {
      console.log('未找到种子选手，无法进行组队');
      return { success: false, error: '未找到种子选手' };
    }

    console.log(`开始自动组队，种子选手：${seedUser.name} (${seedUser.email})`);
    if (activityCode) {
      console.log(`活动代码：${activityCode}`);
    }

    // 遍历未来 14 天的每一天
    for (let i = 0; i < 14; i++) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() + i);
      const dateStr = this.formatDate(currentDate);

      // 检查两个时间段（只计算下午和晚上）
      for (let timeSlot = 1; timeSlot <= 2; timeSlot++) {
        const result = await this.buildTeamForSlot(dateStr, timeSlot, seedUser, activityCode, results);
        if (result) {
          results.push(result);
        }
      }
    }

    console.log(`自动组队完成，共创建 ${results.length} 个活动`);
    return { success: true, results };
  }

  /**
   * 为特定日期和时间段组建队伍
   */
  async buildTeamForSlot(date, timeSlot, seedUser, activityCode = null, previousResults = []) {
    // 获取该时间段所有可用的用户
    let availableUsers;
    if (activityCode) {
      availableUsers = await Availability.getByDateSlotAndCode(date, timeSlot, activityCode);
    } else {
      availableUsers = await Availability.getByDateAndSlot(date, timeSlot);
    }

    if (availableUsers.length < 4) {
      // 不足 4 人，无法组队
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 只有 ${availableUsers.length} 人可用，不足 4 人`);
      return null;
    }

    // 【新增】如果指定了活动代码，根据活动规则进行组队
    let activityRules = null;
    let associatedUserIds = [];
    if (activityCode) {
      const ActivityCodeModel = require('../models/ActivityCode');
      const activityCodeData = await ActivityCodeModel.getById(activityCode);
      if (!activityCodeData) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 活动代码不存在`);
        return null;
      }

      // 获取活动规则
      activityRules = {
        minPlayers: activityCodeData.min_players || 4,
        maxPlayers: activityCodeData.max_players || 4,
        playersPerGame: activityCodeData.players_per_game || 4,
        requireSeed: activityCodeData.require_seed === 1,
        seedRequired: activityCodeData.seed_required === 1
      };

      // 获取活动代码的所有关联用户 ID
      associatedUserIds = await ActivityCodeModel.getUserIdsByCodeId(activityCodeData.id);

      // 检查关联用户数量（至少满足最少人数要求）
      if (associatedUserIds.length < activityRules.minPlayers) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 活动关联用户不足 ${activityRules.minPlayers}人 (${associatedUserIds.length}人)，无法组队`);
        return null;
      }

      // 过滤出只有关联用户才能参与
      availableUsers = availableUsers.filter(u => associatedUserIds.includes(u.id));

      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 活动规则：最少${activityRules.minPlayers}人，最多${activityRules.maxPlayers}人，每局${activityRules.playersPerGame}人，需种子=${activityRules.requireSeed}，强制=${activityRules.seedRequired}`);
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 活动关联用户 ${associatedUserIds.length}人，当前可用关联用户 ${availableUsers.length}人`);

      if (availableUsers.length < activityRules.minPlayers) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 可用关联用户不足 ${activityRules.minPlayers}人，无法组队`);
        return null;
      }
    }

    // 默认规则（如果没有活动规则）
    if (!activityRules) {
      activityRules = {
        minPlayers: 4,
        maxPlayers: 4,
        playersPerGame: 4,
        requireSeed: true,
        seedRequired: true
      };
    }

    // 【重要】如果是晚上（timeSlot=2），检查今天下午是否已有组队
    // 如果有，优先选择下午参与的用户，保持人员一致性
    let afternoonParticipants = [];
    if (timeSlot === 2) {
      const afternoonResult = previousResults.find(r => 
        r.date === date && r.timeSlot === 1
      );
      if (afternoonResult && afternoonResult.members) {
        afternoonParticipants = afternoonResult.members.map(m => m.id);
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 下午参与人员 ${afternoonParticipants.length}人，优先选择他们参加晚上活动`);
      }
    }

    // 检查种子选手（如果活动规则要求）
    if (activityRules.requireSeed) {
      const seedAvailable = availableUsers.some(u => u.id === seedUser.id);
      if (!seedAvailable) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 活动要求种子选手，但种子选手不可用，跳过`);
        return null;
      }
    }

    // 检查是否已有活动
    const existingActivity = await Activity.getActivityWithMembers(date, timeSlot);
    if (existingActivity) {
      // 如果已有活动且人数达到每局人数要求，跳过
      if (existingActivity.member_count >= activityRules.playersPerGame) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 已有活动且人数已达 ${existingActivity.member_count} 人，跳过`);
        return null;
      }
      
      // 如果已有活动但人数不足，检查是否是因为人员变动
      // 获取现有成员
      const existingMembers = await Activity.getMembers(existingActivity.id);
      const existingMemberIds = existingMembers.map(m => m.id);
      
      // 检查现有成员是否都还有空（申报了该时间段）
      const allMembersStillAvailable = existingMemberIds.every(id => 
        availableUsers.some(u => u.id === id)
      );
      
      if (allMembersStillAvailable) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 已有活动且成员都还有空，不重新组队`);
        return null;
      }
      
      // 人员有变动，需要重新组队
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 已有活动但人员有变动，重新组队`);
      // 清空现有成员
      for (const member of existingMembers) {
        await Activity.removeMember(existingActivity.id, member.id);
      }
      activityId = existingActivity.id;
    }

    // 分离种子选手和普通用户
    let regularUsers = availableUsers.filter(u => u.id !== seedUser.id);

    // 如果活动规则不要求种子选手强制参与，则种子选手作为普通用户参与
    if (!activityRules.seedRequired && seedUser) {
      const seedAvailable = availableUsers.some(u => u.id === seedUser.id);
      if (seedAvailable) {
        regularUsers = availableUsers.filter(u => u.id !== seedUser.id);
      }
    }

    // 【重要】如果是晚上，优先选择下午参与的用户
    if (timeSlot === 2 && afternoonParticipants.length > 0) {
      // 过滤出下午参与且晚上也有空的用户
      const afternoonAvailableUsers = regularUsers.filter(u => 
        afternoonParticipants.includes(u.id)
      );
      
      // 计算需要多少人（优先用下午的人）
      const usersNeeded = activityRules.playersPerGame - 1; // 减去种子选手
      
      // 如果下午参与的人数足够，优先选择他们
      if (afternoonAvailableUsers.length >= usersNeeded) {
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 下午参与人数足够 (${afternoonAvailableUsers.length}人)，优先选择他们`);
        // 对下午参与的用户进行排序（保持公平性）
        const sortedAfternoonUsers = await this.sortUsersByPriority(afternoonAvailableUsers, date);
        regularUsers = sortedAfternoonUsers;
      } else {
        // 下午参与人数不足，先用他们，再补充其他人
        console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 下午参与人数不足 (${afternoonAvailableUsers.length}人)，补充其他用户`);
        const otherUsers = regularUsers.filter(u => 
          !afternoonParticipants.includes(u.id)
        );
        // 下午参与的用户排前面，其他用户排后面
        regularUsers = [...afternoonAvailableUsers, ...otherUsers];
      }
    }

    // 对普通用户进行排序，优先选择：
    // 1. 参与次数少的
    // 2. 最近未参与的（避免连续）
    // 3. 还未参与过的（保证至少一次）
    const sortedUsers = await this.sortUsersByPriority(regularUsers, date);

    // 计算需要选择多少用户
    let usersNeeded = activityRules.playersPerGame - 1; // 减去种子选手
    if (!activityRules.seedRequired || !activityRules.requireSeed) {
      usersNeeded = activityRules.playersPerGame;
    }

    // 选择用户（根据活动规则）
    const selectedUsers = sortedUsers.slice(0, usersNeeded);

    if (selectedUsers.length < usersNeeded) {
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 可用普通用户不足 ${usersNeeded} 人`);
      return null;
    }

    // 创建或更新活动
    let activityId;
    if (existingActivity) {
      activityId = existingActivity.id;
      // 清空现有成员
      const members = await Activity.getMembers(activityId);
      for (const member of members) {
        await Activity.removeMember(activityId, member.id);
      }
    } else {
      const result = await Activity.create(date, timeSlot, 'confirmed');
      activityId = result.lastInsertRowid;
    }

    // 添加成员（根据活动规则）
    let allMemberIds = [];
    if (activityRules.seedRequired && activityRules.requireSeed) {
      allMemberIds = [seedUser.id, ...selectedUsers.map(u => u.id)];
    } else {
      allMemberIds = selectedUsers.map(u => u.id);
    }

    await Activity.addMembersBatch(activityId, allMemberIds);

    // 记录参与历史
    const transaction = this.db.transaction(() => {
      for (const userId of allMemberIds) {
        Activity.addParticipationRecord(userId, activityId, date, timeSlot);
      }
    });
    await transaction();

    console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 组队成功，成员：${seedUser.name} + ${selectedUsers.map(u => u.name).join(', ')}`);

    return {
      date,
      timeSlot,
      timeSlotText: this.getTimeSlotText(timeSlot),
      activityId,
      members: [
        { ...seedUser, isSeed: true },
        ...selectedUsers.map(u => ({ ...u, isSeed: false }))
      ],
      // 明确标识时间段
      period: timeSlot === 1 ? 'afternoon' : 'evening',
      periodText: timeSlot === 1 ? '下午' : '晚上'
    };
  }

  /**
   * 对用户进行排序，确定优先级
   * 规则：
   * 1. 还未参与过的用户优先（保证至少一次）
   * 2. 参与次数少的优先
   * 3. 最近参与日期较早的优先（避免连续）
   */
  async sortUsersByPriority(users, targetDate) {
    const targetDateObj = new Date(targetDate);

    // 为每个用户计算优先级分数
    const usersWithScore = await Promise.all(users.map(async (user) => {
      const participationCount = await Activity.getUserParticipationCount(user.id);
      const lastParticipationDate = await Activity.getUserLastParticipationDate(user.id);

      // 计算与上次参与日期间隔的天数
      let daysSinceLast = 999;
      if (lastParticipationDate) {
        const lastDate = new Date(lastParticipationDate);
        daysSinceLast = Math.floor((targetDateObj - lastDate) / (1000 * 60 * 60 * 24));
      }

      // 检查前一天是否参与（避免连续）
      const prevDay = new Date(targetDateObj);
      prevDay.setDate(targetDateObj.getDate() - 1);
      const prevDayStr = this.formatDate(prevDay);
      const participatedPrevDay = (await Activity.hasParticipated(user.id, prevDayStr, 1)) ||
                                   (await Activity.hasParticipated(user.id, prevDayStr, 2)) ||
                                   (await Activity.hasParticipated(user.id, prevDayStr, 3));

      // 计算优先级分数（分数越低优先级越高）
      let score = 0;

      // 从未参与的给最低分（最高优先级）
      if (participationCount === 0) {
        score = -1000;
      } else {
        // 参与次数 * 10
        score += participationCount * 10;
      }

      // 如果前一天参与了，增加惩罚分数
      if (participatedPrevDay) {
        score += 500;
      }

      // 间隔天数越多，优先级越高（减去天数）
      score -= Math.min(daysSinceLast, 10);

      return {
        ...user,
        score,
        participationCount,
        daysSinceLast,
        participatedPrevDay
      };
    }));

    // 按分数排序
    usersWithScore.sort((a, b) => a.score - b.score);

    return usersWithScore;
  }

  /**
   * 获取组队统计信息
   */
  async getTeamStats() {
    const users = await User.findAll();
    const stats = await Promise.all(users.map(async (user) => {
      const count = await Activity.getUserParticipationCount(user.id);
      const history = await Activity.getUserParticipationHistory(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isSeed: user.is_seed === 1,
        participationCount: count,
        history
      };
    }));

    return stats;
  }

  /**
   * 手动触发某一天的组队
   */
  async buildTeamForDate(date) {
    const results = [];
    const seedUser = await User.findSeed();

    if (!seedUser) {
      return { success: false, error: '未找到种子选手' };
    }

    for (let timeSlot = 1; timeSlot <= 3; timeSlot++) {
      const result = await this.buildTeamForSlot(date, timeSlot, seedUser);
      if (result) {
        results.push(result);
      }
    }

    return { success: true, results };
  }

  // 辅助函数
  formatDate(date) {
    if (typeof date === 'string') return date;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getTimeSlotText(slot) {
    const map = { 1: '下午', 2: '晚上', 3: '下午连晚上' };
    return map[slot] || '未知';
  }
}

module.exports = new TeamBuilderService();
