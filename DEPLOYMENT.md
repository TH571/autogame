# 数据库持久化方案

## 问题原因
Vercel Serverless 环境使用 `/tmp` 目录存储 SQLite 数据库，该目录在每次部署后会被清空。

## 解决方案

### 方案 1：使用 Vercel Postgres（推荐）
Vercel 官方提供的 PostgreSQL 服务，免费额度足够使用。

#### 步骤：
1. 访问 https://vercel.com/dashboard
2. 进入项目 → Storage → Create Database → Vercel Postgres
3. 连接数据库后会自动添加环境变量
4. 安装依赖：`npm install @vercel/postgres`

#### 修改代码：
```bash
npm install @vercel/postgres
```

### 方案 2：使用外部 SQLite 服务（如 Turso）
Turso 提供基于 SQLite 的边缘数据库，免费额度充足。

#### 步骤：
1. 访问 https://turso.tech/
2. 创建数据库获取连接字符串
3. 安装依赖：`npm install @libsql/client`

### 方案 3：使用 MongoDB Atlas（免费）
MongoDB 提供的免费云数据库服务。

#### 步骤：
1. 访问 https://www.mongodb.com/atlas
2. 创建免费集群
3. 获取连接字符串
4. 安装依赖：`npm install mongodb`

### 方案 4：本地部署 + 自动同步
如果不想使用云服务，可以：

1. 在本地运行应用
2. 使用 Git 备份数据库结构
3. 定期导出导入数据

## 快速解决（推荐 Vercel Postgres）

运行以下命令：

```bash
# 1. 安装 Vercel Postgres
npm install @vercel/postgres

# 2. 创建 Vercel Postgres 数据库
vercel link
vercel postgres create

# 3. 重新部署
vercel deploy --prod
```

## 临时解决方案

如果只是想测试，可以在部署后手动添加测试数据：
1. 部署完成后
2. 使用管理员账号登录
3. 手动创建活动代码和用户
4. 注意：下次部署后数据会再次丢失

## 环境变量配置

在 Vercel 项目设置中添加：

```env
# Vercel Postgres
POSTGRES_URL=your-postgres-url

# 或 Turso
TURSO_DATABASE_URL=your-turso-url
TURSO_AUTH_TOKEN=your-auth-token
```

## 迁移脚本

创建 `scripts/migrate-to-postgres.js` 将现有 SQLite 数据迁移到 Postgres。
