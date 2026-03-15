const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未授权，请先登录' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的令牌' });
  }
};

// 管理员权限检查
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
};

// 种子选手权限检查
const seedMiddleware = (req, res, next) => {
  if (!req.user.isSeed) {
    return res.status(403).json({ error: '需要种子选手权限' });
  }
  next();
};

module.exports = { authMiddleware, adminMiddleware, seedMiddleware };
