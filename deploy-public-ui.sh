#!/usr/bin/env bash
# Deploy the committed application in this checkout. Never modifies DNS or bot data.
set -Eeuo pipefail
umask 022

usage() {
  echo "Usage: sudo bash deploy-public-ui.sh [--check]"
  echo "Pull the desired commit first. --check validates without deploying."
}
check_only=0
case "${1:-}" in
  '') ;;
  --check) check_only=1 ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { usage >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
runtime=/srv/public-web/project15
units=(project15-public-site.socket project15-public-site.service)
app_paths=(public_site.py public_performance.py requirements.txt public_static)
git_source() { git -c "safe.directory=$source_dir" -C "$source_dir" "$@"; }
for tool in git rsync python3 curl flock systemctl tar; do command -v "$tool" >/dev/null; done
exec 9>/run/lock/project15-public-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ -d $runtime && ! -L $runtime && -x $runtime/.venv/bin/python ]] || {
  echo 'Expected installed runtime/venv is missing or is a symlink.' >&2; exit 1;
}
git_source diff --quiet HEAD -- "${app_paths[@]}" || {
  echo 'Application files have uncommitted changes. Commit or preserve them before deploying.' >&2; exit 1;
}
[[ -z $(git_source ls-files --others --exclude-standard -- "${app_paths[@]}") ]] || {
  echo 'Untracked application files exist. Review and commit them before deploying.' >&2; exit 1;
}
revision=$(git_source rev-parse HEAD)
stage=$(mktemp -d /tmp/project15-deploy.XXXXXX)
backup=''
rollback_needed=0
on_exit() {
  local code=$?
  trap - EXIT INT TERM
  set +e
  if [[ $rollback_needed == 1 && $code -ne 0 ]]; then
    echo "Deployment failed; restoring $backup/app" >&2
    systemctl stop "${units[@]}"
    if rsync -a --delete "$backup/app/" "$runtime/" && systemctl start "${units[@]}"; then
      echo 'Previous application restored. Check service logs and the website.' >&2
    else
      echo "AUTOMATIC ROLLBACK FAILED. Restore $backup/app manually." >&2
    fi
  fi
  rm -rf -- "$stage"
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
git_source archive HEAD -- "${app_paths[@]}" | tar -x -C "$stage"
python3 - "$stage" <<'PY'
import ast, sys
from pathlib import Path
p = Path(sys.argv[1])
for file in p.rglob('*'):
    if file.is_symlink():
        raise SystemExit(f'Refusing application symlink: {file}')
for name in ('public_site.py', 'public_performance.py'):
    ast.parse((p / name).read_text(), filename=name)
for name in ('index.html', 'performance.html', 'viewer.js', 'performance.js', 'viewer.css', 'results-mode.js'):
    if not (p / 'public_static' / name).is_file():
        raise SystemExit(f'Missing required static file: {name}')
PY
"$runtime/.venv/bin/python" -m pip check
systemctl is-active --quiet project15-public-site.service
systemctl is-active --quiet project15-public-site.socket
echo "Source revision: $revision"
rsync -rcni --delete "$stage/public_static/" "$runtime/public_static/"
if [[ $check_only == 1 ]]; then
  echo 'Preflight passed. No live files, dependencies, or services changed.'
  exit 0
fi
backup=$(mktemp -d /var/backups/project15-app.XXXXXX)
mkdir "$backup/app"
cp -a "$runtime/." "$backup/app/"
printf '%s\n' "$revision" > "$backup/new-revision.txt"
echo "Rollback backup: $backup/app"
rollback_needed=1
systemctl stop "${units[@]}"
for name in public_site.py public_performance.py requirements.txt; do
  install -o root -g root -m 0644 "$stage/$name" "$runtime/$name"
done
# Delete only obsolete assets inside this application's public_static directory.
rsync -r --delete --chmod=D755,F644 --chown=root:root "$stage/public_static/" "$runtime/public_static/"
if ! cmp -s "$stage/requirements.txt" "$backup/app/requirements.txt"; then
  "$runtime/.venv/bin/python" -m pip install --disable-pip-version-check --timeout 30 --retries 2 -r "$runtime/requirements.txt"
fi
"$runtime/.venv/bin/python" -m pip check
systemctl start "${units[@]}"
for attempt in {1..15}; do
  if curl -fsS --max-time 5 http://127.0.0.1:8080/ -o /dev/null; then break; fi
  sleep 1
done
python3 - "$stage" <<'PY'
import json, sys, urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
base = 'http://127.0.0.1:8080'
day = datetime.now(ZoneInfo('America/New_York')).date().isoformat()
for path in ('/', '/performance', '/real', '/real/performance', '/normalized', '/normalized/performance',
             '/api/view', '/api/performance', '/api/history/BTC', '/api/intraday?day=' + day,
             '/api/view?normalized=true', '/api/performance?normalized=true',
             '/api/history/BTC?normalized=true', '/api/intraday?normalized=true&day=' + day):
    with urllib.request.urlopen(base + path, timeout=30) as response:
        body = response.read()
        print(path, 'HTTP', response.status)
        if path.startswith('/api/'):
            data = json.loads(body)
            print({k: data[k] for k in ('stale', 'missing_assets') if k in data})
for name in ('viewer.js', 'performance.js', 'viewer.css', 'results-mode.js'):
    with urllib.request.urlopen(base + '/' + name, timeout=15) as response:
        if response.read() != (Path(sys.argv[1]) / 'public_static' / name).read_bytes():
            raise SystemExit(f'Served asset differs from deployment: {name}')
PY
printf '%s\n' "$revision" > "$runtime/DEPLOYED_REVISION"
rollback_needed=0
echo "DEPLOYED $revision"
echo "Backup retained: $backup/app"
echo 'Hard-refresh https://dekings.org and https://www.dekings.org.'
echo 'Freshness warnings indicate source-data issues; HTTP/JSON/asset failures trigger rollback.'
