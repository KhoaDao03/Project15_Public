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

The viewer is intentionally absent from the main dashboard and performance
navigation. Open `/discord` directly; the password gate still applies.

## Password gate

The viewer page now asks for the operator's shared password. The data API returns
401 before any snapshot is read unless the request has a valid server-issued
session cookie. Password verification is server-side PBKDF2; the repository stores
only a salted digest, never the plaintext password or a browser-side comparison.
The configured password is the one supplied by the operator in chat.
Sessions last 12 hours, are held in bounded process memory, and end on restart or
**Lock viewer**. Cookies are HttpOnly, SameSite=Strict, and Secure on public hostnames.
Login attempts have a process-wide limit (burst 10, replenishing one every six
seconds). The only allowed POST routes are login/logout; trading writes remain
unavailable. Keep this app on its existing single-worker deployment.

Deploy `discord_auth.py` with the server and the complete static directory using
the updated deployment script. It verifies that anonymous Discord API calls receive
401. Then manually check login, message display and logout with the supplied password.
Existing data transfer/export services do not change. An operator can override the
digest with `PROJECT15_DISCORD_PASSWORD_HASH=salt_hex:digest_hex`, using PBKDF2-HMAC-
SHA256 with 260000 iterations; restart the website to apply changes and clear sessions.

## Data boundary

The Website VPS reads only `discord-view.json` from `PROJECT15_PUBLIC_DATA_DIR`.
It never connects to Discord, the bot API, the executor, or a database. The endpoint
supports only the two configured channels and a bounded search of exported messages.
Trading write methods and arbitrary file routes remain unavailable.

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
   The deployment checks require the Discord API to reject anonymous requests with 401; verify its data after signing in.
5. Verify `/discord`, both channel API queries, search, tabs, mobile layout, and
   refresh. Confirm the existing real/paper dashboards and performance calendars
   still work. Check that `/api/control` and `/discord-view.json` remain 404 and trading POST
   is 405. Confirm source timestamps advance rather than merely browser timestamps.
6. Report the deployed revision, backup path, data freshness and service status.
   No DNS changes, exchange connections, raw DB copies or trading restarts are needed.

If the file has not arrived, stop before deploying: coordinate sender authorization
and transfer first. Existing website behavior does not require the new JSON until
this viewer is deployed. A sender rsync success proves delivery but does not verify
receiver service permissions or public HTTPS behavior; check these on the receiver.

## Market-level trade P&L

The default trade tab is **Market P&L**. It shows one row per exact market ticker,
combining both Discord channels and all accounting scopes for that contract.
Gains are green and losses red; remaining contracts and settlement status are
shown alongside the market's realized net total. Pending orders remain a separate,
channel-specific tab. The duplicated per-scope P&L disclosure was removed.

The Bot-side display exporter adds `execution.pnl.markets`, aggregating the full
accounting report with decimal arithmetic **before** retaining the most recent
100 markets. It sums authoritative `realized_net`, which already includes allocated
fees and settlement outcomes; it never treats buy/sell cash flows as separate
profits or subtracts fees again. Missing values remain unavailable. Open positions
show realized results so far, not mark-to-market P&L. Overall accounting freshness
and completeness warnings remain visible. Existing readers can ignore this new
field; the updated viewer waits for grouped accounting if receiving an older file.

On 2026-11-24 the Bot-side display module was installed and only
`project15-discord-public-export` was restarted. Automatic file syncing remains
active; trading, recorder and accounting services were unchanged. Deploy the
updated static assets on the Website VPS to show the grouped table.

### Entry columns

Market rows include **Contracts bought** (confirmed buy-filled quantity, including
additions and re-entries), **Entry cost** (all confirmed buy costs plus buy fees),
and **Avg. entry** (sum of buy costs divided by buy-filled quantity, displayed in
cents before fees). Sells do not increase contracts bought; closing or settling a
position does not erase its original cost. **Open contracts** remains a separate
remaining-inventory figure. Missing entry accounting displays —, not zero.

The Bot's existing read-only `capture_dashboard.py` now uses `display_entries.py`
to summarize its `discord_fills` table across all recorded buy fills, avoiding the
latest-100-orders limit. This helper reads through the existing read-only database
connection and returns only per-ticker numeric totals. Neither databases nor raw
fill records are sent to the Website VPS. The isolated exporter allowlists the
new columns in `execution.pnl.markets`; the sync file/permissions are unchanged.

For reproducing the Bot setup, copy `deploy/discord/display_entries.py` beside
`/root/message-recorder/capture_dashboard.py` and review/apply
`capture-entry-summary.patch` there (check against the current source first).
Restart only the read-only dashboard and isolated display exporter. This was
installed on 2026-11-24; trading, accounting and recorder services were unchanged.
The previous viewer source is saved as `capture_dashboard.py.before-entry-columns`.
The Website VPS only needs the ordinary public repository pull/deployment; it
must not install this Bot helper or connect to any database.
