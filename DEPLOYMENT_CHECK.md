# Vercel 部署检查清单

## 重要：设置环境变量

部署后，必须在 Vercel 中设置以下环境变量：

1. 访问：https://vercel.com/th571s-projects/autogame/settings/environment-variables
2. 添加以下变量：

| 变量名 | 值 | 环境 |
|--------|-----|------|
| `ADMIN_EMAIL` | `admin@autogame.com` | Production |
| `ADMIN_PASSWORD` | `admin123456` | Production |
| `JWT_SECRET` | `autogame-secret-key-2024-change-in-production` | Production |

3. 点击 **Save** 保存
4. **重新部署** 使环境变量生效

## 部署状态检查

### 1. 检查 Git 连接
访问：https://vercel.com/th571s-projects/autogame/settings/git

如果显示 "Connect Git Repository"，请点击连接：
- 选择 GitHub 仓库：`TH571/autogame`
- 授权 Vercel 访问

### 2. 检查部署历史
访问：https://vercel.com/th571s-projects/autogame/deployments

查看最新部署状态：
- ✅ **Ready** - 部署成功
- ⚠️ **Building** - 正在构建
- ❌ **Error** - 部署失败（点击查看日志）

### 3. 常见部署错误及解决方案

#### 错误：better-sqlite3 构建失败
```
Error: Could not find a valid SQLite binding
```
**解决方案**：已将 `better-sqlite3` 移至 `optionalDependencies`，Vercel 会自动跳过。

#### 错误：Postgres 连接失败
```
Error: POSTGRES_URL is not defined
```
**解决方案**：
1. 在 Vercel 项目中连接 Postgres 数据库
2. 访问：https://vercel.com/th571s-projects/autogame/settings/storage
3. 点击 "Add Database" → "Vercel Postgres"
4. 创建数据库 `autogame`

#### 错误：构建超时
```
Error: Build timed out
```
**解决方案**：
- 检查 `package.json` 中的 `build` 脚本
- 确保没有耗时的构建操作

### 4. 手动触发部署

如果 Git 已连接但未自动部署：

1. **通过 Vercel 控制台**：
   - 访问 Deployments 页面
   - 点击 "Redeploy" 按钮

2. **通过 GitHub**：
   - 推送一个空提交：
   ```bash
   git commit --allow-empty -m "trigger deploy"
   git push
   ```

3. **通过 Vercel CLI**：
   ```bash
   vercel deploy --prod
   ```

### 5. 验证部署成功

部署成功后，访问：
- **自定义域名**：https://autogame.sijunsi.com
- **Vercel 域名**：https://autogame-th571s-projects.vercel.app

测试项目：
1. 使用管理员账户登录
   - 邮箱：`admin@autogame.com`
   - 密码：`admin123456`
2. 创建测试用户
3. 申报时间
4. 重新部署后检查数据是否保留

## 当前配置

### vercel.json
```json
{
  "postgres": {
    "database": "autogame"
  }
}
```

### package.json
- Node.js 引擎：>=18.x
- 生产依赖：@vercel/postgres, express, 等
- 可选依赖：better-sqlite3（仅本地开发）

### 环境变量
Vercel 会自动设置以下变量（连接 Postgres 后）：
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`
- `POSTGRES_URL_NON_POOLING`

## 联系支持

如果问题仍然存在：
1. 查看 Vercel 部署日志
2. 检查 Postgres 连接状态
3. 确认 Git 仓库已正确连接
