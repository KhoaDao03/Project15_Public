# After pulling new Public UI code

> Superseded for the running website: a permanent systemd service and Caddy now serve the UI from `/srv/public-web/project15`. Use [DEPLOYMENT.md](DEPLOYMENT.md) to deploy pulled code. The instructions below describe the former standalone preview; do not launch it on port 8080, which is now used by Caddy.

Use this guide for the current Project15 preview on `147.224.164.255`. The checkout is `/home/ubuntu/Project15_Public`; the preview reads synced data from `/var/lib/project15-public` and listens on `127.0.0.1:8080`.

First confirm that your `git pull` completed successfully. If Git reported an error or conflict, resolve it before continuing. These instructions do not require changes to Caddy, DNS, or the Bot VPS.

## Choose what you need

| What the pulled version changed | What to do |
| --- | --- |
| Only existing HTML, CSS, JavaScript, or images under `public_static/` | Keep the server running and hard-refresh your browser with **Ctrl+Shift+R** |
| Python code, such as `public_site.py` or `public_performance.py` | Restart the preview using steps 1–3 below, then refresh |
| `requirements.txt` | Stop the preview, install dependencies, then restart using steps 1–3 |
| Unsure which files changed | Follow all steps below, including dependency installation |

The running Python server does not automatically reload Python changes. Static file changes appear after browser refresh because the server reads those files directly. A new asset URL may also require a Python route change, so check the entire update when choosing the shortcut.

For future updates involving Python or dependencies, stop the preview before pulling to avoid temporarily mixing old server code with new assets. If you have already pulled, restart now using the steps below.

## 1. Stop the current preview — on the Public UI VPS

If you have the terminal running Uvicorn, press **Ctrl+C** in that terminal.

Otherwise, run:

```bash
sudo ss -ltnp 'sport = :8080'
```

Find the PID of the Python process listening on `127.0.0.1:8080`. Confirm it belongs to the Project15 preview:

```bash
ps -p PID -o user=,args=
```

Replace `PID` with the actual number. It should show user `ubuntu` and the command containing `uvicorn public_site:create_app`. Stop that process:

```bash
kill PID
```

Wait a few seconds, then run the `ss` command again. Continue when no listener remains on port 8080. If there was no listener initially, the preview is already stopped. Do not stop an unrelated process.

## 2. Update dependencies if needed — on the Public UI VPS

Run this if `requirements.txt` changed, or if you are unsure:

```bash
cd /home/ubuntu/Project15_Public
.venv/bin/python -m pip install -r requirements.txt &&
  .venv/bin/python -m pip check
```

Continue only after both commands succeed. If requirements did not change, skip this step.

## 3. Start the updated preview — on the Public UI VPS

Copy this entire command:

```bash
cd /home/ubuntu/Project15_Public
sudo -u ubuntu env PYTHONDONTWRITEBYTECODE=1 \
  PROJECT15_PUBLIC_DATA_DIR=/var/lib/project15-public \
  .venv/bin/python -m uvicorn public_site:create_app \
  --factory --host 127.0.0.1 --port 8080
```

Wait until you see:

```text
Uvicorn running on http://127.0.0.1:8080
```

**Leave this terminal open.** This is a temporary foreground preview; it does not automatically restart after logout or reboot.

Keep `sudo -u ubuntu env` in the command. It starts the preview as `ubuntu` with fresh group membership, including `public-web`, so it can read synced data. Starting from an old session without that group previously caused HTTP 503 errors.

## 4. Keep the SSH tunnel open — on your computer

If your tunnel is already connected, keep using it. Otherwise, open a separate terminal on your computer and run:

```bash
ssh -o ExitOnForwardFailure=yes \
  -i ~/.ssh/ssh-key-2026-10-13.key \
  -L 8080:127.0.0.1:8080 \
  ubuntu@147.224.164.255
```

Leave this connection open. Do not start a second tunnel on local port 8080 while one is already running.

## 5. View and check the changes — in your browser

Open the same addresses as before:

- Dashboard: <http://localhost:8080/>
- Performance history: <http://localhost:8080/performance>

Press **Ctrl+Shift+R** to reload the page and its assets. Check the feature you changed and confirm recorded data appears and timestamps continue advancing. Refreshing clears unsaved Example calendar edits.

To confirm which version is checked out, run this in a separate VPS terminal:

```bash
git -C /home/ubuntu/Project15_Public log -1 --oneline
```

Compare the commit with the version you intended to pull. A checked-out Python version takes effect only after the restart in step 3.

## If something is wrong

| Symptom | Action |
| --- | --- |
| Old styling or layout | Confirm the expected commit was pulled, then hard-refresh the localhost page |
| Old Python behavior | Restart using steps 1–3 |
| SSH says `Connection refused` | Check that the VPS preview is running on port 8080 |
| SSH says local port 8080 is already in use | Use the existing tunnel or close the conflicting local listener before reconnecting |
| Uvicorn says `Address already in use` | Identify the existing VPS listener with step 1 before starting another preview |
| Pages load but data APIs return 503 | Confirm you used the exact step 3 command; inspect synced file availability and read permissions if the error persists |
| Data is marked stale | Investigate exporter/transfer freshness; pulling UI code does not repair data synchronization |

Keep error output when troubleshooting. Do not delete synced JSON or broaden data-directory permissions to fix a preview error.

For pre-pull backups, preserving local changes, and the full update workflow, see [PREVIEW_UPDATES.md](PREVIEW_UPDATES.md).
