## FX sit-out update — October 27, 2026

EUR/USD and GBP/USD now show no scheduled sit-out window; USD/JPY retains
Monday–Friday 08:00–12:00 ET. Deploy the updated `public_static/viewer.js`
to the website VPS using the procedure below. This source change is prepared
locally; remote deployment remains with the owner.

## Forex source update — October 27, 2026

The local source now supports EURUSD, GBPUSD, USDJPY, AUDUSD and USDCAD in the
market dashboard, history and performance views. Forex prices use five decimals
(three for USD/JPY). This source update has **not** been deployed to the website
VPS; the owner will deploy it. Copy `public_site.py`,
`public_static/viewer.js`, `public_static/performance.js` and `public_static/viewer.css` into the existing
installed runtime using the backup/restart procedure below. No dependency,
Caddy, socket or credential changes are needed. Verify `/api/history/EURUSD`
and the Forex table after deployment. The bot VPS supplies the five new histories.

# Permanent Public UI deployment

For routine updates, use [deploy-public-ui.sh](deploy-public-ui.sh). The [deployment guide](DEPLOY_GUIDE.md) includes script usage, manual steps, and rollback instructions.

## Current public status — 2026-10-27

Both `dekings.org` and `www.dekings.org` resolve to `147.224.164.255` in the checked public resolver (`www` is a CNAME to the apex). The prepared HTTPS configuration is now active in `/etc/caddy/Caddyfile`. Caddy obtained certificates for both names; HTTPS requests pinned to the new VPS returned HTTP 200 with certificate verification successful. External certificate-authority HTTP challenge requests reached this VPS. Host TCP 80/443 rules are persisted. The earlier DNS/HTTPS preparation checklist below is historical and should not be repeated. Pre-HTTPS Caddy configuration is backed up at `/etc/caddy/Caddyfile.before-https`. The old Bot VPS website has not been retired by this session.

The Public UI VPS now runs `project15-public-site.service` and `project15-public-site.socket`, both enabled at boot. Caddy proxies requests to `/run/project15-public/http.sock`. Systemd owns this socket as `public-web:caddy`, mode `0660`; Uvicorn receives it through `--fd 3`. The application retains its private network namespace and CPU/memory limits.

## Paths and access

- Source checkout: `/home/ubuntu/Project15_Public`
- Installed application: `/srv/public-web/project15` (administrator-owned runtime files, not a Git checkout)
- Runtime Python environment: `/srv/public-web/project15/.venv`
- Synced data: `/var/lib/project15-public`
- Active Caddy configuration: `/etc/caddy/Caddyfile`
- Prepared HTTPS configuration: `/etc/caddy/Caddyfile.https-ready`

The checkout currently tracks a virtual environment and bytecode. Deployment copies only application files; it does not copy that environment or bytecode. No repository history was rewritten.

## View the running site before DNS cutover

Keep the usual SSH tunnel open from your computer:

```bash
ssh -o ExitOnForwardFailure=yes -i ~/.ssh/ssh-key-2026-10-13.key \
  -L 8080:127.0.0.1:8080 ubuntu@147.224.164.255
```

Visit <http://localhost:8080/> or <http://localhost:8080/performance>. Caddy now owns localhost port 8080 and forwards to the permanent service. Do not start another Uvicorn preview on that port. Closing the tunnel no longer stops the website service.

## Deploy new application code after a successful pull

Pull in the source checkout, preserving any local changes. Pulling alone does not change the installed application. Run the following on the Public UI VPS as `ubuntu`.

Back up the installed application before changing it:

```bash
cd /home/ubuntu/Project15_Public
deploy_backup_dir=$(sudo mktemp -d /var/backups/project15-app.XXXXXX)
sudo cp -a /srv/public-web/project15/. "$deploy_backup_dir/"
echo "Rollback application: $deploy_backup_dir"
```

Stop only the public application service and deploy the application files:

```bash
sudo systemctl stop project15-public-site.socket project15-public-site.service
sudo install -m 0644 public_site.py public_performance.py requirements.txt /srv/public-web/project15/
sudo rsync -r --chmod=D755,F644 --chown=root:root public_static/ /srv/public-web/project15/public_static/
sudo /srv/public-web/project15/.venv/bin/python -m pip install -r /srv/public-web/project15/requirements.txt &&
  sudo /srv/public-web/project15/.venv/bin/python -m pip check
```

Run commands one at a time and stop if any fails. This creates a brief website outage; Bot VPS trading and file sync continue independently. If the update intentionally removes static files, review those removals separately; the rsync command above preserves existing destination files.

If both dependency commands succeed, start the service:

```bash
sudo systemctl start project15-public-site.socket project15-public-site.service
sudo systemctl status project15-public-site --no-pager
curl --fail --silent --show-error http://127.0.0.1:8080/api/view -o /dev/null
curl --fail --silent --show-error http://127.0.0.1:8080/api/performance -o /dev/null
```

Hard-refresh your browser with Ctrl+Shift+R and verify the changed feature. Check live timestamps and stale indicators. Caddy does not need reloading for application-only updates.

Changes to service/socket templates need separate review, installation into `/etc/systemd/system`, `systemd-analyze verify`, and `systemctl daemon-reload` before restart. Ordinary code deployments do not automatically replace these installed units.

## DNS and HTTPS status

DNS still points to the Bot VPS (`108.175.13.244`) at setup time. Active Caddy routes explicitly use HTTP for `147.224.164.255`, `dekings.org`, and `www.dekings.org`, plus localhost port 8080. The previous default Caddy file-server route is preserved.

The HTTPS configuration is prepared and validated but is not active. Before cutover:

1. Host firewall TCP 80/443 ingress is now allowed and persisted in `/etc/iptables/rules.v4`, with existing SSH and other rules preserved. Oracle Cloud security rules still need verification/configuration; no Oracle CLI, SDK, configured credentials, or suitable connected management plugin was available in this session. Host-firewall backup: `/var/backups/project15-public-access-20261027T033131Z/`.
2. Verify external connectivity to this VPS. Local Host-header tests do not prove cloud firewall access.
3. When DNS cutover is authorized, point the domain records to `147.224.164.255`, and review old AAAA records.
4. Review and activate `/etc/caddy/Caddyfile.https-ready` after confirming no intervening Caddy changes would be overwritten:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile.https-ready --adapter caddyfile
   sudo cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-https
   sudo install -m 0644 /etc/caddy/Caddyfile.https-ready /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

5. Confirm certificates and HTTPS work for both domain names before retiring any old public website. Keep Bot VPS trading and sync running.

## Diagnostics and rollback

```bash
sudo journalctl -u project15-public-site -n 50 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
sudo systemctl status project15-public-site.socket --no-pager
```

For a failed application update, stop the socket and service, preserve the failed runtime for investigation, and restore the complete application backup to the same `/srv/public-web/project15` path (including its environment). Then start the socket/service and verify. Do not modify synced data to roll back code.

Initial installation rollback records are at `/var/backups/project15-production-20261027T031951Z/`. They include the original Caddyfile, original firewall rules, and source revision. To undo the initial Caddy/service setup, restore that Caddyfile, validate and reload Caddy, and disable/stop the new service and socket. The later authorized host-firewall change has its own backup and rollback notes at `/var/backups/project15-public-access-20261027T033131Z/`. DNS has not been changed.
