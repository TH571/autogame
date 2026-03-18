const express = require('express');
const router = express.Router();
const TeamBuilder = require('../utils/TeamBuilder');
const Activity = require('../models/Activity');
const { authMiddleware, activityAdminMiddleware } = require('../middleware/auth');

// 执行自动组队（活动管理员）
router.post('/build', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const result = await TeamBuilder.buildTeams();

    if (result.success) {
      res.json({
        message: `组队完成，共创建 ${result.results.length} 个活动`,
        activities: result.results
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('自动组队错误:', error);
    res.status(500).json({ error: '组队失败，请稍后重试' });
  }
});

// 为特定日期组队（管理员）
router.post('/build/:date', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { date } = req.params;

    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式不正确' });
    }

    const result = await TeamBuilder.buildTeamForDate(date);

    if (result.success) {
      res.json({
        message: `日期 ${date} 组队完成，共创建 ${result.results.length} 个活动`,
        activities: result.results
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error('日期组队错误:', error);
    res.status(500).json({ error: '组队失败，请稍后重试' });
  }
});

// 获取所有活动
router.get('/activities', authMiddleware, async (req, res) => {
  try {
    const activities = await Activity.getAll();

    // 获取每个活动的成员
    const activitiesWithMembers = await Promise.all(activities.map(async (activity) => {
      const members = await Activity.getMembers(activity.id);
      return {
        ...activity,
        timeSlotText: getTimeSlotText(activity.time_slot),
        memberCount: members.length,
        members
      };
    }));

    res.json({ activities: activitiesWithMembers });
  } catch (error) {
    console.error('获取活动列表错误:', error);
    res.status(500).json({ error: '获取活动列表失败' });
  }
});

// 获取未来活动
router.get('/activities/upcoming', authMiddleware, async (req, res) => {
  try {
    const activities = await Activity.getUpcoming();

    const activitiesWithMembers = await Promise.all(activities.map(async (activity) => {
      const members = await Activity.getMembers(activity.id);
      return {
        ...activity,
        timeSlotText: getTimeSlotText(activity.time_slot),
        memberCount: members.length,
        members
      };
    }));

    res.json({ activities: activitiesWithMembers });
  } catch (error) {
    console.error('获取未来活动错误:', error);
    res.status(500).json({ error: '获取未来活动失败' });
  }
});

// 获取用户的活动
router.get('/activities/my', authMiddleware, async (req, res) => {
  try {
    const history = await Activity.getUserParticipationHistory(req.user.id);

    const activities = history.map(h => ({
      id: h.id,
      date: h.date,
      timeSlot: h.time_slot,
      timeSlotText: getTimeSlotText(h.time_slot),
      status: h.status,
      createdAt: h.created_at
    }));

    res.json({ activities });
  } catch (error) {
    console.error('获取用户活动错误:', error);
    res.status(500).json({ error: '获取活动列表失败' });
  }
});

// 获取组队统计
router.get('/stats', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const stats = await TeamBuilder.getTeamStats();
    res.json({ stats });
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

// 添加活动成员（管理员）
router.post('/activities/:id/members', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '用户列表不能为空' });
    }

    await Activity.addMembersBatch(id, userIds);

    res.json({ message: `成功添加 ${userIds.length} 名成员` });
  } catch (error) {
    console.error('添加成员错误:', error);
    res.status(500).json({ error: '添加成员失败' });
  }
});

// 移除活动成员（管理员）
router.delete('/activities/:id/members/:userId', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;
    await Activity.removeMember(id, userId);
    res.json({ message: '成员已移除' });
  } catch (error) {
    console.error('移除成员错误:', error);
    res.status(500).json({ error: '移除成员失败' });
  }
});

// 删除活动（管理员）
router.delete('/activities/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await Activity.delete(id);
    res.json({ message: '活动已删除' });
  } catch (error) {
    console.error('删除活动错误:', error);
    res.status(500).json({ error: '删除活动失败' });
  }
});

// 辅助函数
function getTimeSlotText(slot) {
  const map = { 1: '下午', 2: '晚上', 3: '下午连晚上' };
  return map[slot] || '未知';
}

module.exports = router;
