const express = require('express');
const router = express.Router();
const DataCleanup = require('../utils/DataCleanup');
const { authMiddleware } = require('../middleware/auth');

// 执行数据清理（仅超级管理员）
router.post('/cleanup', authMiddleware, async (req, res) => {
  try {
    // 检查是否为超级管理员
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '需要超级管理员权限' });
    }

    // 执行清理
    const results = await DataCleanup.cleanupAll();

    res.json({
      message: '数据清理完成',
      results
    });
  } catch (error) {
    console.error('数据清理错误:', error);
    res.status(500).json({ error: '数据清理失败：' + error.message });
  }
});

// 获取数据完整性报告（仅超级管理员）
router.get('/cleanup/report', authMiddleware, async (req, res) => {
  try {
    // 检查是否为超级管理员
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: '需要超级管理员权限' });
    }

    const report = await DataCleanup.getDataIntegrityReport();

    res.json({ report });
  } catch (error) {
    console.error('获取数据报告错误:', error);
    res.status(500).json({ error: '获取数据报告失败：' + error.message });
  }
});

module.exports = router;
