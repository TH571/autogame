/**
 * 数据库初始化模块
 * 为了兼容性，导出 database.js 的内容
 */

const database = require('./database');

module.exports = {
  initDatabase: database.initDatabase,
  getDb: database.getDb,
  isVercel: database.isVercel
};
