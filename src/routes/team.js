const express = require('express');
const router = express.Router();
const TeamBuilder = require('../utils/TeamBuilder');
const Activity = require('../models/Activity');
const { authMiddleware, activityAdminMiddleware } = require('../middleware/auth');

// 执行自动组队（活动管理员）
router.post('/build', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const result = TeamBuilder.buildTeams();
    
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
router.post('/build/:date', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { date } = req.params;
    
    // 验证日期格式
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式不正确' });
    }

    const result = TeamBuilder.buildTeamForDate(date);
    
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
router.get('/activities', authMiddleware, (req, res) => {
  try {
    const activities = Activity.getAll();
    
    // 获取每个活动的成员
    const activitiesWithMembers = activities.map(activity => {
      const members = Activity.getMembers(activity.id);
      return {
        ...activity,
        timeSlotText: getTimeSlotText(activity.time_slot),
        memberCount: members.length,
        members
      };
    });

    res.json({ activities: activitiesWithMembers });
  } catch (error) {
    console.error('获取活动列表错误:', error);
    res.status(500).json({ error: '获取活动列表失败' });
  }
});

// 获取未来活动
router.get('/activities/upcoming', authMiddleware, (req, res) => {
  try {
    const activities = Activity.getUpcoming();
    
    const activitiesWithMembers = activities.map(activity => {
      const members = Activity.getMembers(activity.id);
      return {
        ...activity,
        timeSlotText: getTimeSlotText(activity.time_slot),
        memberCount: members.length,
        members
      };
    });

    res.json({ activities: activitiesWithMembers });
  } catch (error) {
    console.error('获取未来活动错误:', error);
    res.status(500).json({ error: '获取未来活动失败' });
  }
});

// 获取用户的活动
router.get('/activities/my', authMiddleware, (req, res) => {
  try {
    const history = Activity.getUserParticipationHistory(req.user.id);
    
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
router.get('/stats', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const stats = TeamBuilder.getTeamStats();
    res.json({ stats });
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ error: '获取统计信息失败' });
  }
});

// 辅助函数
function getTimeSlotText(slot) {
  const map = { 1: '下午', 2: '晚上', 3: '下午连晚上' };
  return map[slot] || '未知';
}

module.exports = router;
