# 用 DNMP 部署 WFX 网站 — 一步步指南

## ⚠ 先理解一件事（很重要）

你装的 **DNMP** 是给 **PHP** 网站用的（Docker + Nginx + MySQL + PHP + Redis）。
但你的网站后端是 **Python**（`server.py`），不是 PHP。

所以不能直接把网站文件丢进 DNMP 的网站目录就完事——那样 admin 登录、报价提交
这些功能都不会工作（你之前遇到的"登不进去"就是这个原因）。

**解决办法**：给 DNMP 额外加一个"Python 容器"来跑 `server.py`，让 DNMP 的
Nginx 把访客请求转发给它。MySQL、Redis、Nginx 都用 DNMP 现成的，不浪费。

这套配置我已经做好了，下面照着做即可。

---

## 你需要准备的文件（我都放在网站文件夹里了）

- `Dockerfile` — 告诉 Docker 怎么打包 Python 后端
- `.dockerignore` — 打包时排除密钥等
- `docker-compose.wfx.yml` — 启动 Python 后端容器的配置
- `deploy/dnmp-nginx-wanfuxin-dg.conf` — DNMP 的 Nginx 转发配置
- `.env` — 真实密钥（我单独给你的 env-REAL-do-not-commit.txt，改名成 .env）

---

## 第 1 步：把网站文件放到服务器

把整个网站文件夹（包含 server.py、Dockerfile、images/ 等）上传到服务器，
比如放到 DNMP 旁边的一个目录：

```
/root/dnmp/                  ← 你的 DNMP 安装目录
/root/wfx-website/           ← 把网站文件放这里（和 dnmp 平级）
```

`.env` 文件要放在 `/root/wfx-website/.env`（用我给的真实版内容）。

---

## 第 2 步：确认 DNMP 在运行 + 找到它的网络名

在服务器命令行里：

```bash
# 进入 dnmp 目录，启动它（如果还没启动）
cd /root/dnmp
docker compose up -d

# 查看 Docker 网络名（记下 dnmp 的网络名）
docker network ls
```

你会看到类似 `dnmp_default` 的网络名。**如果不是 `dnmp_default`**，
打开 `docker-compose.wfx.yml`，把最后一行的 `name: dnmp_default` 改成实际的名字。

```bash
# 同时确认 MySQL 容器叫什么名字
docker ps
```
找到 MySQL 那个容器，看它的 NAMES。DNMP 默认叫 `mysql`。
**如果不是 `mysql`**，打开 `docker-compose.wfx.yml`，把 `WFX_DB_HOST: mysql`
改成实际的容器名。

---

## 第 3 步：在 DNMP 的 MySQL 里建数据库 + 导入表

```bash
# 进入 DNMP 的 MySQL 容器（mysql 换成实际容器名）
docker exec -it mysql mysql -u root -p
# 输入 DNMP 的 MySQL root 密码（在 dnmp 的 .env 里能找到）
```

进入 MySQL 后，依次执行：

```sql
CREATE DATABASE wfx_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wfx_user'@'%' IDENTIFIED BY '给wfx设一个数据库密码';
GRANT ALL PRIVILEGES ON wfx_website.* TO 'wfx_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

⚠ 把上面 `'给wfx设一个数据库密码'` 换成你自己定的密码，然后把这个密码
填到 `/root/wfx-website/.env` 里的 `WFX_DB_PASSWORD=` 后面，
并设 `WFX_DB_USER=wfx_user`。

然后导入表结构（在 wfx-website 目录里执行）：

```bash
cd /root/wfx-website

# 导入主表
docker exec -i mysql mysql -u root -p'你的root密码' wfx_website < schema.sql

# 导入两个迁移
docker exec -i mysql mysql -u root -p'你的root密码' wfx_website < migrations/2026-06-download-requests.sql
docker exec -i mysql mysql -u root -p'你的root密码' wfx_website < migrations/2026-05-audit-log-immutable.sql
```

---

## 第 4 步：启动 Python 后端容器

```bash
cd /root/wfx-website

# 用我做的 compose 文件构建并启动
docker compose -f docker-compose.wfx.yml up -d --build

# 看日志确认启动成功（看到 "PRODUCTION Server" 字样就对了）
docker compose -f docker-compose.wfx.yml logs -f
# 按 Ctrl+C 退出看日志（容器继续在后台跑）
```

如果日志报错 `SESSION_SECRET ...`，说明 `.env` 里的 `WFX_SESSION_SECRET`
还是占位符——用我给你的真实 .env（里面已经生成了随机密钥）。

---

## 第 5 步：配置 DNMP 的 Nginx 转发

```bash
# 把转发配置复制到 DNMP 的 nginx 配置目录
# （路径可能是 services/nginx/conf.d/ 或 conf/conf.d/，看你 dnmp 里 .conf 样例在哪）
cp /root/wfx-website/deploy/dnmp-nginx-wanfuxin-dg.conf \
   /root/dnmp/services/nginx/conf.d/wanfuxin-dg.com.conf

# 重载 DNMP 的 nginx（在 dnmp 目录执行，nginx 换成实际容器名）
cd /root/dnmp
docker compose exec nginx nginx -s reload
```

---

## 第 6 步：测试

浏览器打开（先用 http，配好 HTTPS 后再用 https）：

```
http://wanfuxin-dg.com/
http://wanfuxin-dg.com/admin/index.html
```

admin 首次登录：
- 用户名：`admin`
- 密码：`wfx6688`（如果你在 .env 里设了 `WFX_ADMIN_INITIAL_PASSWORD`，就用那个）

登录后会强制你改密码。

---

## 第 7 步：HTTPS 证书（上线前必做）

DNMP 通常自带 certbot 或可以用 acme。给 wanfuxin-dg.com 申请证书后，
打开 `deploy/dnmp-nginx-wanfuxin-dg.conf`，取消注释 HTTPS 那一段，
填上证书路径，再重载 nginx。

---

## 常见问题

**Q: admin 还是登不进，报 Invalid username or password？**
A: 看 Python 容器日志 `docker compose -f docker-compose.wfx.yml logs`。
   如果日志里有 "First-run admin bootstrap"，说明账号文件刚生成，用日志里
   提示的密码。如果之前生成过，删掉 `uploads/.auth/admin_users.json` 重启容器。

**Q: 页面打开了但报数据库错误？**
A: 检查 `WFX_DB_HOST`（要等于 DNMP 的 MySQL 容器名）、`WFX_DB_PASSWORD`
   （要和第 3 步建用户时设的一致）。

**Q: 邮件发不出去？**
A: `.env` 里的 SMTP 配置（smtp.exmail.qq.com + 授权码）要对。不影响网站其他功能。

---

## 更新网站内容后怎么重新部署

```bash
cd /root/wfx-website
# 上传新文件后，重新构建并重启
docker compose -f docker-compose.wfx.yml up -d --build
```
