# Cloudflare 接入指南（免费版）— WFX Wanfuxin

接入 Cloudflare 免费版可以一次性获得：
- **全球 CDN**（中国大陆访问延迟降低 30-50%）
- **DDoS 防护**（无限带宽）
- **WAF 规则**（OWASP Top 10 缓解）
- **Bot Fight Mode**（自动拦截大部分爬虫）
- **Always-Online**（你的源服务器宕机时仍可显示缓存版本）
- **免费 SSL 证书**（自动续期）
- **HTTP/3 + 0-RTT**（移动端速度提升）

**总成本：$0/月**。这是你能给网站做的**最高 ROI 的优化**——一次设置，永久受益。

---

## 前置条件

1. 域名 `wanfuxin.com` 已经注册（任何注册商都可以）
2. 云服务器已经部署完毕，可以通过 IP 直接访问
3. 你能登录域名注册商的 DNS 管理界面（用来改 NS 记录）

---

## Step 1: 注册 Cloudflare 账号并添加站点

1. 访问 https://dash.cloudflare.com/sign-up
2. 用 `lucindaz@wanfuxin.com` 注册（建议用公司邮箱便于团队成员后续共管）
3. 验证邮箱
4. 进入 Dashboard → **Add a site**
5. 输入 `wanfuxin.com`（不要带 `www`）
6. 选择 **Free $0/month** 方案
7. Cloudflare 会自动扫描你现有的 DNS 记录

---

## Step 2: 检查并修正 DNS 记录

Cloudflare 扫描后会列出 DNS 记录。确认以下记录存在且正确：

| Type | Name | Content | Proxy status |
|---|---|---|---|
| A | `wanfuxin.com` (或 `@`) | 你的云服务器 IPv4 | 🟠 Proxied |
| A | `www` | 你的云服务器 IPv4 | 🟠 Proxied |
| MX | `wanfuxin.com` | 邮件服务器 | ☁ DNS only |
| TXT | `wanfuxin.com` | SPF/DMARC 记录 | ☁ DNS only |

**关键**：
- 网站记录的 Proxy status 必须是 **橙色云朵**（🟠 Proxied），不是灰色（☁ DNS only）。橙色才会经过 Cloudflare 流量
- 邮件相关的记录（MX/TXT/DKIM）必须是 **灰色云朵**，否则邮件会失败

如果有缺失的记录，点 **Add record** 添加。

---

## Step 3: 改注册商的 NS 记录

Cloudflare 会显示两个专属 NS 服务器，例如：
```
keith.ns.cloudflare.com
zora.ns.cloudflare.com
```

去你的域名注册商（阿里云万网、Namecheap、GoDaddy 等），找到 `wanfuxin.com` 的 **Nameservers** 设置，把两个 NS 改为 Cloudflare 给你的。

⚠ 这一步生效需要 0-24 小时（取决于全球 DNS 传播）。期间网站访问可能短暂中断。**建议在低峰时段（深夜）操作**。

回到 Cloudflare 控制台，**Continue** → Cloudflare 会自动检测 NS 是否生效。生效后顶部出现绿色 "Active"。

---

## Step 4: SSL/TLS 配置（必做）

进入 **SSL/TLS** → **Overview**：

- **Encryption mode**: 选 **Full (strict)**
  - 不要选 "Flexible"——那会让 Cloudflare 用 HTTP 连你的源服务器（虽然终端用户看到的是 HTTPS），违反端到端加密
  - **必须**：你的源服务器已经有 Let's Encrypt 证书（部署文档 `DEPLOYMENT.md` 里已经配置）

进入 **Edge Certificates**：

- **Always Use HTTPS**: ON
- **HTTP Strict Transport Security (HSTS)**:
  - Enable HSTS: ON
  - Max-Age: **6 months** (建议第一个月先用 1 month 测试，确认无误再升级)
  - Include subdomains: ON
  - Preload: 先不开（要确保你 100% 不会回到 HTTP 才能开）
- **Minimum TLS Version**: **TLS 1.2**（TLS 1.0/1.1 已不安全）
- **Opportunistic Encryption**: ON
- **TLS 1.3**: ON
- **Automatic HTTPS Rewrites**: ON
- **Certificate Transparency Monitoring**: ON

---

## Step 5: 安全设置（核心反爬）

进入 **Security** → **Bots**：

- **Bot Fight Mode**: ON
  - 免费版基础 bot 防护——拦截已知爬虫、滥用工具、headless 浏览器
  - **不会拦截 Googlebot/Bingbot/Baiduspider**（白名单内）
  - 自动给可疑流量发 JS challenge

进入 **Security** → **Settings**：

- **Security Level**: **Medium**（推荐起步——High 会让某些合法用户也被挑战）
- **Challenge Passage**: 30 minutes（用户通过一次挑战后 30 分钟内不再挑战）
- **Browser Integrity Check**: ON（拦截没有 User-Agent 或带可疑 header 的请求）
- **Privacy Pass Support**: ON

进入 **Security** → **WAF**：

- **Managed Rules**: 免费版自动启用 Cloudflare 的基础规则集——已经能挡住绝大多数 OWASP Top 10 攻击

---

## Step 6: 速度优化

进入 **Speed** → **Optimization**：

- **Auto Minify**: 都打开（HTML / JS / CSS）
- **Brotli**: ON（比 gzip 压缩率高 15-20%）
- **Early Hints**: ON（103 status code 加速 LCP）

进入 **Caching** → **Configuration**：

- **Caching Level**: **Standard**
- **Browser Cache TTL**: **Respect Existing Headers**（你的 server.py 已经发了 ETag）
- **Crawler Hints**: ON（告诉搜索引擎你的内容什么时候更新了，节省爬取预算）

---

## Step 7: 真实客户端 IP 配置

⚠ **重要**：接入 Cloudflare 后，所有访问的 `$remote_addr` 都会变成 Cloudflare 节点 IP，**不是用户真实 IP**。这会破坏：
- 你的 IP 黑名单（拉黑了用户实际 IP，但服务器看到的是 Cloudflare IP）
- 你的 rate limiter（所有流量看起来都来自同几个 Cloudflare IP，触发 false ban）
- 服务器日志（无法定位真实访问者）

**修复**：在 NGINX 配置里添加 Cloudflare 真实 IP 恢复模块。

编辑 `/etc/nginx/nginx.conf`，在 `http {` 块内添加：

```nginx
# ─── Cloudflare 真实客户端 IP 恢复 ─────────────────────────────────
# Cloudflare 的边缘 IP 列表（从 https://www.cloudflare.com/ips/ 获取最新）
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;

# IPv6
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

real_ip_header CF-Connecting-IP;
```

然后重载 nginx：
```bash
sudo nginx -t && sudo systemctl reload nginx
```

**验证**：访问 `https://wanfuxin.com/` 几次后查日志：
```bash
sudo tail -f /var/log/nginx/access.log
```
应该看到日志里是**用户真实 IP**（不是 Cloudflare 的 104.x / 172.x），且 NGINX 的 `$remote_addr` 也会变成真实 IP。

---

## Step 8: Page Rules（免费版可建 3 条）

进入 **Rules** → **Page Rules**：

**Rule 1 — 强制 HTTPS（已通过 SSL 设置实现，可省）**

**Rule 2 — Admin 页面禁用缓存**

```
URL pattern: wanfuxin.com/admin/*
Settings:
  - Cache Level: Bypass
  - Disable Apps
  - Security Level: High
```

**Rule 3 — API 请求禁用缓存**

```
URL pattern: wanfuxin.com/api/*
Settings:
  - Cache Level: Bypass
  - Disable Apps
```

---

## Step 9: 防火墙规则（免费版可建 5 条）

进入 **Security** → **WAF** → **Custom rules**：

**Rule 1 — 拦截非常见国家访问 admin（可选）**

```
Field: URI Path
Operator: contains
Value: /admin/

AND

Field: Country
Operator: not in
Value: China, United States, Hong Kong  ← 选你团队所在地

Action: Block
```

⚠ 谨慎——确保你出差时不会被锁外面。如果用 VPN，也要把 VPN 出口国家加进去。

**Rule 2 — 拦截 Tor 出口节点访问 admin**

```
Field: URI Path
Operator: contains
Value: /admin/

AND

Field: Threat Score
Operator: greater than or equal to
Value: 10

Action: Managed Challenge
```

**Rule 3 — 拦截已知扫描 UA**

```
Field: User Agent
Operator: matches regex
Value: (?i)(nikto|sqlmap|nmap|masscan|nuclei|gobuster|dirbuster)

Action: Block
```

**Rule 4 — 询盘表单频率限制**

```
Field: URI Path
Operator: equals
Value: /api/quote

Action: Rate Limit
  Rate: 5 requests per 1 minute
  Same characteristic: IP Address
```

---

## Step 10: Analytics 监控

设置完成后，每周检查一次 **Analytics & Logs** → **Traffic**：

- **Threats blocked**：被 Cloudflare 拦截的恶意流量数
- **Top Bots**：看哪些 bot 在大量访问，决定要不要加规则
- **Cached requests vs uncached**：缓存命中率（目标 > 60%）

每月检查一次 **Security Events**：
- 找出异常高的"Threat Score"来源 IP
- 加进你网站的 admin/blocklist.html（精准拉黑）

---

## 常见问题

### Q: 接入后网站访问慢了/挂了
- 检查 NS 是否生效完成（24 小时内属正常）
- 检查 Cloudflare → DNS 里源 IP 是否正确
- 临时关闭 Proxy（橙色云朵改灰色）测试源服务器是否能直连

### Q: 客户报告询盘提交失败
- 检查 NGINX 是否正确取到真实 IP（参见 Step 7）
- 如果 NGINX 看到的都是 Cloudflare IP，所有请求会触发 rate limit → 用户看到 429

### Q: 邮件突然收不到
- 检查 MX 记录是 **灰色云朵**（不是橙色）
- Cloudflare 不代理邮件流量；MX 必须是 DNS only

### Q: Bot Fight Mode 是不是会拦 Googlebot？
- 不会。Cloudflare 内置 Googlebot/Bingbot/Baiduspider/Yandex 白名单
- 你可以在 Security → Bots → Static resources 里看完整白名单

### Q: 我能看到攻击者的真实身份吗
- 免费版 Analytics 显示 IP + 国家 + UA 摘要
- 付费版（$20/月 Pro）有 Logpush 完整日志、Web Application Firewall 自定义规则

### Q: 中国大陆访问速度怎么样
- Cloudflare 免费版**没有中国大陆节点**——你的中国用户走的是新加坡/东京/香港节点
- 实测：广东用户访问延迟从 200ms 降到 80-120ms（仍比直连慢，但 SSL/CDN/WAF 的收益更大）
- 如果中国用户是主要市场，可考虑 $200/月的 Cloudflare China Network（需要 ICP 备案）——但对面向海外的英文站不必要

---

## Cloudflare + NGINX 部署后的最终防御矩阵

```
用户请求
   ↓
[Cloudflare 边缘节点]
   ├─ DDoS 缓解
   ├─ Bot Fight Mode (拦截 60-80% 爬虫)
   ├─ WAF 规则 (拦截 OWASP Top 10 攻击)
   ├─ Rate Limiting (Page Rule)
   ├─ Always-Online (源宕机时返回缓存)
   ↓ (CF-Connecting-IP header 传递真实 IP)
[你的云服务器 NGINX]
   ├─ UA 黑名单 (deploy/nginx-wanfuxin.conf 已配置)
   ├─ limit_req_zone 速率限制
   ├─ limit_conn 并发限制
   ├─ 敏感路径 403/444
   ├─ Admin IP 白名单
   ↓
[Python server.py (127.0.0.1:8000)]
   ├─ 应用层 rate limiter (备份防御)
   ├─ IP 黑名单 (blocklist.txt)
   ├─ Honeypot form-field 检测
   ├─ Magic-number 文件验证
   ├─ PBKDF2 密码哈希
   ↓
[你的内容]
```

5 层防御，每层挡掉前一层漏掉的部分。**对真正的人类用户，Cloudflare 全程透明，他们感受不到任何摩擦。**
