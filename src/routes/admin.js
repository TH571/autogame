const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Activity = require('../models/Activity');
const Availability = require('../models/Availability');
const { authMiddleware, activityAdminMiddleware, superAdminMiddleware } = require('../middleware/auth');

// 获取所有用户（管理员）
router.get('/users', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    let users;
    
    // 超级管理员可以看到所有用户
    if (req.user.role === 'super_admin') {
      users = User.findAll();
    } else {
      // 活动管理员只能看到自己管理的用户
      users = User.findByActivityAdminId(req.user.id);
    }
    
    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isSeed: u.is_seed === 1,
      activityAdminId: u.activity_admin_id,
      createdAt: u.created_at
    }));
    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 创建用户（管理员）
router.post('/users', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { email, password, name, role, isSeed } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: '邮箱、密码和姓名不能为空' });
    }

    // 检查邮箱是否已存在
    const existingUser = User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const userRole = role || 'user';
    
    const result = User.create(email, hashedPassword, name, userRole);
    
    // 如果是种子选手，更新 is_seed
    if (isSeed) {
      User.update(result.lastInsertRowid, { is_seed: 1 });
    }

    res.status(201).json({
      message: '用户创建成功',
      user: {
        id: result.lastInsertRowid,
        email,
        name,
        role: userRole,
        isSeed: isSeed === true
      }
    });
  } catch (error) {
    console.error('创建用户错误:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 更新用户（管理员）
router.put('/users/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, password, name, role, isSeed } = req.body;
    const updateData = {};

    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (role) updateData.role = role;
    if (isSeed !== undefined) updateData.is_seed = isSeed ? 1 : 0;
    if (password) {
      updateData.password = bcrypt.hashSync(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '没有要更新的内容' });
    }

    User.update(id, updateData);

    res.json({ message: '用户更新成功' });
  } catch (error) {
    console.error('更新用户错误:', error);
    res.status(500).json({ error: '更新用户失败' });
  }
});

// 删除用户（管理员）
router.delete('/users/:id', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    // 不允许删除自己
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: '不能删除自己的账户' });
    }

    User.delete(id);
    res.json({ message: '用户删除成功' });
  } catch (error) {
    console.error('删除用户错误:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 获取所有活动（管理员）
router.get('/activities', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const activities = Activity.getAll();
    
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

// 更新活动状态（管理员）
router.put('/activities/:id', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: '无效的状态值' });
    }

    Activity.updateStatus(id, status);
    res.json({ message: '活动状态更新成功' });
  } catch (error) {
    console.error('更新活动状态错误:', error);
    res.status(500).json({ error: '更新活动状态失败' });
  }
});

// 删除活动（管理员）
router.delete('/activities/:id', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    Activity.delete(id);
    res.json({ message: '活动删除成功' });
  } catch (error) {
    console.error('删除活动错误:', error);
    res.status(500).json({ error: '删除活动失败' });
  }
});

// 获取所有用户的申报（管理员）
router.get('/availabilities', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const users = User.findAll();
    const availabilities = [];

    for (const user of users) {
      const userAvailabilities = Availability.getByUser(user.id);
      availabilities.push({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        availabilities: userAvailabilities.map(a => ({
          date: a.date,
          timeSlot: a.time_slot,
          timeSlotText: getTimeSlotText(a.time_slot),
          createdAt: a.created_at
        }))
      });
    }

    res.json({ availabilities });
  } catch (error) {
    console.error('获取申报列表错误:', error);
    res.status(500).json({ error: '获取申报列表失败' });
  }
});

// 获取指定用户的申报详情（管理员）
router.get('/availabilities/:userId', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const user = User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    const availabilities = Availability.getByUser(userId);
    
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      availabilities: availabilities.map(a => ({
        id: a.id,
        date: a.date,
        timeSlot: a.time_slot,
        timeSlotText: getTimeSlotText(a.time_slot),
        createdAt: a.created_at,
        updatedAt: a.updated_at
      }))
    });
  } catch (error) {
    console.error('获取用户申报详情错误:', error);
    res.status(500).json({ error: '获取申报详情失败' });
  }
});

// 为用户添加申报（管理员）
router.post('/availabilities/:userId', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { date, timeSlot } = req.body;
    
    // 验证
    if (!date || !timeSlot) {
      return res.status(400).json({ error: '日期和时间段不能为空' });
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: '日期格式不正确' });
    }
    
    if (![1, 2, 3].includes(timeSlot)) {
      return res.status(400).json({ error: '时间段必须是 1(下午)、2(晚上) 或 3(下午连晚上)' });
    }
    
    // 检查用户是否存在
    const user = User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    Availability.add(userId, date, timeSlot);
    
    res.json({
      message: '添加成功',
      availability: {
        date,
        timeSlot,
        timeSlotText: getTimeSlotText(timeSlot)
      }
    });
  } catch (error) {
    console.error('添加申报错误:', error);
    res.status(500).json({ error: '添加申报失败' });
  }
});

// 批量为用户添加申报（管理员）
router.post('/availabilities/:userId/batch', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { userId } = req.params;
    const { availabilities } = req.body;
    
    if (!Array.isArray(availabilities) || availabilities.length === 0) {
      return res.status(400).json({ error: '可用时间列表不能为空' });
    }
    
    // 检查用户是否存在
    const user = User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    Availability.addBatch(userId, availabilities);
    
    res.json({
      message: `成功添加 ${availabilities.length} 条申报`
    });
  } catch (error) {
    console.error('批量添加申报错误:', error);
    res.status(500).json({ error: '批量添加申报失败' });
  }
});

// 删除用户的申报（管理员）
router.delete('/availabilities/:userId/:date/:timeSlot', authMiddleware, activityAdminMiddleware, (req, res) => {
  try {
    const { userId, date, timeSlot } = req.params;
    const timeSlotNum = parseInt(timeSlot, 10);
    
    // 检查用户是否存在
    const user = User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    Availability.remove(userId, date, timeSlotNum);
    
    res.json({ message: '删除成功' });
  } catch (error) {
    console.error('删除申报错误:', error);
    res.status(500).json({ error: '删除申报失败' });
  }
});

// 辅助函数
function getTimeSlotText(slot) {
  const map = { 1: '下午', 2: '晚上', 3: '下午连晚上' };
  return map[slot] || '未知';
}

module.exports = router;
