const { getDb } = require('../utils/init-db');
const Activity = require('../models/Activity');
const Availability = require('../models/Availability');
const User = require('../models/User');

/**
 * 自动组队服务
 * 
 * 规则：
 * 1. 每队 4 人
 * 2. 种子选手必须参加每场活动
 * 3. 普通用户需轮流参与，避免连续被选
 * 4. ≥4 人有时空即可组队
 * 5. 保证每位用户在未来 14 天内至少参与一次（如果可能）
 */
class TeamBuilderService {
  constructor() {
    this.db = getDb();
  }

  /**
   * 执行自动组队
   * 遍历未来 14 天，检查每个时间段，进行组队
   */
  buildTeams() {
    const results = [];
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 13); // 未来 14 天

    // 获取种子选手
    const seedUser = User.findSeed();
    if (!seedUser) {
      console.log('未找到种子选手，无法进行组队');
      return { success: false, error: '未找到种子选手' };
    }

    console.log(`开始自动组队，种子选手：${seedUser.name} (${seedUser.email})`);

    // 遍历未来 14 天的每一天
    for (let i = 0; i < 14; i++) {
      const currentDate = new Date(today);
      currentDate.setDate(today.getDate() + i);
      const dateStr = this.formatDate(currentDate);

      // 检查三个时间段
      for (let timeSlot = 1; timeSlot <= 3; timeSlot++) {
        const result = this.buildTeamForSlot(dateStr, timeSlot, seedUser);
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
  buildTeamForSlot(date, timeSlot, seedUser) {
    // 获取该时间段所有可用的用户
    const availableUsers = Availability.getByDateAndSlot(date, timeSlot);
    
    if (availableUsers.length < 4) {
      // 不足 4 人，无法组队
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 只有 ${availableUsers.length} 人可用，不足 4 人`);
      return null;
    }

    // 检查种子选手是否有空
    const seedAvailable = availableUsers.some(u => u.id === seedUser.id);
    if (!seedAvailable) {
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 种子选手不可用，跳过`);
      return null;
    }

    // 检查是否已有活动
    const existingActivity = Activity.getActivityWithMembers(date, timeSlot);
    if (existingActivity && existingActivity.member_count >= 4) {
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 已有活动且已满 4 人，跳过`);
      return null;
    }

    // 分离种子选手和普通用户
    const regularUsers = availableUsers.filter(u => u.id !== seedUser.id);

    // 对普通用户进行排序，优先选择：
    // 1. 参与次数少的
    // 2. 最近未参与的（避免连续）
    // 3. 还未参与过的（保证至少一次）
    const sortedUsers = this.sortUsersByPriority(regularUsers, date);

    // 选择前 3 名普通用户（加上种子选手共 4 人）
    const selectedUsers = sortedUsers.slice(0, 3);

    if (selectedUsers.length < 3) {
      console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 可用普通用户不足 3 人`);
      return null;
    }

    // 创建或更新活动
    let activityId;
    if (existingActivity) {
      activityId = existingActivity.id;
      // 清空现有成员
      const members = Activity.getMembers(activityId);
      for (const member of members) {
        Activity.removeMember(activityId, member.id);
      }
    } else {
      const result = Activity.create(date, timeSlot, 'confirmed');
      activityId = result.lastInsertRowid;
    }

    // 添加成员（种子选手 + 3 名普通用户）
    const allMemberIds = [seedUser.id, ...selectedUsers.map(u => u.id)];
    Activity.addMembersBatch(activityId, allMemberIds);

    // 记录参与历史
    const transaction = this.db.transaction(() => {
      for (const userId of allMemberIds) {
        Activity.addParticipationRecord(userId, activityId, date, timeSlot);
      }
    });
    transaction();

    console.log(`${date} ${this.getTimeSlotText(timeSlot)}: 组队成功，成员：${seedUser.name} + ${selectedUsers.map(u => u.name).join(', ')}`);

    return {
      date,
      timeSlot,
      timeSlotText: this.getTimeSlotText(timeSlot),
      activityId,
      members: [
        { ...seedUser, isSeed: true },
        ...selectedUsers.map(u => ({ ...u, isSeed: false }))
      ]
    };
  }

  /**
   * 对用户进行排序，确定优先级
   * 规则：
   * 1. 还未参与过的用户优先（保证至少一次）
   * 2. 参与次数少的优先
   * 3. 最近参与日期较早的优先（避免连续）
   */
  sortUsersByPriority(users, targetDate) {
    const targetDateObj = new Date(targetDate);
    
    // 为每个用户计算优先级分数
    const usersWithScore = users.map(user => {
      const participationCount = Activity.getUserParticipationCount(user.id);
      const lastParticipationDate = Activity.getUserLastParticipationDate(user.id);
      
      // 计算与上次参与日期间隔的天数
      let daysSinceLast = 999;
      if (lastParticipationDate) {
        const lastDate = new Date(lastParticipationDate);
        daysSinceLast = Math.floor((targetDateObj - lastDate) / (1000 * 60 * 60 * 24));
      }

      // 检查前一天是否参与（避免连续）
      const prevDay = new Date(targetDateObj);
      prevDay.setDate(targetDateObj.getDate() - 1);
      const participatedPrevDay = Activity.hasParticipated(user.id, this.formatDate(prevDay), 1) ||
                                   Activity.hasParticipated(user.id, this.formatDate(prevDay), 2) ||
                                   Activity.hasParticipated(user.id, this.formatDate(prevDay), 3);

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
    });

    // 按分数排序
    usersWithScore.sort((a, b) => a.score - b.score);

    return usersWithScore;
  }

  /**
   * 获取组队统计信息
   */
  getTeamStats() {
    const users = User.findAll();
    const stats = users.map(user => {
      const count = Activity.getUserParticipationCount(user.id);
      const history = Activity.getUserParticipationHistory(user.id);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isSeed: user.is_seed === 1,
        participationCount: count,
        history
      };
    });

    return stats;
  }

  /**
   * 手动触发某一天的组队
   */
  buildTeamForDate(date) {
    const results = [];
    const seedUser = User.findSeed();
    
    if (!seedUser) {
      return { success: false, error: '未找到种子选手' };
    }

    for (let timeSlot = 1; timeSlot <= 3; timeSlot++) {
      const result = this.buildTeamForSlot(date, timeSlot, seedUser);
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
