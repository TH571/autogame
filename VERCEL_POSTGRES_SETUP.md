# Vercel Postgres 数据库设置指南

## 步骤 1：创建 Vercel Postgres 数据库

### 方法 1：通过 Vercel 控制台（推荐）

1. 访问 https://vercel.com/dashboard
2. 选择你的项目 `autogame`
3. 点击左侧 **Storage** → **Add Database**
4. 选择 **Postgres** → **Create Database**
5. 输入数据库名称（如 `autogame-db`）
6. 点击 **Create**

### 方法 2：通过 Vercel UI

访问：https://vercel.com/gthsky-8015s-projects/autogame/storage

## 步骤 2：连接数据库

创建数据库后，Vercel 会自动添加环境变量到你的项目：

- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`

## 步骤 3：部署数据库结构

运行迁移脚本：

```bash
npm install @vercel/postgres
node scripts/migrate-to-postgres.js
```

## 步骤 4：更新代码使用 Postgres

代码已经配置好自动检测环境：
- 本地开发：使用 SQLite
- Vercel 生产环境：使用 Postgres

## 步骤 5：重新部署

```bash
vercel deploy --prod
```

## 验证

部署完成后：
1. 访问 https://autogame-psi.vercel.app
2. 使用 admin@autogame.com 登录
3. 数据应该持久保存，不会因为重新部署而丢失

## 故障排除

### 检查环境变量

在 Vercel 控制台确认环境变量已设置：
1. 进入项目设置
2. 查看 Environment Variables
3. 确认 `POSTGRES_URL` 存在

### 手动添加环境变量

如果自动添加失败，手动添加：

```
POSTGRES_URL=postgres://user:password@host:port/database
```

### 查看数据库

使用 Vercel 控制台查看数据库内容：
1. Storage → 选择你的数据库
2. 点击 **Tables** 查看表结构
3. 点击 **Data** 查看数据

## 本地测试 Postgres

如果想在本地测试 Postgres 连接：

```bash
# 获取连接字符串
vercel env pull

# 本地运行（会使用 Postgres）
npm run dev
```

## 数据迁移

从 SQLite 迁移到 Postgres：

```bash
node scripts/migrate-sqlite-to-postgres.js
```
