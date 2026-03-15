# 域名配置说明

## 已添加的域名

✅ **autogame.sijunsi.com** 已添加到 Vercel 项目

## DNS 配置步骤

### 1. 登录域名服务商

访问你的域名注册商（如阿里云、腾讯云、GoDaddy 等）的 DNS 管理控制台。

### 2. 添加 DNS 记录

#### 方案 A：使用 A 记录（推荐）

| 主机记录 | 记录类型 | 记录值 | TTL |
|---------|---------|--------|-----|
| `@` | A | `76.76.21.21` | 自动 |
| `www` | CNAME | `autogame.sijunsi.com` | 自动 |

#### 方案 B：使用 CNAME 记录

| 主机记录 | 记录类型 | 记录值 | TTL |
|---------|---------|--------|-----|
| `autogame` | CNAME | `cname.vercel-dns.com` | 自动 |

### 3. 等待 DNS 生效

DNS 记录通常需要 5-30 分钟生效，最长可能需要 48 小时。

### 4. 验证配置

在 Vercel 控制台查看域名状态：
- 访问：https://vercel.com/gthsky-8015s-projects/autogame/domains
- 状态显示为 "Valid Configuration" 即表示配置成功

## SSL 证书

Vercel 会自动为域名配置 SSL 证书，无需手动操作。

配置成功后，访问：
- ✅ https://autogame.sijunsi.com
- ✅ https://www.autogame.sijunsi.com

## 常见问题

### 1. 域名验证失败
- 检查 DNS 记录是否正确
- 等待 DNS 生效
- 清除本地 DNS 缓存

### 2. 访问显示错误
- 确保使用 HTTPS 访问
- 检查域名是否已正确解析到 Vercel

## 当前部署地址

- **自定义域名**: https://autogame.sijunsi.com (配置 DNS 后生效)
- **Vercel 域名**: https://autogame-psi.vercel.app (立即可用)
