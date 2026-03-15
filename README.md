# 文体活动自动组队系统

一个用于统计用户可用时间并自动组建 4 人活动团队的 Web 应用系统。

## 功能特点

- **用户注册/登录**: 支持用户注册和 JWT 认证登录
- **时间申报**: 用户可申报未来 14 天的可用时间（下午、晚上、下午连晚上）
- **24 小时后悔期**: 
  - ✅ 申报后 24 小时内可随时修改或删除
  - 🔒 超过 24 小时后，锁定 3 天内的时间（保证团队稳定性）
  - 📅 3 天后的时间始终可以修改
- **自动组队**: 
  - 每队 4 人
  - 种子选手必须参加每场活动
  - 普通用户公平分配，避免连续参与
  - 保证每位用户至少参与一次（如可能）
- **管理员后台**: 
  - **用户管理**: 创建、编辑、删除用户
  - **角色管理**: 普通用户、管理员、种子选手
  - **活动管理**: 手动触发组队、查看活动列表
  - **数据统计**: 用户统计、参与情况
- **简洁 UI**: Bootstrap 5 + 响应式设计

## 技术栈

- **后端**: Node.js + Express.js
- **数据库**: SQLite (better-sqlite3)
- **前端**: HTML5 + CSS3 + JavaScript (Bootstrap 5)
- **认证**: JWT + bcrypt

## 在线演示

**Vercel 部署地址**: https://autogame-psi.vercel.app

> ⚠️ **注意**: Vercel Serverless 环境使用临时存储，每次重新部署后数据库会重置。
> 
> 解决方案：
> 1. 使用 Vercel Postgres（推荐）- 查看 [DATABASE.md](DATABASE.md)
> 2. 本地部署运行 - 数据保存在 `data/autogame.db`
> 3. 使用外部数据库服务（Turso、Supabase 等）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库并启动

```bash
# 开发模式（自动重启）
npm run dev

# 或生产模式
npm start
```

### 3. 访问应用

打开浏览器访问：http://localhost:3000

## 默认账户

### 系统账户
| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@autogame.com | admin123456 |
| 种子选手 | seed@autogame.com | seed123456 |

### 测试用户
| 姓名 | 邮箱 | 密码 | 特点 |
|------|------|------|------|
| 李明 | liming@example.com | 123456 | 主要下午有空 |
| 王芳 | wangfang@example.com | 123456 | 主要晚上有空 |
| 张伟 | zhangwei@example.com | 123456 | 经常有空 |
| 刘娜 | liuna@example.com | 123456 | 周末有空 |
| 陈杰 | chenjie@example.com | 123456 | 随机有空 |

## API 接口

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `PUT /api/auth/me` - 更新用户信息

### 时间申报
- `GET /api/availability` - 获取用户的可用时间
- `POST /api/availability` - 提交可用时间
- `POST /api/availability/batch` - 批量提交可用时间
- `DELETE /api/availability/:date/:timeSlot` - 删除可用时间
- `GET /api/availability/dates/next14` - 获取未来 14 天日期列表

### 组队活动
- `POST /api/team/build` - 执行自动组队（管理员）
- `POST /api/team/build/:date` - 为特定日期组队（管理员）
- `GET /api/team/activities` - 获取所有活动
- `GET /api/team/activities/upcoming` - 获取未来活动
- `GET /api/team/activities/my` - 获取我的活动
- `GET /api/team/stats` - 获取组队统计（管理员）

### 管理
- `GET /api/admin/users` - 获取所有用户
- `POST /api/admin/users` - 创建用户
- `PUT /api/admin/users/:id` - 更新用户
- `DELETE /api/admin/users/:id` - 删除用户
- `GET /api/admin/activities` - 获取所有活动
- `PUT /api/admin/activities/:id` - 更新活动状态
- `DELETE /api/admin/activities/:id` - 删除活动
- `GET /api/admin/availabilities` - 获取所有申报

## 组队规则

1. **种子选手优先**: 只有种子选手有空的时间段才会组织活动
2. **4 人成队**: 每个时间段至少需要 4 人才能组队
3. **公平分配**: 
   - 参与次数少的用户优先
   - 避免用户连续参与（前一天参与过则优先级降低）
   - 从未参与的用户最高优先级
4. **时间锁定**: 申报后 3 天内不可修改，保证团队稳定性

## 时间说明

| 代码 | 名称 | 时间段 |
|------|------|--------|
| 1 | 下午 | 14:00 - 18:00 |
| 2 | 晚上 | 19:00 - 22:00 |
| 3 | 下午连晚上 | 全天 |

## 项目结构

```
autogame/
├── src/
│   ├── app.js              # 主应用入口
│   ├── models/             # 数据模型
│   │   ├── User.js
│   │   ├── Availability.js
│   │   └── Activity.js
│   ├── routes/             # API 路由
│   │   ├── auth.js
│   │   ├── availability.js
│   │   ├── team.js
│   │   └── admin.js
│   ├── middleware/         # 中间件
│   │   └── auth.js
│   └── utils/              # 工具函数
│       ├── init-db.js      # 数据库初始化
│       └── TeamBuilder.js  # 组队算法
├── public/                 # 前端静态文件
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── data/                   # 数据库文件（自动生成）
├── .env                    # 环境变量配置
├── package.json
└── README.md
```

## 环境变量

在 `.env` 文件中配置：

```env
PORT=3000
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
DATABASE_PATH=./data/autogame.db
ADMIN_EMAIL=admin@autogame.com
ADMIN_PASSWORD=admin123456
```

## 测试数据

### 添加测试用户
```bash
node scripts/add-test-users.js
```

### 设置种子选手并执行组队测试
```bash
node scripts/setup-seed-and-teams.js
```

### 重置数据库
删除 `data/autogame.db` 文件后重新启动即可重置。

## 邮件通知

当前版本暂未启用邮件通知功能。如需启用，请在 `.env` 中配置 SMTP 信息，并在 `src/utils/TeamBuilder.js` 中添加邮件发送逻辑。

## License

ISC
