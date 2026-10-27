# Deploying a new Project15 UI version

Run deployment commands on the **Public UI VPS**, `147.224.164.255`, as `ubuntu`. The live service runs installed code in `/srv/public-web/project15`. Your Git checkout is `/home/ubuntu/Project15_Public`; pulling there alone does not update the live website.

## Option A — use the deployment script

### 1. Connect to the VPS

Run on your computer:

```bash
ssh -i ~/.ssh/ssh-key-2026-10-13.key ubuntu@147.224.164.255
```

### 2. Pull the version you want

Push your code from your development machine first. On the VPS:

```bash
cd /home/ubuntu/Project15_Public
git status --short
git pull --ff-only
git log -1 --oneline
```

Stop if the pull fails. Preserve local edits rather than using a hard reset. Local changes to documentation such as `AGENTS.md` are allowed by the deployment script, but Git may still require resolving conflicts during a pull. Do not broadly stage `.venv/`, bytecode, credentials, or runtime data.

The script deploys the **committed HEAD** of this checkout. It does not pull code, switch branches, commit, or push. Uncommitted or untracked application files cause it to stop instead of silently leaving them out. Commit the intended application changes first. Changes to the deployment script itself take effect when you run that file; review its changes before running it with sudo.

### 3. Optional: check without deploying

```bash
sudo bash deploy-public-ui.sh --check
```

This checks source files, Python syntax, existing dependencies, and service status, and previews static-file changes. It creates temporary staging files but does not change the running app. It is not a browser test or proof that new dependencies can be installed.

### 4. Deploy

```bash
sudo bash deploy-public-ui.sh
```

The script:

1. Prevents overlapping runs of this script using a lock.
2. Stages only committed Python application files, `requirements.txt`, and `public_static/`.
3. Backs up the complete installed application and its virtual environment under `/var/backups/project15-app.XXXXXX/app/`.
4. Stops only the public website socket and service.
5. Installs the new application, removes obsolete files only within its static-assets directory, and installs dependencies if requirements changed.
6. Starts the service and checks both pages, all four APIs, and served JavaScript/CSS through local Caddy.
7. Records the deployed commit in `/srv/public-web/project15/DEPLOYED_REVISION`.

There is a brief website outage during deployment. If a command or health check fails after stopping the service, the script attempts to restore the complete backup and start the previous version. Read its output: failed rollback needs manual recovery. A machine crash, power failure, or forced `kill -9` cannot trigger shell cleanup; use the printed backup path for recovery.

Stale/missing data is printed as a warning rather than treated as a code failure. Failed HTTP requests, invalid JSON, or mismatched served assets cause rollback. The script requires the current service/socket to be active before deployment; use the manual procedure for recovery from a stopped service.

The script leaves Caddy, DNS, firewall rules, systemd unit definitions, Bot VPS services, and synced JSON unchanged. It does not install new service templates. Updates introducing new Python modules outside the existing two application files require updating the deployment file list first.

### 5. Check the public website

Open <https://dekings.org/> and <https://www.dekings.org/performance> and press **Ctrl+Shift+R**. Check the feature you changed, market selection, calendar navigation, and live timestamps.

Optional HTTPS checks from the VPS:

```bash
curl --fail --silent --show-error https://dekings.org/api/view -o /dev/null
curl --fail --silent --show-error https://www.dekings.org/api/performance -o /dev/null
sudo systemctl status project15-public-site --no-pager
cat /srv/public-web/project15/DEPLOYED_REVISION
```

Do not start a standalone Uvicorn preview on port 8080; Caddy already owns that port. No SSH tunnel is needed to use the public HTTPS website.

## Option B — deploy manually

Run commands **one block at a time**, checking each result. Do not run this procedure while the deployment script or another deployment is running.

### 1. Inspect and pull

```bash
cd /home/ubuntu/Project15_Public
git status --short
git pull --ff-only
git log -1 --oneline
```

Resolve any conflicts first. Check the update's application and dependency changes. This manual procedure copies working-tree application files, so ensure they contain exactly what you intend to deploy.

### 2. Back up the installed version

```bash
manual_backup_dir=$(sudo mktemp -d /var/backups/project15-manual.XXXXXX)
sudo mkdir "$manual_backup_dir/app"
sudo cp -a /srv/public-web/project15/. "$manual_backup_dir/app/"
echo "SAVE THIS BACKUP PATH: $manual_backup_dir/app"
```

Copy the printed path somewhere you can retrieve it. The shell variable will be lost if you close the terminal. Do not continue unless the backup succeeds.

### 3. Stop the public service

```bash
sudo systemctl stop project15-public-site.socket project15-public-site.service
```

The site will be briefly unavailable. Data sync continues separately.

### 4. Install application files

```bash
sudo install -o root -g root -m 0644 \
  public_site.py public_performance.py requirements.txt \
  /srv/public-web/project15/
sudo rsync -r --delete --chmod=D755,F644 --chown=root:root \
  public_static/ /srv/public-web/project15/public_static/
```

The trailing slashes matter. `--delete` removes obsolete files only from the destination `public_static` directory; do not point this command at the data directory or change it to copy the entire checkout.

### 5. Install/check dependencies

```bash
sudo /srv/public-web/project15/.venv/bin/python -m pip install \
  --disable-pip-version-check --timeout 30 --retries 2 \
  -r /srv/public-web/project15/requirements.txt
sudo /srv/public-web/project15/.venv/bin/python -m pip check
```

Stop if either command fails. Restore the backup if you cannot resolve the failure.

### 6. Start and verify

```bash
sudo systemctl start project15-public-site.socket project15-public-site.service
sudo systemctl status project15-public-site --no-pager
```

Check pages and APIs, using today's New York date:

```bash
python3 - <<'PY'
import json
from datetime import datetime
from urllib.request import urlopen
from zoneinfo import ZoneInfo
day = datetime.now(ZoneInfo('America/New_York')).date().isoformat()
paths = ['/', '/performance', '/api/view', '/api/performance',
         '/api/history/BTC', '/api/intraday?day=' + day]
for path in paths:
    with urlopen('http://127.0.0.1:8080' + path, timeout=30) as response:
        body = response.read()
        print(path, response.status)
        if path.startswith('/api/'):
            data = json.loads(body)
            print({key: data[key] for key in ('stale', 'missing_assets') if key in data})
PY
```

After checks succeed, record the commit (provided you deployed unchanged committed application files):

```bash
git rev-parse HEAD | sudo tee /srv/public-web/project15/DEPLOYED_REVISION
```

Finally verify both public HTTPS names and hard-refresh your browser as described in Option A.

## Manual rollback

Use the exact `app/` backup path printed by either procedure. Replace the example path below; verify it contains `public_site.py`, `public_static/`, and `.venv/` before running the restore.

```bash
restore_app_dir=/var/backups/project15-app.REPLACE_ME/app
sudo ls -ld "$restore_app_dir/public_site.py" "$restore_app_dir/public_static" "$restore_app_dir/.venv"
```

Only after that check succeeds:

```bash
sudo systemctl stop project15-public-site.socket project15-public-site.service
sudo rsync -a --delete "$restore_app_dir/" /srv/public-web/project15/
sudo systemctl start project15-public-site.socket project15-public-site.service
sudo systemctl status project15-public-site --no-pager
```

Run each command separately and stop on an error. This restores code and the environment to their original path, including dependency state. Repeat the API/HTTPS checks. Keep backups until the new version is verified; backups consume disk space and are not automatically deleted.

## Troubleshooting

```bash
sudo journalctl -u project15-public-site -n 80 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
df -h /srv /var/backups
```

If the update is not visible, compare `DEPLOYED_REVISION` with `git log -1 --oneline`, then hard-refresh. Pulling alone does not deploy. If data is stale, check transfer/exporter freshness separately rather than deleting JSON or changing read-only permissions.
