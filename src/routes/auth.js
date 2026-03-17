const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../public/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件（jpg, png, gif）'));
    }
  }
});

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
    
    // 标记邀请码为已使用
    User.markInviteCodeAsUsed(inviteCode, result.lastInsertRowid);
    
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

    console.log('[Login] 尝试登录:', email);
    console.log('[Login] 环境:', process.env.VERCEL ? 'Vercel' : '本地');
    console.log('[Login] 数据库模式:', process.env.POSTGRES_URL ? 'PostgreSQL' : 'SQLite');

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    // 查找用户（异步）
    const user = await User.findByEmail(email);
    console.log('[Login] 用户查询结果:', user ? JSON.stringify(user) : '用户不存在');

    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    console.log('[Login] 数据库中的密码哈希:', user.password.substring(0, 20) + '...');
    console.log('[Login] 输入的密码:', password);

    // 验证密码
    const isValidPassword = bcrypt.compareSync(password, user.password);
    console.log('[Login] 密码验证:', isValidPassword ? '成功' : '失败');

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

    console.log('[Login] 登录成功:', email);

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
    console.error('[Login] 登录错误:', error);
    console.error('[Login] 错误堆栈:', error.stack);
    res.status(500).json({ error: '登录失败：' + error.message });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 获取邀请码（如果是活动管理员或超级管理员）
    let inviteCode = null;
    if (user.role === 'activity_admin' || user.role === 'super_admin') {
      const inviteData = await User.getInviteCode(user.id);
      inviteCode = inviteData ? {
        code: inviteData.code,
        is_used: inviteData.is_used === 1,
        used_by: inviteData.used_by,
        created_at: inviteData.created_at
      } : null;
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

// 上传头像
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' });
    }
    
    // 保存头像 URL 到数据库
    const avatarUrl = `/avatars/${req.file.filename}`;
    User.update(req.user.id, { avatar: avatarUrl });

    res.json({
      message: '头像上传成功',
      avatarUrl
    });
  } catch (error) {
    console.error('上传头像错误:', error);
    res.status(500).json({ error: error.message || '上传失败' });
  }
});

// 诊断 API - 检查数据库状态
router.get('/diagnostic', async (req, res) => {
  try {
    const { usePostgres } = require('../utils/database');
    const db = require('../utils/db');
    
    let dbStatus = 'unknown';
    let tables = [];
    let userCount = 0;
    
    if (usePostgres) {
      dbStatus = 'PostgreSQL';
      const postgresDb = await db.getDb();
      try {
        const result = await postgresDb.query(`
          SELECT table_name FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        tables = result.rows.map(r => r.table_name);
        
        const userResult = await postgresDb.query('SELECT COUNT(*) FROM users');
        userCount = parseInt(userResult.rows[0]?.count) || 0;
      } catch (err) {
        dbStatus = 'PostgreSQL (连接错误：' + err.message + ')';
      }
    } else {
      dbStatus = 'SQLite';
      const sqliteDb = db.getDb();
      tables = sqliteDb.prepare(`
        SELECT name FROM sqlite_master WHERE type='table'
      `).all().map(t => t.name);
      userCount = sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get().count;
    }

    res.json({
      database: dbStatus,
      tables,
      userCount,
      env: {
        VERCEL: process.env.VERCEL || 'false',
        POSTGRES_URL: process.env.POSTGRES_URL ? '已配置' : '未配置',
        POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING ? '已配置' : '未配置',
        ADMIN_EMAIL: process.env.ADMIN_EMAIL || '未设置',
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? '已设置' : '未设置'
      }
    });
  } catch (error) {
    console.error('诊断错误:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
