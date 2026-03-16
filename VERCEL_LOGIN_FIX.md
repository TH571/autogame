# Vercel 部署后超级管理员无法登录 - 完整解决方案

## 问题诊断

### 1. 访问诊断 API

部署完成后，访问以下 URL 检查数据库状态：

```
https://autogame.sijunsi.com/api/auth/diagnostic
```

或 Vercel 域名：
```
https://autogame-th571s-projects.vercel.app/api/auth/diagnostic
```

**正常响应示例：**
```json
{
  "database": "PostgreSQL",
  "totalUsers": 2,
  "hasSuperAdmin": true,
  "hasActivityAdmin": true,
  "adminEmail": "admin@autogame.com",
  "env": {
    "ADMIN_EMAIL": "admin@autogame.com",
    "ADMIN_PASSWORD": "已设置",
    "JWT_SECRET": "已设置",
    "POSTGRES_URL": "已设置"
  }
}
```

**如果 `totalUsers` 为 0 或 `hasSuperAdmin` 为 false，说明数据库未正确初始化。**

---

## 解决方案

### 方案 1：在 Vercel 设置环境变量（必须）

1. 访问：https://vercel.com/th571s-projects/autogame/settings/environment-variables

2. 添加以下环境变量（点击 **Add New**）：

   | 变量名 | 值 | 环境 |
   |--------|-----|------|
   | `ADMIN_EMAIL` | `admin@autogame.com` | Production, Preview, Development |
   | `ADMIN_PASSWORD` | `admin123456` | Production, Preview, Development |
   | `JWT_SECRET` | `autogame-secret-2024` | Production, Preview, Development |

3. 保存后，**必须重新部署** 才能生效

---

### 方案 2：手动触发重新部署

1. 访问：https://vercel.com/th571s-projects/autogame/deployments

2. 找到最新部署，点击 **⋮** → **Redeploy**

3. 等待部署完成（约 1-2 分钟）

---

### 方案 3：检查 Vercel Postgres 连接

1. 访问：https://vercel.com/th571s-projects/autogame/settings/storage

2. 确认已连接数据库

3. 如果未连接：
   - 点击 **Add Database**
   - 选择 **Vercel Postgres**
   - 创建或选择数据库

4. 连接后，Vercel 会自动添加以下环境变量：
   - `POSTGRES_URL`
   - `POSTGRES_PRISMA_URL`
   - `POSTGRES_URL_NO_SSL`
   - `POSTGRES_URL_NON_POOLING`

---

### 方案 4：手动初始化数据库

如果上述方案都无效，可以手动创建管理员账户：

1. 在 Vercel 项目页面，进入 **Storage** → 点击你的数据库

2. 点击 **SQL** 标签

3. 执行以下 SQL 创建管理员：

```sql
-- 创建超级管理员
INSERT INTO users (email, password, name, role, invite_code, created_at, updated_at)
VALUES (
  'admin@autogame.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  '铁',
  'super_admin',
  'SUPER' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;

-- 创建活动管理员（种子选手）
INSERT INTO users (email, password, name, role, is_seed, invite_code, created_at, updated_at)
VALUES (
  'seed@autogame.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  '蚊子',
  'activity_admin',
  true,
  'ADMIN' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  NOW(),
  NOW()
) ON CONFLICT (email) DO NOTHING;
```

> 密码 `admin123456` 和 `seed123456` 的 bcrypt 哈希值相同：`$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy`

---

## 验证登录

完成上述任一方案后：

1. 访问：https://autogame.sijunsi.com

2. 使用以下账户登录：
   - 邮箱：`admin@autogame.com`
   - 密码：`admin123456`

---

## 查看部署日志

如果问题仍然存在：

1. 访问：https://vercel.com/th571s-projects/autogame/deployments

2. 点击最新部署

3. 查看 **Functions** 日志，寻找：
   - `[Postgres Init]` 开头的日志
   - `[Login]` 开头的日志

4. 将日志内容发送给我进一步诊断

---

## 常见错误

### 错误 1: `POSTGRES_URL is not defined`
**原因**：未连接 Vercel Postgres  
**解决**：按方案 3 连接数据库

### 错误 2: `table "users" does not exist`
**原因**：数据库表未创建  
**解决**：重新部署，数据库初始化会自动创建表

### 错误 3: `邮箱或密码错误`（但数据库中有用户）
**原因**：JWT_SECRET 未设置或变化  
**解决**：设置 JWT_SECRET 环境变量后重新部署
