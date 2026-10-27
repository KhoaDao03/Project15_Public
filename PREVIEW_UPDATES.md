# Deploying Public UI updates — current VPS setup

> Superseded for the running website: use [DEPLOYMENT.md](DEPLOYMENT.md). The permanent service runs installed files in `/srv/public-web/project15`; pulling this source checkout alone no longer updates the served UI. Caddy now owns localhost port 8080. The preview instructions below are retained as historical reference.

These instructions apply to the temporary preview on the Public UI VPS:

- Repository: `/home/ubuntu/Project15_Public`
- Python environment: `/home/ubuntu/Project15_Public/.venv`
- Synced preview data: `/var/lib/project15-public`
- Server address: `127.0.0.1:8080`
- VPS SSH login: `ubuntu@147.224.164.255`

Run VPS commands as `ubuntu` in a fresh login session with `public-web` supplementary group membership (check with `id`). This grants read access to synced data. This preview does not start automatically after a reboot. The permanent `project15-public-site` systemd service is not installed as of this setup.

Caddy is installed and running, but currently serves its default page on port 80. It does not route to Project15. These update steps use the existing SSH tunnel; no Caddy reload, DNS change, or Bot VPS change is required.

## Quick update: public UI files only

Use this shortcut when the changes are limited to files under `public_static/`, such as HTML, CSS, JavaScript, SVG logos, or icons. The current server serves these files directly, so an existing running preview does not need a restart.

1. Push your UI changes to the remote repository from your development machine.
2. In a VPS SSH terminal, inspect local changes and check which files the new version changes:

   ```bash
   cd /home/ubuntu/Project15_Public
   git status --short
   git fetch origin
   git diff --name-only HEAD..origin/main
   ```

   This checkout follows `origin/main`. Fetching downloads the remote revision without changing the running files. If the listed changes include Python files or `requirements.txt`, use the full procedure below. If they are only UI assets (and documentation), pull the new version:

   ```bash
   git pull --ff-only
   git log -1 --oneline
   ```

   Continue only if the pull succeeds. Preserve local edits, including `AGENTS.md` and this guide. If Git reports a conflict or diverged branches, resolve it before proceeding; do not force or discard local work. Step 1 of the full procedure below explains how to back up local changes.

3. Keep the preview server and SSH tunnel running. Open <http://localhost:8080/> or <http://localhost:8080/performance> and hard-refresh with **Ctrl+Shift+R**.
4. Check the UI feature you changed. Browser refresh clears any unsaved Example calendar edits.

The updated files are shown at the same localhost URLs through your existing tunnel; there is no separate upload or build step. You do not need to reload Caddy for this preview. `git log -1 --oneline` identifies the checked-out version so you can compare it with the commit you pushed.

If the old UI still appears, confirm the pull succeeded and the expected commit is shown, then hard-refresh the correct localhost page. If the page instead reports a connection error, check that both the preview process and your SSH tunnel are still running; pulling code does not restart either one.

| Files changed in the update | Required action |
| --- | --- |
| Only `public_static/*` | Pull, then hard-refresh the browser |
| Python files, including `public_site.py` or `public_performance.py` | Follow the full stop, pull, and restart procedure below |
| `requirements.txt` | Follow the full procedure, including installing dependencies |

Check the full set of incoming changes, not just your own latest edit. If the pull also includes Python or dependency changes, use the full procedure. A quick frontend pull may briefly serve a mix of asset versions while files are updated; use the full procedure if that brief transition is unacceptable. Pulling alone does not start a stopped preview or establish an SSH tunnel.

## 0. Connect from your computer

Open a terminal on your computer:

```bash
ssh -o ExitOnForwardFailure=yes -i ~/.ssh/ssh-key-2026-10-13.key \
  -L 8080:127.0.0.1:8080 \
  ubuntu@147.224.164.255
```

If a tunnel already owns local port 8080, keep it open and use another SSH connection without `-L` for administration.

All commands in steps 1–4 run inside the VPS SSH session. The server will run in the foreground in step 4, so use a second VPS SSH session for any subsequent shell checks.

Check that your new session has read access to the received data:

```bash
id
test -r /var/lib/project15-public/view.json && echo 'Synced data is readable'
```

The `id` output should include `public-web`. If it does not, reconnect to obtain the newly assigned group membership. Do not change the data directory to world-readable or grant the website write permissions.

## 1. Inspect and back up the checkout on the VPS

Push your changes to the repository's remote from your development machine first. Then, on the Public UI VPS:

```bash
cd /home/ubuntu/Project15_Public
git status --short
git diff --stat
git log -1 --oneline
```

Record the current revision and preserve local documentation before pulling:

```bash
update_backup_dir=$(mktemp -d /home/ubuntu/project15-update-backup.XXXXXX)
git rev-parse HEAD > "$update_backup_dir/previous-revision.txt"
git diff --binary HEAD > "$update_backup_dir/tracked-changes.patch"
cp -p AGENTS.md PREVIEW_UPDATES.md "$update_backup_dir/"
echo "Update backup: $update_backup_dir"
```

At the time this guide was updated, `AGENTS.md` had local handoff edits and `PREVIEW_UPDATES.md` was untracked. Preserve these files. The commands above back up those documents and tracked changes; separately preserve any other untracked source files you have added.

## 2. Stop the existing preview

If the server is running in a terminal you control, press **Ctrl+C** in that terminal.

Otherwise, find the process and the listener:

```bash
pgrep -af '[u]vicorn public_site:create_app'
sudo ss -ltnp 'sport = :8080'
```

Identify the actual Python/Uvicorn process listening on port 8080, owned by `ubuntu`, with `--host 127.0.0.1 --port 8080`. A `sudo` wrapper may also appear in the process listing; use the Python process PID from `ss`, not the wrapper PID. Stop only that preview process:

```bash
kill PID
```

Replace `PID` with its actual process ID. If no preview process is listed, continue to the next step.

Allow a few seconds for graceful shutdown, then confirm port 8080 is free before continuing:

```bash
sudo ss -ltnp 'sport = :8080'
```

Do not stop unrelated processes if something else owns that port.

## 3. Pull updates and install dependencies

Stopping first avoids serving a mixture of old Python code and new browser assets, or changing the environment underneath a running server. There will be a brief preview outage during these steps; data synchronization continues independently.

```bash
cd /home/ubuntu/Project15_Public
git pull --ff-only
```

Continue only after the pull succeeds. If Git reports conflicting local changes or diverged branches, resolve them before continuing. The backup in step 1 preserves your work but does not remove local changes from the checkout. Keep `.venv/`, `__pycache__/`, credentials, and runtime data out of commits; avoid broad staging commands such as `git add .`. Do not discard the local handoff edits to force a pull.

Install and check dependencies:

```bash
.venv/bin/python -m pip install -r requirements.txt &&
  .venv/bin/python -m pip check
```

If either command fails, resolve the error before starting the server. If you abandon the update, restore the known-good code and environment before restarting.

## 4. Start the updated preview

```bash
cd /home/ubuntu/Project15_Public

sudo -u ubuntu env PYTHONDONTWRITEBYTECODE=1 \
  PROJECT15_PUBLIC_DATA_DIR=/var/lib/project15-public \
  .venv/bin/python -m uvicorn public_site:create_app \
  --factory --host 127.0.0.1 --port 8080
```

Using `sudo -u ubuntu` here starts the preview as `ubuntu` with the current supplementary groups, even if the terminal was opened before `ubuntu` was added to `public-web`. An older session without that group can start the server but cause all data APIs to return HTTP 503 because it cannot read the JSON files. Keep the directory permissions unchanged; restart with the command above to correct that condition.

Wait for the startup message:

```text
Uvicorn running on http://127.0.0.1:8080
```

Leave this terminal running; closing its SSH session can stop the preview. If startup prints an error, resolve it before testing the browser. An “address already in use” error means another process still owns port 8080.

## 5. Open the SSH tunnel from your computer

Keep the tunnel from step 0 open. If it is no longer connected, run this in a separate terminal on your computer:

```bash
ssh -o ExitOnForwardFailure=yes -i ~/.ssh/ssh-key-2026-10-13.key \
  -L 8080:127.0.0.1:8080 \
  ubuntu@147.224.164.255
```

Leave the SSH connection open. Do not start a second tunnel on local port 8080 if one is already running.

## 6. Verify the update

Open or refresh:

- Dashboard: <http://localhost:8080/>
- Performance calendar: <http://localhost:8080/performance>

Use **Ctrl+Shift+R** if the browser still shows old assets. Check the feature you changed and watch the server terminal for errors.

From a second VPS SSH session, check both pages and all four APIs without dumping trade histories:

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
        print(path, 'HTTP', response.status)
        if path.startswith('/api/'):
            data = json.loads(body)
            print({key: data[key] for key in
                   ('stale', 'missing_assets', 'updated_at') if key in data})
PY
```

Expect HTTP 200, `stale: False`, and no missing assets when the exporter and sync are healthy. In the browser, also check calendar navigation, market selection, trade pagination, CSV exports, and that refreshing data preserves your selection.

The Bot VPS now supplies sanitized JSON to `/var/lib/project15-public`. Verify that recorded results appear and timestamps advance. A stale-data warning indicates an exporter or transfer issue to investigate; code deployment does not restart the Bot VPS sync worker. Select **Data → Example calendar** on the performance page to explore sample results. Example edits disappear on reload.

If SSH prints `channel ... connect failed: Connection refused`, verify that the preview server is running on the VPS at `127.0.0.1:8080`.

## If an update fails

Keep the startup error or traceback and the backup directory from step 1. Its `previous-revision.txt` identifies the code version before the pull. Restore or revert the faulty change while preserving local work, then reinstall that revision's requirements and restart using step 4. Do not use `git reset --hard` or delete synced JSON to resolve a code problem. For dependency changes, reinstalling older requirements alone may not remove newly introduced packages; recreate the virtual environment if a clean rollback is needed.

## Later: permanent deployment

After the production application path and systemd service have been configured and verified, updates will use that deployment checkout and a service restart:

```bash
sudo systemctl restart project15-public-site
```

This command does not apply to the current temporary preview. Update this guide when the permanent service is installed. Code updates and the already-running Bot VPS data synchronization are separate operations.
