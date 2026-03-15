const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, role, inviteCode } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: '邮箱、密码和姓名不能为空' });
    }

    if (!inviteCode) {
      return res.status(400).json({ error: '邀请码不能为空' });
    }

    // 检查邮箱是否已存在
    const existingUser = User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    // 密码强度检查
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少为 6 位' });
    }

    // 角色验证
    const validRoles = ['activity_admin', 'user'];
    const userRole = role || 'user';
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: '无效的角色类型' });
    }

    // 验证邀请码
    const inviteData = User.verifyInviteCode(inviteCode);
    if (!inviteData) {
      return res.status(400).json({ error: '无效的邀请码' });
    }
    
    // 检查邀请码类型是否匹配
    const inviter = User.findById(inviteData.admin_id);
    if (userRole === 'activity_admin' && inviter.role !== 'super_admin') {
      return res.status(400).json({ error: '活动管理员注册需要超级管理员邀请码' });
    }
    if (userRole === 'user' && inviter.role !== 'activity_admin' && inviter.role !== 'super_admin') {
      return res.status(400).json({ error: '普通用户注册需要活动管理员邀请码' });
    }

    let activityAdminId = inviteData.admin_id;
    
    // 活动管理员注册时，超级管理员作为上级
    if (userRole === 'activity_admin') {
      activityAdminId = inviteData.admin_id;
    }

    // 加密密码
    const hashedPassword = bcrypt.hashSync(password, 10);

    // 创建用户
    const result = User.create(email, hashedPassword, name, userRole, activityAdminId);
    
    // 为活动管理员生成邀请码
    if (userRole === 'activity_admin') {
      const newInviteCode = User.generateInviteCode(result.lastInsertRowid);
      console.log(`为新活动管理员 ${name} 生成邀请码：${newInviteCode}`);
    }
    
    // 生成 token
    const token = jwt.sign(
      { 
        id: result.lastInsertRowid, 
        email, 
        name,
        role: userRole,
        isSeed: false 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: '注册成功',
      token,
      user: {
        id: result.lastInsertRowid,
        email,
        name,
        role: userRole,
        isSeed: false
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 查找用户
    const user = User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 验证密码
    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    // 生成 token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        role: user.role,
        isSeed: user.is_seed === 1 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSeed: user.is_seed === 1,
        activityAdminId: user.activity_admin_id
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取邀请码（如果是活动管理员或超级管理员）
    let inviteCode = null;
    if (user.role === 'activity_admin' || user.role === 'super_admin') {
      const inviteData = User.getInviteCode(user.id);
      inviteCode = inviteData ? inviteData.code : null;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSeed: user.is_seed === 1,
        activityAdminId: user.activity_admin_id,
        inviteCode,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

// 生成新邀请码
router.post('/invite-code', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'activity_admin') {
      return res.status(403).json({ error: '无权限生成邀请码' });
    }

    const newInviteCode = User.generateInviteCode(req.user.id);
    
    res.json({
      message: '邀请码生成成功',
      inviteCode: newInviteCode
    });
  } catch (error) {
    console.error('生成邀请码错误:', error);
    res.status(500).json({ error: '生成邀请码失败' });
  }
});

// 更新用户信息
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, password } = req.body;
    const updateData = {};

    if (name) {
      updateData.name = name;
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度至少为 6 位' });
      }
      updateData.password = bcrypt.hashSync(password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '没有要更新的内容' });
    }

    User.update(req.user.id, updateData);

    res.json({ message: '更新成功' });
  } catch (error) {
    console.error('更新用户信息错误:', error);
    res.status(500).json({ error: '更新失败，请稍后重试' });
  }
});

module.exports = router;
