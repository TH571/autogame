const express = require('express');
const router = express.Router();
const ActivityCode = require('../models/ActivityCode');
const User = require('../models/User');
const ActivityInvite = require('../models/ActivityInvite');
const { authMiddleware, activityAdminMiddleware } = require('../middleware/auth');

// 获取所有活动代码（管理员）
router.get('/codes', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    let codes;
    // 超级管理员可以看到所有活动代码
    if (req.user.role === 'super_admin') {
      codes = await ActivityCode.getAll();
      console.log('超级管理员获取所有活动代码:', codes.length);
    } else {
      // 活动管理员只能看到自己创建的活动代码
      const allCodes = await ActivityCode.getAll();
      codes = allCodes.filter(c => c.created_by === req.user.id);
      console.log('活动管理员获取活动代码:', codes.length);
    }

    res.json({ codes });
  } catch (error) {
    console.error('获取活动代码错误:', error);
    res.status(500).json({ error: '获取活动代码失败' });
  }
});

// 获取用户的活动代码
router.get('/codes/my', authMiddleware, async (req, res) => {
  try {
    const codes = await ActivityCode.getCodesByUserId(req.user.id);
    res.json({ codes });
  } catch (error) {
    console.error('获取用户活动代码错误:', error);
    res.status(500).json({ error: '获取活动代码失败' });
  }
});

// 创建活动代码（管理员）
router.post('/codes', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { code, name, description, rules } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: '活动代码和名称不能为空' });
    }

    // 检查代码是否已存在
    const existing = await ActivityCode.getByCode(code);
    if (existing) {
      return res.status(400).json({ error: '活动代码已存在' });
    }

    const result = await ActivityCode.create(code, name, description, req.user.id, rules);

    res.status(201).json({
      message: '活动代码创建成功',
      code: {
        id: result.lastInsertRowid,
        code,
        name,
        description,
        rules
      }
    });
  } catch (error) {
    console.error('创建活动代码错误:', error);
    res.status(500).json({ error: '创建活动代码失败' });
  }
});

// 更新活动代码（管理员）
router.put('/codes/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, rules } = req.body;

    // 获取现有活动代码
    const existing = await ActivityCode.getById(id);
    if (!existing) {
      return res.status(404).json({ error: '活动代码不存在' });
    }

    // 使用新值或现有值
    const updatedName = name || existing.name;
    const updatedDescription = description !== undefined ? description : existing.description;

    // 合并规则
    const updatedRules = {
      minPlayers: rules?.minPlayers !== undefined ? rules.minPlayers : existing.min_players,
      maxPlayers: rules?.maxPlayers !== undefined ? rules.maxPlayers : existing.max_players,
      playersPerGame: rules?.playersPerGame !== undefined ? rules.playersPerGame : existing.players_per_game,
      requireSeed: rules?.requireSeed !== undefined ? rules.requireSeed : (existing.require_seed === 1),
      seedRequired: rules?.seedRequired !== undefined ? rules.seedRequired : (existing.seed_required === 1)
    };

    await ActivityCode.update(id, updatedName, updatedDescription, updatedRules);

    res.json({ message: '活动代码更新成功' });
  } catch (error) {
    console.error('更新活动代码错误:', error);
    res.status(500).json({ error: '更新活动代码失败：' + error.message });
  }
});

// 获取单个活动代码详情（管理员）
router.get('/codes/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const code = await ActivityCode.getById(id);

    if (!code) {
      return res.status(404).json({ error: '活动代码不存在' });
    }

    res.json(code);
  } catch (error) {
    console.error('获取活动代码错误:', error);
    res.status(500).json({ error: '获取活动代码失败' });
  }
});

// 删除活动代码（管理员）
router.delete('/codes/:id', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await ActivityCode.delete(id);
    res.json({ message: '活动代码删除成功' });
  } catch (error) {
    console.error('删除活动代码错误:', error);
    res.status(500).json({ error: '删除活动代码失败' });
  }
});

// 获取活动代码的用户列表（管理员）
router.get('/codes/:id/users', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const users = await ActivityCode.getUsersByCodeId(id);
    res.json({ users });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 为活动代码添加用户（管理员）
router.post('/codes/:id/users', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '用户列表不能为空' });
    }

    await ActivityCode.addUsersBatch(id, userIds);

    res.json({ message: `成功添加 ${userIds.length} 名用户` });
  } catch (error) {
    console.error('添加用户错误:', error);
    res.status(500).json({ error: '添加用户失败' });
  }
});

// 从活动代码移除用户（管理员）
router.delete('/codes/:id/users/:userId', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;
    await ActivityCode.removeUser(id, userId);
    res.json({ message: '用户已移除' });
  } catch (error) {
    console.error('移除用户错误:', error);
    res.status(500).json({ error: '移除用户失败' });
  }
});

// ========== 种子选手管理 ==========

// 获取活动代码的种子选手列表（管理员）
router.get('/codes/:id/seeds', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const seeds = await ActivityCode.getSeedsByCodeId(id);
    res.json({ seeds });
  } catch (error) {
    console.error('获取种子选手列表错误:', error);
    res.status(500).json({ error: '获取种子选手列表失败' });
  }
});

// 为活动代码添加种子选手（管理员）
router.post('/codes/:id/seeds', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '种子选手列表不能为空' });
    }

    await ActivityCode.addSeedsBatch(id, userIds);

    res.json({ message: `成功添加 ${userIds.length} 名种子选手` });
  } catch (error) {
    console.error('添加种子选手错误:', error);
    res.status(500).json({ error: '添加种子选手失败' });
  }
});

// 从活动代码移除种子选手（管理员）
router.delete('/codes/:id/seeds/:userId', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id, userId } = req.params;
    await ActivityCode.removeSeed(id, userId);
    res.json({ message: '种子选手已移除' });
  } catch (error) {
    console.error('移除种子选手错误:', error);
    res.status(500).json({ error: '移除种子选手失败' });
  }
});

// 获取所有用户（用于分配）
router.get('/users/all', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    let users;

    // 超级管理员可以看到所有用户
    if (req.user.role === 'super_admin') {
      users = await User.findAll();
    } else {
      // 活动管理员只能看到自己和关联的普通用户
      users = await User.findByActivityAdminId(req.user.id);
    }

    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      isSeed: u.is_seed === 1,
      activityAdminId: u.activity_admin_id
    }));
    res.json({ users: formattedUsers });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// ========== 活动邀请码管理 ==========

// 生成活动邀请码
router.post('/codes/:id/invite', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { maxUses } = req.body;

    // 检查活动代码是否存在
    const code = await ActivityCode.getById(id);
    if (!code) {
      return res.status(404).json({ error: '活动代码不存在' });
    }

    // 创建邀请码
    const result = await ActivityInvite.create(id, req.user.id, maxUses || 1);
    const invite = await ActivityInvite.getByCode(ActivityInvite.generateInviteCode());

    // 生成邀请链接（包含完整 URL）
    const baseUrl = process.env.BASE_URL || 'https://autogame.sijunsi.com';
    const inviteUrl = `${baseUrl}/invite/${invite.invite_code}`;

    res.json({
      message: '邀请码生成成功',
      invite: {
        id: result.lastInsertRowid,
        code: invite.invite_code,
        activityName: invite.activity_name,
        activityCode: invite.activity_code,
        inviteUrl,
        maxUses: invite.max_uses,
        createdAt: invite.created_at
      }
    });
  } catch (error) {
    console.error('生成邀请码错误:', error);
    res.status(500).json({ error: '生成邀请码失败：' + error.message });
  }
});

// 获取活动的所有邀请码
router.get('/codes/:id/invites', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const invites = await ActivityInvite.getByActivityCodeId(id);
    res.json({ invites });
  } catch (error) {
    console.error('获取邀请码列表错误:', error);
    res.status(500).json({ error: '获取邀请码列表失败：' + error.message });
  }
});

// 删除邀请码
router.delete('/invites/:code', authMiddleware, activityAdminMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    await ActivityInvite.delete(code);
    res.json({ message: '邀请码已删除' });
  } catch (error) {
    console.error('删除邀请码错误:', error);
    res.status(500).json({ error: '删除邀请码失败：' + error.message });
  }
});

// 验证邀请码（公开接口，用于扫码后检查）
router.get('/invite/:code/verify', async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await ActivityInvite.getByCode(code);

    if (!invite) {
      return res.status(404).json({ error: '邀请码不存在' });
    }

    if (invite.is_used === 1) {
      return res.status(400).json({ error: '邀请码已被使用' });
    }

    res.json({
      valid: true,
      activity: {
        code: invite.activity_code,
        name: invite.activity_name,
        creator: invite.creator_name,
        creatorEmail: invite.creator_email
      }
    });
  } catch (error) {
    console.error('验证邀请码错误:', error);
    res.status(500).json({ error: '验证邀请码失败：' + error.message });
  }
});

// 使用邀请码（需要登录）
router.post('/invite/:code/use', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    const invite = await ActivityInvite.getByCode(code);

    if (!invite) {
      return res.status(404).json({ error: '邀请码不存在' });
    }

    if (invite.is_used === 1) {
      return res.status(400).json({ error: '邀请码已被使用' });
    }

    // 检查用户是否已加入该活动
    const existingMembers = await ActivityCode.getUsersByCodeId(invite.activity_code_id);
    const isAlreadyMember = existingMembers.some(m => m.id === req.user.id);

    if (isAlreadyMember) {
      return res.status(400).json({ error: '你已经是该活动的成员' });
    }

    // 添加用户到活动
    await ActivityCode.addUser(invite.activity_code_id, req.user.id);

    // 标记邀请码为已使用
    await ActivityInvite.markAsUsed(code, req.user.id);

    res.json({
      message: '加入活动成功',
      activity: {
        code: invite.activity_code,
        name: invite.activity_name
      }
    });
  } catch (error) {
    console.error('使用邀请码错误:', error);
    res.status(500).json({ error: '使用邀请码失败：' + error.message });
  }
});

module.exports = router;
