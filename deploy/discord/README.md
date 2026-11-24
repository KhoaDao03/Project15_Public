# Discord viewer integration

The read-only viewer previously served only on Bot VPS localhost:6087 is included
at `/discord`, with static assets under `/discord/` and one API:
`GET /api/discord/messages?channel=1570490132614619258&q=...`.
The existing real and normalized dashboards remain separate and unchanged in their
calculation basis. Discord shows actual recorded amounts, not normalized results.

## Sender status — 2026-11-24

After the operator confirmed public use of the channel display, the isolated
exporter was enabled on the Bot VPS and the existing sync worker was updated.
The first transfer to `147.224.164.255` completed with exit code 0. Both
`project15-discord-public-export` and `project15-public-sync` are active with
automatic syncing enabled. The sender export timestamp was verified advancing.
Trading and recorder services were not restarted or changed.

The receiver's SSH account permits uploads only, so website deployment and
receiver-side permission/HTTPS checks still need its administrator/agent.
Follow the handoff below; successful transfer alone is not a website deployment.

## Data boundary

The Website VPS reads only `discord-view.json` from `PROJECT15_PUBLIC_DATA_DIR`.
It never connects to Discord, the bot API, the executor, or a database. The endpoint
supports only the two configured channels and a bounded search of exported messages.
All write methods and arbitrary file routes remain unavailable.

`exporter.py` runs on the Bot VPS as `public-push`, separately from trading. It reads
the existing loopback viewer twice per cycle with five-second timeouts and explicit
response size bounds. `public_discord.sanitize` selects display fields, at most
100 original-channel messages, 50 new-channel messages, 20 text revisions per
message, 100 orders and 100 reconciled P&L rows. Raw exchange order IDs, account
metadata, parser code, internal errors, attachment URLs, browser profiles, tokens,
and databases are excluded. Local order keys are hashed for P&L joins.

**This is a public-content export, not anonymization:** message text, displayed
authors, channel/message IDs, signal plans, trade details and P&L are included.
Obtain explicit operator authorization to publish these before enabling transfers.
The original private viewer and trading behavior are not modified.

Complete exports replace the previous file atomically. Failed fetches retain the
previous complete file and timestamp. The public API recalculates freshness using
source timestamps, hides quotes older than two seconds or past expiry, and marks
execution/recorder state stale after 15 seconds. The browser warns when the export
is over 20 seconds old. A one-second export cycle and existing transfer loop add
latency; the browser's 500ms polling is not a delivery guarantee.

## Bot VPS installation (after publication authorization)

No changes to Project15's trading project or execution services are required.
Install `exporter.py` and the repository-root `public_discord.py` under
`/opt/project15-discord-public-export/`, owned by root and readable by public-push.
Create `/var/lib/project15-public-sync/discord` owned by public-push, mode 0750.
Install the included `project15-discord-public-export.service` system unit.
It is capped at 10% of one CPU core and 96 MiB, can write only its output directory,
and can connect only to localhost. It does not need access to /root or trading DBs.

Run one local export first:

```sh
sudo -u public-push python3 -B /opt/project15-discord-public-export/exporter.py --once
```

The included `sync.py` is the existing sender worker plus one optional file:
`/var/lib/project15-public-sync/discord/discord-view.json`. Review against the current
installed worker before replacing it; preserve any newer unrelated changes. Back up
`/opt/project15-public-sync/sync.py`, install the reviewed version there, and restart
only `project15-public-sync`. The main snapshot, histories and freshness metadata
publish before the optional Discord file. A missing file is skipped; an invalid
optional file does not undo the already-completed main publication. Transfers use
the same restricted SSH account, strict pinned host key and atomic rsync behavior.
No receiver SSH permissions need expanding.

Enable the exporter and check both independent services:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now project15-discord-public-export
sudo systemctl restart project15-public-sync
sudo systemctl status project15-discord-public-export project15-public-sync
```

A manual `sync.py --once` may be run with the sync service temporarily stopped;
always restart it afterward, even if transfer fails. Never stop trading to test this.
To roll back, disable only the Discord exporter and restore the previous sync worker.
Previously transferred data persists until explicitly removed by the receiving admin.

## Website VPS agent handoff

1. Read repository AGENTS.md and DEPLOYMENT.md; inspect the installed runtime and
   service. Keep the existing domain, Caddy, resource limits and Unix socket.
2. Pull the reviewed main branch. Do not run the exporter or sender sync on this VPS.
3. Verify `/var/lib/project15-public/discord-view.json` exists, is readable by
   `public-web`, has `schema_version: 1`, both channel entries, and advancing
   `updated_at` values. Do not print message contents or copy them to Git.
4. Run the regression suite, then `sudo bash deploy-public-ui.sh --check` followed
   by `sudo bash deploy-public-ui.sh`. The script now installs `public_discord.py`
   and the Discord assets along with the existing app; pulling alone does not deploy.
   The Discord API must be available for the post-deployment checks to pass.
5. Verify `/discord`, both channel API queries, search, tabs, mobile layout, and
   refresh. Confirm the existing real/paper dashboards and performance calendars
   still work. Check that `/api/control` and `/discord-view.json` remain 404 and POST
   is 405. Confirm source timestamps advance rather than merely browser timestamps.
6. Report the deployed revision, backup path, data freshness and service status.
   No DNS changes, exchange connections, raw DB copies or trading restarts are needed.

If the file has not arrived, stop before deploying: coordinate sender authorization
and transfer first. Existing website behavior does not require the new JSON until
this viewer is deployed. A sender rsync success proves delivery but does not verify
receiver service permissions or public HTTPS behavior; check these on the receiver.
