# 数据库持久化配置指南

## ⚠️ 重要提示

**Vercel Serverless 环境使用临时存储，每次部署后数据库会重置！**

## 解决方案

### 方案 1：使用 Vercel Postgres（推荐）

1. **创建 Vercel Postgres 数据库**
   ```bash
   vercel link
   vercel postgres create
   ```

2. **或手动创建**
   - 访问 https://vercel.com/dashboard
   - 进入项目 → Storage → Create Database → Vercel Postgres

3. **安装依赖**
   ```bash
   npm install @vercel/postgres
   ```

4. **部署**
   ```bash
   vercel deploy --prod
   ```

### 方案 2：使用本地部署

如果您只是想测试功能，可以：

1. **本地运行**
   ```bash
   npm run dev
   ```

2. **数据会保存在** `data/autogame.db`

3. **定期备份数据库文件**

### 方案 3：使用外部数据库服务

推荐服务：
- **Vercel Postgres** (免费额度充足)
- **Turso** (基于 SQLite 的边缘数据库)
- **MongoDB Atlas** (免费集群)
- **Supabase** (免费 PostgreSQL)

## 当前状态

当前项目使用 SQLite，适合：
- ✅ 本地开发和测试
- ✅ 演示功能
- ❌ 不适合生产环境（数据会丢失）

## 生产环境部署建议

1. 使用 Vercel Postgres 或其他云数据库
2. 配置数据库连接字符串到 Vercel 环境变量
3. 定期备份数据
4. 使用数据库迁移工具管理表结构

## 快速测试（数据会在部署后丢失）

```bash
# 1. 部署到 Vercel
vercel deploy --prod

# 2. 登录后手动创建测试数据
# - 使用 admin@autogame.com 登录
# - 创建活动代码
# - 创建用户

# 3. 下次部署后需要重新创建数据
```

## 环境变量配置

在 Vercel 项目设置中添加：

```env
# 数据库配置
DATABASE_URL=your-database-url
POSTGRES_URL=your-postgres-url

# 应用配置
ADMIN_EMAIL=admin@autogame.com
ADMIN_PASSWORD=admin123456
JWT_SECRET=your-secret-key
```
