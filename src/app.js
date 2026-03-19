const express = require('express');
const cors = require('cors');
const path = require('path');

// 本地开发时加载 .env
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// 导入路由
const authRoutes = require('./routes/auth');
const availabilityRoutes = require('./routes/availability');
const teamRoutes = require('./routes/team');
const teamRebuildRoutes = require('./routes/teamRebuild');
const dataCleanupRoutes = require('./routes/dataCleanup');
const adminRoutes = require('./routes/admin');
const activityCodeRoutes = require('./routes/activityCode');

// 初始化数据库
const { initDatabase } = require('./utils/init-db');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '../public')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/team-rebuild', teamRebuildRoutes);
app.use('/api/data-cleanup', dataCleanupRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/activity', activityCodeRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '文体活动组队系统运行中' });
});

// 邀请页面路由（必须在通配符路由之前）
app.get('/invite/:code', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 前端路由 - 所有其他请求返回 index.html
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库（异步）
    await initDatabase();

    // Vercel Serverless 环境不需要启动服务器
    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║           文体活动自动组队系统已启动                        ║
║                                                           ║
║   本地访问：http://localhost:${PORT}                        ║
║   API 地址：http://localhost:${PORT}/api/health              ║
║                                                           ║
║   默认管理员：${process.env.ADMIN_EMAIL || 'admin@autogame.com'}
║   默认密码：${process.env.ADMIN_PASSWORD || 'admin123456'}
║                                                           ║
║   种子选手：seed@autogame.com
║   默认密码：seed123456
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
      });
    }
  } catch (error) {
    console.error('启动失败:', error);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

startServer();

// Vercel 导出
module.exports = app;
