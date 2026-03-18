const express = require('express');
const router = express.Router();
const TeamRebuildRequest = require('../models/TeamRebuildRequest');
const TeamBuilder = require('../utils/TeamBuilder');
const { authMiddleware, activityAdminMiddleware } = require('../middleware/auth');

// 创建组队请求（用户）
router.post('/requests', authMiddleware, async (req, res) => {
  try {
    const { activityCode, date, timeSlot, reason } = req.body;

    if (!activityCode || !date || !timeSlot) {
      return res.status(400).json({ error: '活动代码、日期和时间段为必填项' });
    }

    // 检查是否已有待处理请求
    const hasPending = await TeamRebuildRequest.hasPendingRequest(req.user.id, activityCode, date, timeSlot);
    if (hasPending) {
      return res.status(400).json({ error: '您已提交过该时间段的组队请求，请等待管理员审批' });
    }

    const result = await TeamRebuildRequest.create(req.user.id, activityCode, date, timeSlot, reason || '');

    res.status(201).json({
      message: '组队请求已提交，请等待管理员审批',
      requestId: result.lastInsertRowid
    });
  } catch (error) {
    console.error('创建组队请求错误:', error);
    res.status(500).json({ error: '创建请求失败' });
  }
});

// 获取我的待处理请求（用户）
router.get('/requests/my', authMiddleware, async (req, res) => {
  try {
    const requests = await TeamRebuildRequest.getPendingByUser(req.user.id);
    res.json({ requests });
  } catch (error) {
    console.error('获取请求错误:', error);
    res.status(500).json({ error: '获取请求失败' });
  }
});

// 获取所有待处理的请求（管理员）
router.get('/requests', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const requests = await TeamRebuildRequest.getAllPending();
    res.json({ requests });
  } catch (error) {
    console.error('获取请求列表错误:', error);
    res.status(500).json({ error: '获取请求列表失败' });
  }
});

// 审批组队请求（管理员）
router.post('/requests/:id/approve', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await TeamRebuildRequest.getById(id);
    if (!request) {
      return res.status(404).json({ error: '请求不存在' });
    }

    // 更新状态为已批准
    await TeamRebuildRequest.updateStatus(id, 'approved', req.user.id, adminNote || '');

    // 执行重新组队
    const result = await TeamBuilder.buildTeamForDate(request.date);

    res.json({
      message: '请求已批准，重新组队完成',
      activities: result.results
    });
  } catch (error) {
    console.error('审批请求错误:', error);
    res.status(500).json({ error: '审批失败：' + error.message });
  }
});

// 拒绝组队请求（管理员）
router.post('/requests/:id/reject', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const request = await TeamRebuildRequest.getById(id);
    if (!request) {
      return res.status(404).json({ error: '请求不存在' });
    }

    await TeamRebuildRequest.updateStatus(id, 'rejected', req.user.id, adminNote || '拒绝重新组队');

    res.json({ message: '请求已拒绝' });
  } catch (error) {
    console.error('拒绝请求错误:', error);
    res.status(500).json({ error: '拒绝失败：' + error.message });
  }
});

// 删除请求（管理员）
router.delete('/requests/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await TeamRebuildRequest.delete(id);
    res.json({ message: '请求已删除' });
  } catch (error) {
    console.error('删除请求错误:', error);
    res.status(500).json({ error: '删除失败：' + error.message });
  }
});

module.exports = router;
