# WFX Wanfuxin — Cloud Deployment Guide

This guide walks through deploying the WFX website on a Linux cloud server
(Ubuntu/Debian) with Nginx, MySQL, HTTPS, and systemd. Estimated time: **~45 minutes**.

---

## 1. Server prerequisites

A fresh Ubuntu 22.04 / Debian 12 VPS with:
- 2+ GB RAM (4 GB recommended for MySQL)
- 20+ GB SSD
- Public IPv4
- DNS A record pointing your domain to the server IP

```bash
# As root or with sudo:
apt update && apt upgrade -y
apt install -y python3 python3-pip python3-venv nginx mysql-server certbot python3-certbot-nginx git ufw
```

## 2. Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

## 3. Create the application user

```bash
# Dedicated unprivileged user — never run web apps as root
adduser --system --group --home /var/www/wanfuxin --shell /bin/bash wfx
```

## 4. MySQL database setup

```bash
# Secure the install
mysql_secure_installation

# Create database + user
sudo mysql <<'SQL'
CREATE DATABASE wfx_website CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'wfx_user'@'localhost' IDENTIFIED BY 'CHANGE-THIS-STRONG-PASSWORD';
GRANT ALL PRIVILEGES ON wfx_website.* TO 'wfx_user'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 5. Deploy the code

```bash
# Place the website files
cd /var/www
git clone <your-repo> wanfuxin       # or: scp -r website-fixed/* user@server:/var/www/wanfuxin/
chown -R wfx:wfx wanfuxin
cd wanfuxin

# Python virtual environment (as wfx user)
sudo -u wfx python3 -m venv venv
sudo -u wfx venv/bin/pip install --upgrade pip
sudo -u wfx venv/bin/pip install mysql-connector-python

# Apply database schema
sudo -u wfx mysql -u wfx_user -p wfx_website < schema.sql
```

## 6. Configure secrets

**Option A — `.env` file (recommended for cloud):**

```bash
sudo -u wfx cp .env.example .env
sudo -u wfx chmod 600 .env
sudo -u wfx nano .env
```

Fill in real values. Generate strong secrets with:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**Option B — `config.py`:**

```bash
sudo -u wfx cp config.example.py config.py
sudo -u wfx chmod 600 config.py
sudo -u wfx nano config.py
```

## 7. Install systemd service

```bash
cp deploy/wfx-website.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable wfx-website
systemctl start wfx-website

# Verify it's running
systemctl status wfx-website
journalctl -u wfx-website -n 50
```

The service should be listening on `127.0.0.1:8000` — not exposed to the internet directly.

## 8. Nginx reverse proxy

```bash
# Copy the config (edit the server_name first if different from wanfuxin.com)
cp deploy/nginx-wanfuxin.conf /etc/nginx/sites-available/wanfuxin.com
ln -s /etc/nginx/sites-available/wanfuxin.com /etc/nginx/sites-enabled/

# Remove the default site
rm /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Reload
systemctl reload nginx
```

## 9. HTTPS via Let's Encrypt

```bash
certbot --nginx -d wanfuxin.com -d www.wanfuxin.com

# Certbot edits /etc/nginx/sites-enabled/wanfuxin.com to include SSL.
# It also installs a cron job for automatic renewal.

# Verify:
certbot renew --dry-run
```

After this, https://wanfuxin.com should serve the site over a valid TLS cert.

## 10. First admin login

1. Browse to `https://wanfuxin.com/admin/`
2. Username: `admin`, Password: `wfx6688`
3. **System forces password change immediately** (`must_change_password: true`)
4. Set a strong new password (8+ chars, mix of cases/numbers/symbols)

## 11. Add additional admin users (RBAC)

After logging in as `admin`:
1. Navigate to **User Management**
2. Click "Add User", set username, role, initial password
3. Available roles:
   - **super_admin** — full access (rare, max 1-2 people)
   - **chief_editor** — content + categories, no system settings
   - **seo_specialist** — meta tags, slugs, alt text only
   - **sales** — quote/contact management only
   - **viewer** — read-only

## 12. Monitoring & maintenance

```bash
# Application logs
journalctl -u wfx-website -f

# Nginx access/error logs
tail -f /var/log/nginx/wanfuxin.access.log
tail -f /var/log/nginx/wanfuxin.error.log

# MySQL slow query log (enable in /etc/mysql/mysql.conf.d/mysqld.cnf)
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2

# Backup MySQL daily (cron):
0 3 * * * /usr/bin/mysqldump -u wfx_user -pPASSWORD wfx_website | gzip > /backup/wfx-$(date +\%Y\%m\%d).sql.gz

# Backup uploads/ to remote storage:
0 4 * * * rsync -az /var/www/wanfuxin/uploads/ backup-server:/backup/wfx-uploads/
```

## 13. Scaling up later

When traffic grows beyond ~1k visits/day, consider:

| Bottleneck | Solution |
|---|---|
| MySQL contention | Move MySQL to a separate server / use a managed RDS |
| Static asset latency | Put Cloudflare in front (free tier) |
| App-server CPU | Run multiple `wfx-website` services on different ports + Nginx upstream |
| Image bandwidth | Convert all images to WebP, serve via CDN |
| File uploads | Move `uploads/` to S3 + signed URLs |

## 14. Security hardening checklist (post-deploy)

- [ ] Default admin password changed
- [ ] `.env` or `config.py` permissions set to `600`
- [ ] `uploads/.auth/` directory not web-accessible (test: `curl https://wanfuxin.com/uploads/.auth/admin_users.json` → 404)
- [ ] HSTS preload submitted at [hstspreload.org](https://hstspreload.org)
- [ ] SSL grade A or A+ at [ssllabs.com](https://www.ssllabs.com/ssltest/)
- [ ] Restrict `/admin/` by IP allowlist in nginx (uncomment `allow ...; deny all;`)
- [ ] Set up automated MySQL backups
- [ ] Set up uptime monitoring (UptimeRobot, BetterUptime)
- [ ] Add the site to Google Search Console + submit sitemap
- [ ] Enable Cloudflare or similar for DDoS protection

## 15. Common issues

**`502 Bad Gateway` from Nginx**
- App not running: `systemctl status wfx-website`
- Wrong port in nginx config (must match `--port` in service file)

**Login works but CMS save fails with 401**
- Cookie domain mismatch — ensure you're accessing via the canonical domain
- Browser blocking 3rd-party cookies — should not happen with same-origin

**File uploads fail with 413**
- Increase `client_max_body_size` in nginx (currently 110M)
- Increase `MAX_UPLOAD_BYTES` in server.py if customers send larger files

**Sessions die after restart**
- `SESSION_SECRET` not set in env/config — server falls back to per-process random
- Set `WFX_SESSION_SECRET` permanently in `.env`
