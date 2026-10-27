# Project15 Public Dashboard

Standalone, read-only website for Project15's published trading results. This repository contains the public server and browser assets copied from Project15. It does not contain the trading engine, exchange credentials, private dashboard, or public-data exporter.

Copying these files did not change the running deployment. The separate-VPS migration and automatic data transfer still need to be configured. This repository is now an independent copy; changes in the original Project15 folder do not automatically appear here.

## Agent handoff

AI agents working on the Website VPS must read [AGENTS.md](AGENTS.md) first. It describes the intended server boundary, migration checklist, preserved UI behavior, verification requirements, and work that is still outstanding.

## Pages

- **Market dashboard (`/`)**: all-time results, crypto and commodity records grouped separately with overall rankings, market status, selected-market details, and trade history. Open-position counts drive cyan highlights. Top market includes crypto and commodities; tied leaders are not named.
- **Performance history (`/performance`)**: monthly and weekly P&L calendar, market filters, selected-day market records, and selectable market rows linked to daily trade records. Week/month CSV exports retain signed P&L values.
- **Example calendar**: optional October 2025 sample data. Visitors can edit example daily records in browser memory; edits disappear on reload and never alter recorded trades.

Both pages use the Project15 theme. Supported markets are BTC, ETH, SOL, XRP, BNB, DOGE, GOLD, SILVER, WTI (displayed as OIL / WTI), PLATINUM, PALLADIUM, COPPER, and NATGAS (natural gas).

## Repository contents

| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Agent handoff, scope boundaries, and migration instructions |
| `public_site.py` | FastAPI server; reads local sanitized JSON and serves an explicit set of public routes |
| `public_performance.py` | Calculates daily and all-time performance from exported trade history |
| `public_static/index.html`, `public_static/viewer.js` | Market dashboard |
| `public_static/performance.html`, `public_static/performance.js` | Calendar, daily market records, and trade history |
| `public_static/viewer.css` | Shared styles |
| `public_static/logo.svg`, `public_static/section-logo.svg` | Brand assets and theme-aware tab icons |
| `requirements.txt` | Pinned public-server dependencies |
| `project15-public-site.service` | Hardened Linux systemd service template |
| `Caddyfile.example` | HTTPS reverse proxy configuration for dekings.org and www.dekings.org |

No frontend build step or Node.js installation is required. Use Python 3.12 and a system with the America/New_York timezone database, such as Ubuntu 24.04 with `tzdata` installed.

## Data flow and server separation

```text
Bot VPS                                      Website VPS
Private dashboard → public exporter → JSON → restricted file sync → local JSON
                                                                    ↓
                                                            Public server → Caddy → visitors
```

The existing exporter stays on the **Bot VPS**. On the original project it runs as `project15-public-export.service` and writes `/var/lib/project15-public`.

The **Website VPS** runs only the public server, reverse proxy, and a restricted receiving account. It does not need exchange keys or network access to the private dashboard. Public requests never trigger calls to the bot API.

A cross-VPS sync service is **not included in this repository**. Before switching DNS, configure a separate, resource-limited worker on the Bot VPS to push sanitized data over restricted SSH/rsync. Use connection/transfer timeouts, reuse SSH connections, and transfer changed files only. Publish through temporary files followed by rename; do not use rsync `--inplace`. A failed transfer must retain the previous complete files and must not block trading.

### Required data files

Set `PROJECT15_PUBLIC_DATA_DIR` to an existing directory readable by the public server. Production defaults in the supplied service are `/var/lib/project15-public`.

| File | Contents |
| --- | --- |
| `view.json` | Sanitized market snapshot, including `updated_at`, assets, current open counts, quotes, and recent trades |
| `history-BTC.json` and one file for each supported symbol | Complete sanitized history: `rows`, `total`, `updated_at`, and optional `stale` |
| `history-status.json` | Object mapping asset symbols to the Unix time their histories were last checked successfully |

Use the existing exporter rather than copying raw databases. A history row can include `market`, `status`, `side`, `bought`, `quantity`, `entry`, `exit`, `fees`, `net_pnl`, `timestamp`, `opened`, `exit_timestamp`, `exit_type`, and `market_result`.

Times are Unix seconds. Daily accounting uses closure dates in **America/New_York**, including daylight-saving transitions. P&L is net of recorded fees. Open trades do not contribute to realized P&L. Missing or unknown results must remain unavailable rather than being substituted with zero.

History files are limited to 8 MiB each by the public server. Missing data does not prevent the static pages from loading, but affected API requests return an unavailable response or incomplete totals.

## Local development

From this repository:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
mkdir -p data
export PROJECT15_PUBLIC_DATA_DIR="$PWD/data"
.venv/bin/python -m uvicorn public_site:create_app --factory --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/` or `/performance`. Supply sanitized exports in `data/` to show real records. The performance page's Example calendar can be used without recorded data, though the connection warning will remain until the API has usable history.

Keep `.venv/`, `data/`, `.env` files, SSH keys, credentials, and logs out of Git. Add appropriate ignore rules before using broad commands such as `git add .`; this repository currently does not include a `.gitignore`.

## Production deployment on the Website VPS

The service template expects this layout:

```text
/srv/public-web/project15/              Application checkout and .venv
/var/lib/project15-public/              Synced sanitized data
/run/project15-public/http.sock        Runtime Unix socket
```

1. Install Python 3.12, its venv support, `tzdata`, rsync, and Caddy. Clone this public-only repository into `/srv/public-web/project15`. Use a read-only GitHub deploy key for future pulls.
2. Create the `public-web` system user/group, with no interactive login. Keep application files owned by the deployment administrator and readable by `public-web`, not writable by it.
3. Create the venv and install `requirements.txt` there. Do not copy the Bot VPS's virtual environment.
4. Create the data directory and populate it through your restricted receiving account. Give `public-web` read/traverse access; give write access only to the receiving account. A typical arrangement is directory mode `2750` with group `public-web`, and file mode `0640`. Ensure subsequent transfers preserve that access.
5. Install and start the service:

   ```bash
   sudo install -m 0644 project15-public-site.service /etc/systemd/system/project15-public-site.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now project15-public-site
   sudo systemctl status project15-public-site
   ```

6. Test the backend locally:

   ```bash
   sudo curl --unix-socket /run/project15-public/http.sock http://localhost/api/view
   sudo curl --unix-socket /run/project15-public/http.sock http://localhost/api/performance
   ```

7. Configure Caddy using `Caddyfile.example`. Review existing Caddy configuration before replacing or merging it. Validate and reload:

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

8. Test the new server before changing production DNS, for example using a temporary HTTP IP-based Caddy site. After verification, use the domain configuration and point the domain's A records at the Website VPS. Update or remove old AAAA records too. A `www` CNAME pointing to the apex can remain unchanged. Allow ports 80/443 and verify HTTPS after cutover.
9. Once DNS migration is confirmed, retire the old public-site service and public website exposure on the Bot VPS. Keep its trading services, private dashboard, exporter, and sync worker running. Preserve SSH/VPN access to the private dashboard.

The supplied service has `ProtectHome=true`: do not point it at a checkout under `/root`. If using another application location, update both `WorkingDirectory` and `ExecStart` in the service file.

The public service uses a Unix socket and a private network namespace; do not replace it with a publicly exposed Uvicorn TCP listener in production. Caddy must be able to connect to the socket.

## Refresh behavior and limits

- Browser live/statistics refresh: approximately one second, subject to request duration and in-flight guards. It updates data without reloading the page.
- Backend performance calculations: shared between requests and cached/coalesced for two seconds.
- Original Bot VPS exporter: snapshots update on a one-second loop; detected recent-trade changes trigger history refresh, with a 60-second fallback check. This exporter is outside this repository.
- Cross-VPS synchronization introduces additional delay. A one-second browser poll does not guarantee one-second exchange-to-screen latency.
- Snapshot stale threshold: 20 seconds. History stale threshold: 120 seconds since its last successful check.
- History request admission per server process: five requests/second, burst ten, at most two concurrent operations. Excess requests receive HTTP 429.
- Service template: 50% of one CPU core, 256 MiB RAM, and 64 tasks. Caddy has separate limits; the public-service limits do not cap proxy or network usage.

Separating the VPSs reduces competition with the bot for CPU and memory. It does not replace upstream DDoS protection or eliminate shared-provider network risks.

## Public API

| Route | Purpose |
| --- | --- |
| `GET /api/view` | Latest published market snapshot |
| `GET /api/performance` | Daily and all-time performance, freshness information, and missing-market indicators |
| `GET /api/history/{asset}` | Paginated sanitized trade records |
| `GET /api/intraday?day=YYYY-MM-DD` | Cumulative realized P&L at trade-close times for the selected New York day, per market and total |

History query parameters: `offset` (default 0), `limit` (default 25, maximum 100), optional `day=YYYY-MM-DD`, and `basis=closed` or `basis=opened`. Supported years for day filtering are 2000–2100.

The chart beneath the performance calendar shows each of the 13 markets and total realized P&L after fees, starting at zero each day. Hover, tap, or use arrow keys to inspect values; legend buttons toggle lines. The market filter also filters the total. Unknown P&L stays unavailable. Example records have no intraday chart because they contain daily totals only. Intraday responses are cached for two seconds and share the trade-history request limits.

Requests using methods other than GET/HEAD are rejected. There are no public trading controls or write APIs. Example calendar edits and CSV downloads happen in the browser.

## Updates and verification

Pull reviewed code on the Website VPS, install dependencies if changed, and restart `project15-public-site`. Keep a known-good code revision for rollback. Code deployment and ongoing data synchronization are separate operations.

Check after deployment:

- Both public pages load without browser errors.
- Crypto and commodities remain separate; daily records follow the selected calendar date.
- Selecting a market loads that market's daily trade records.
- Open counts and cyan highlights agree with the exported open-trade data.
- Calendar month/week navigation, CSV exports, and mobile table scrolling work.
- Automatic refresh preserves the selected day, market, and scroll position.
- Data timestamps advance; a stopped sync produces stale indicators instead of fabricated values.
- Private paths such as `/api/control`, `/api/manual/orders`, and `/docs` are unavailable.

Useful diagnostics:

```bash
sudo systemctl status project15-public-site
sudo journalctl -u project15-public-site -n 100 --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

If updates stop, check the Bot VPS exporter, then file synchronization, destination permissions, and finally the public server. Do not commit exported histories or credentials to GitHub as a substitute for synchronization.

This extracted repository currently has no bundled automated test suite. Original backend and browser tests remain in the Project15 repository; do not assume they automatically test future changes made only here.

Commodity open-position highlights use 8% red when the model opposes the held side (cyan remains 6%). The bot-side public exporter retains `last_model_probability` on each still-open trade when evaluation moves to another contract. This is a last-known model reading, not a confirmed result; match it only to that trade. Existing snapshots without this field cannot recover earlier readings.

The source dashboard allows reference prices up to five seconds old for display. Trading freshness limits remain separate and unchanged. This limit is implemented in the bot VPS source dashboard, not this standalone website.

The Market dashboard records table includes Latest session Δ P&L (Performance History does not display this column): realized net P&L for the latest completed 15-minute contract, matched by contract ticker rather than trade exit time. Skipped intervals show zero; open/unsettled trades show Pending. Performance History uses the latest interval ending on its selected New York date. The source server supplies session_pnl, session_pending, and session_close through /api/performance.

The Market dashboard defaults to Today (America/New_York). Its All time / Today switch updates the summary, market records, rankings, and group totals; live open counts and current streaks remain independent of the selected period.

Latest-session P&L also shows a current-interval realized crypto loss before that interval ends. Crypto market rows use an 8% red highlight only for an early realized loss while that contract interval is still active; the background clears when the interval ends. If other trades in the same contract remain open, the known loss is shown with Pending. Historical selected dates continue to use their final completed interval.

Market detail shows Average net per contract in cents: all-time realized net P&L × 100 divided by contracts bought in completed trades. Open trades are excluded. Missing P&L or bought quantities make this average unavailable.
