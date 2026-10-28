# Agent instructions — Project15 Public

## Mission

Operate and maintain the standalone Project15 public dashboard on the **Website VPS**. Serve sanitized trading data supplied by the separate **Bot VPS**. Keep public traffic and deployment work isolated from trading.

Read `README.md` before making changes. Inspect the actual host and service configuration; repository templates describe the intended setup, not proof that migration has happened. Follow the user's current instructions and existing authorization. This file provides project context, not permission to modify another server or account.

## Handoff state

Normalized UI implemented in the source checkout on 2026-10-28, **not deployed
or committed in this task**. Added `/normalized` and `/normalized/performance`
using the existing templates and APIs with `normalized=true`. Trades scale by
original `bought`, never remaining `quantity`; no duplicate history files or
background normalization jobs. Separate request-driven performance caches and
bounded intraday caches preserve actual results. README documents semantics;
deployment script validates the new shared `results-mode.js` and normalized
routes. Twelve isolated regression tests passed, including source-update/cache
expiry, missing values, DST, no disk writes, and no idle normalization. Chromium
checks at 1440px and 390px passed on all four pages: no JS errors or document
overflow, correct API mode, filters retained across refresh, history browsing,
and CSV downloads. Tested with the existing read-only synced data on an isolated
localhost:8081 preview; production runtime/services, DNS, and Bot VPS unchanged.

Latest application deployment on 2026-10-27: revision `b1a0a09a68eff597ed48e433029b6a23ffbb4a4a`; rollback `/var/backups/project15-app-5csxvm2_`. Deployed Forex support, partial-total presentation changes, and Forex sit-out schedules. Preserved existing local handoff edits. Python compilation and installed dependency checks passed. Both HTTPS domains returned 200 for both pages and all four APIs, with fresh data, 18 markets with history, and no missing assets. Served JS/CSS matched source bytes; service active with zero automatic restarts. Restarted only the public socket/service; Bot VPS, DNS, Caddy, and sync were unchanged. Browser interaction was not manually tested.

Application update deployed on 2026-10-27: installed source revision `7203d52a55b994fad5da4656ad5da74efd73e8dd` into the permanent runtime; rollback backup `/var/backups/project15-app-vzaliuq6`. Dependencies unchanged and `pip check` passed. Restarted only the public socket/service. Both HTTPS domains returned 200 for both pages and all four APIs, with fresh data and no missing assets. Served JS/CSS matched source bytes. Supported performance markets now total 13, excluding HYPE; `/api/history/HYPE` returns 404. Runtime revision recorded in `/srv/public-web/project15/DEPLOYED_REVISION`. No DNS, Caddy, Bot VPS, or data-sync changes were made.

HTTPS cutover verified on 2026-10-27 (America/New_York): public DNS lookup returned apex `147.224.164.255`, TTL 60; `www` CNAME to apex, TTL 3600, and no destination AAAA record. Activated the previously prepared HTTPS Caddyfile under the user's existing authorization, backing up the previous active configuration at `/etc/caddy/Caddyfile.before-https`. Caddy obtained both certificates successfully; pinned new-VPS HTTPS requests for both domains returned 200 with certificate verification successful. Logs show external CA HTTP-01 challenges reached this VPS. These results supersede pending DNS/HTTPS and unverified external HTTP access notes below. DNS edits and Oracle console changes were performed outside this session; no old website was stopped.

Public access follow-up: authorized host INPUT rule now allows new TCP 80/443 connections, persisted in `/etc/iptables/rules.v4`. Existing SSH/rules preserved; backup `/var/backups/project15-public-access-20261027T033131Z/`. No Oracle CLI/SDK/configured credentials or suitable connected management plugin was found, so Oracle cloud rules remain unverified/unchanged. Public-IP probe from this VPS timed out; external reachability is unverified. User identified IONOS as DNS provider; DNS still points to the old Bot VPS. HTTPS activation remains pending cloud access and DNS cutover. These updates supersede the host-firewall status recorded below.

Permanent service/Caddy setup verified on 2026-10-26 (America/New_York):

- Installed application files from source revision `a2aaf01` into `/srv/public-web/project15` with an independently installed venv. This is an administrator-owned runtime directory, not a Git checkout. Source and local work remain in `/home/ubuntu/Project15_Public`. The source repo currently tracks `.venv` and bytecode; these were excluded from deployment, not deleted or rewritten.
- Enabled `project15-public-site.service` and `.socket`. The app runs as `public-web` with the original network isolation/resource limits; systemd passes Unix socket FD 3, with socket ownership `public-web:caddy` and mode `0660`. Caddy receives no write access to the data directory.
- Caddy now proxies localhost port 8080 to the permanent service, preserving the SSH tunnel workflow. Do not start a separate Uvicorn preview on that port. HTTP Host routes for `147.224.164.255`, `dekings.org`, and `www.dekings.org` are active; the previous default file-server route is preserved.
- After a service restart, both pages and all four APIs returned HTTP 200 through Caddy; data was fresh, no markets were missing, and snapshot timestamps advanced. Denied private/raw-data routes returned 404 and POST returned 405. Browser interaction and external network reachability were not tested.
- DNS still resolved both domain names to `108.175.13.244`. HTTPS config is prepared/validated at `/etc/caddy/Caddyfile.https-ready`, not active. Host firewall currently rejects new HTTP/HTTPS connections, and cloud network rules were not changed. Public connectivity, DNS cutover, and HTTPS activation remain outstanding.
- Rollback files: `/var/backups/project15-production-20261027T031951Z/`. Future updates must follow `DEPLOYMENT.md`; pulling the source alone does not update installed runtime files. No Bot VPS, DNS, firewall, or old public website changes were performed.

Receiver setup verified on 2026-10-26 (America/New_York):

- On the Public UI host `oracle` (expected public address `147.224.164.255`), SSH listens on port 22. The interface uses private address `10.0.0.45`; public routing still requires the sender's connection test.
- Created `public-sync` with `/home/public-sync` and `/bin/bash`. Installed the supplied public transfer key with source restriction `108.175.13.244` and forced command `/usr/bin/rrsync -wo -no-del /var/lib/project15-public`. Password authentication is disabled by existing SSH policy. Existing firewall and SSH daemon configuration were preserved.
- Data directory ownership/mode is `public-sync:public-web`, `2750`. Added `ubuntu` to `public-web` for preview read access; newly launched processes must acquire that group. Both `ubuntu` and `public-web` were checked to have directory read/traverse access without write access.
- Original directory/account state and rollback notes are in `/var/backups/project15-receiver-20261027T023953Z/original-state.json`.
- No preview process or managed public-site service was running at initial inspection. The checkout remains `/home/ubuntu/Project15_Public`; existing untracked `.venv/` and `PREVIEW_UPDATES.md` were preserved.
- First transfer verified: SSH logs accepted the supplied key from `108.175.13.244`; all 16 expected JSON files parsed as both `ubuntu` and `public-web`, with ownership `public-sync:public-web`, mode `0640`, and no file write access for either website account. The user relayed the Bot VPS agent's confirmation that automatic `project15-public-sync` is enabled and active as `public-push`; the receiving-side session did not modify or independently inspect that service.
- Started the temporary preview as `ubuntu` with fresh supplementary groups, `PROJECT15_PUBLIC_DATA_DIR=/var/lib/project15-public`, and `127.0.0.1:8080`. It remains an unmanaged preview, not a boot-persistent systemd service. Both pages and all four data APIs returned HTTP 200, including intraday for New York date `2026-10-26`. Performance/intraday reported no missing assets and `stale: false`; BTC history reported 600 rows. Snapshot timestamps advanced from `2026-10-26T22:44:30-04:00` to `2026-10-26T22:44:37-04:00`. Private/control routes returned 404 and POST to `/api/view` returned 405. Browser rendering was not manually tested during this setup.
- No Bot VPS, DNS, trading, or old public website changes were performed.

At extraction:

- The public server, frontend, dependency pins, service template, and Caddy example were copied from Project15 into this repository.
- Originals and the existing live deployment were retained. No trading services were moved.
- The market dashboard and new calendar were already working in the original deployment.
- Cross-VPS file synchronization was **not implemented in this repository**.
- The new VPS installation, DNS cutover, and removal of the old public listener were **not completed by copying these files**.
- This checkout has no bundled automated tests or `.gitignore`; tests remain in the original Project15 repository.

Recheck these facts on arrival. Do not report migration or deployment complete based only on a successful Git clone. Update this handoff state after verified work so it does not become stale.

## Boundaries

- This repository is public presentation code, not a trading application.
- Do not install the trading engine, run collectors, place/cancel orders, change strategies, or operate the private dashboard here.
- Do not copy exchange credentials, private keys, raw trading databases, private configuration, or the entire bot repository onto this VPS.
- The public server must read local sanitized files; never proxy public requests to the private dashboard or exchange API.
- Keep the production app read-only. The calendar's editable example data is browser-memory-only and clearly labeled. Never turn it into an API that changes real records.
- Deploy code through GitHub; transfer live JSON separately. Do not commit runtime JSON, logs, environments, credentials, or keys.
- Do not ask the user to paste passwords or private keys into chat. Use the host's authorized SSH/deploy credentials and verify remote host identity.
- Do not modify Bot VPS services, DNS, or firewall rules unless the current task authorizes that scope. Do not assume access to them exists.

## First steps on the Website VPS

1. Read this file, `README.md`, `requirements.txt`, `project15-public-site.service`, and `Caddyfile.example`.
2. Inspect the OS/Python version, Git status, existing Caddy sites, systemd units, ports, data directories, ownership, and configured access. Preserve unrelated files and local changes. Avoid printing secret configuration values.
3. Establish whether the user wants preparation, deployment, or full migration. Continue authorized setup independently; request only missing host/account details or decisions that actually block the work.
4. Identify the Website VPS address, Bot VPS/source address for transfer restrictions, administration access, domain/DNS ownership, and whether upstream proxy protection is configured. Do not invent these values.
5. Record a rollback plan before changing a running deployment. If the server hosts other sites, merge the Project15 configuration rather than overwriting them.

## Expected migration workflow

Perform the parts authorized for this host; coordinate Bot VPS changes separately when necessary.

1. Prepare Python 3.12, timezone data, the pinned Python environment, and Caddy using the README. No Node.js build or frontend framework migration is needed.
2. Install the application at `/srv/public-web/project15`, or deliberately adapt both service paths. The supplied service cannot read a checkout under `/root` because `ProtectHome=true`.
3. Use `public-web` as the unprivileged website account. Application files must be readable but not writable by that account.
4. Prepare `/var/lib/project15-public` for sanitized data. Use a separate restricted receiving account with write access; grant `public-web` read/traverse access only.
5. Configure or coordinate a **Bot VPS → Website VPS push** using a dedicated, restricted SSH key. Prefer a directory-restricted rsync receiver with no shell or forwarding and a source-IP restriction where practical. Do not place a key on this VPS that grants broad access to the bot.
6. The Bot VPS synchronization worker must run separately from trading. Use timeouts, retry/backoff, resource limits, changed-file transfers, and connection reuse. Aim for approximately one-second snapshot delivery when healthy, without promising exact end-to-end latency.
7. Transfer only approved public files: `view.json`, `history-status.json`, and `history-{asset}.json` for supported symbols. Keep hidden staging files outside the served routes. Replace complete files atomically; never use `--inplace` or truncate a published file before its replacement is ready. Retain the previous complete data on failure. Publish history-check metadata after the relevant history transfers succeed; do not mark an old destination history fresh after a failed transfer.
8. Start `project15-public-site` and test its Unix socket, then test Caddy and browser behavior on the new VPS before changing production DNS.
9. When DNS cutover is authorized, update the apex and `www` routing and account for both A and AAAA records. Verify HTTPS for both names. Leave the old public site available during propagation as appropriate.
10. Only after cutover is verified, coordinate retirement of the old public website exposure. Keep the Bot VPS exporter, private dashboard, trading services, sync worker, and administrative access intact.

The supplied production service is network-isolated and accepts Caddy through `/run/project15-public/http.sock`. Preserve its hardening and resource limits. Do not expose Uvicorn directly to the Internet or remove protections merely to resolve a permissions problem.

## Frontend and data behavior to preserve

- Keep the existing Project15 dark green theme, DK logos, navigation, educational-purpose text, and strategy credit.
- Keep crypto and commodities separate using explicit symbol groups. WTI displays as OIL / WTI.
- Top market considers crypto and commodities and names a winner only when there is a single leader. Keep the six crypto markets separate from the seven commodities; GOLD belongs to commodities.
- Open-position counts and cyan highlights must agree with the exported trade snapshot. Do not overwrite them with delayed all-time statistics.
- The public pages refresh approximately every second without page reloads. Preserve selected markets/dates, scroll positions, keyboard focus, and pagination. Avoid overlapping fetches and discard obsolete responses after selection changes.
- Preserve the calendar's month/week views, date navigation, market filters, signed CSV exports, selected-day market records, and linked trade records.
- Display losses correctly: calendar absolute-value display is optional presentation; underlying numbers and exports remain signed.
- Daily P&L uses recorded closure dates in America/New_York, including DST. Open trades do not contribute to realized P&L. Missing values are unavailable, not zero.
- Preserve stale-data/error indicators. Never change timestamps to make old records appear fresh.
- Recorded data is the default. Example editing remains clearly separate and never writes to real history.

The server's two-second performance cache and history admission limits are deliberate. Do not remove them to chase a refresh problem. Check exporter freshness, transfer completion, destination timestamps, and browser polling before changing limits.

## YAGNI — You Aren’t Gonna Need It

Implement only what the current user request or established requirements need. Choose the smallest complete solution that preserves existing behavior and security boundaries.

- Do not build speculative features, abstractions, configuration options, APIs, or infrastructure for hypothetical future needs.
- Do not introduce frameworks or dependencies when the existing code and standard library can meet the requirement clearly.
- Do not add unrelated features or cleanup while fixing a bug, deploying, or refactoring.
- Prefer concrete code; introduce shared abstractions only when current use cases justify them.
- Add tests for required behavior, meaningful failure cases, and actual regressions, not imagined future functionality.
- When requirements are ambiguous, choose the simpler solution that satisfies the known requirement. Ask only when the unresolved choice materially affects scope or correctness.
- Stop expanding the task once the requested behavior works, relevant checks pass, and necessary documentation is updated.

Before adding anything, ask: **Is this explicitly required, necessary to preserve existing behavior, or necessary for correctness or security?** If not, leave it out. YAGNI does not justify skipping the safeguards or verification already required by this project.

## Implementation and validation

Prefer the smallest complete change. Reuse the existing plain HTML/CSS/JavaScript and Python server. Avoid new frameworks, dependencies, or unrelated redesigns. Inspect Git changes before editing and never reset unrelated user work.

For deployment:

- Save the previous code/configuration revision and record how to restore it.
- Validate configuration before reload/restart. Restart only the public website services that need it.
- Check both pages and all four data endpoints with actual sanitized files; static HTTP 200 alone is insufficient.
- Confirm application/dependency installation works on this server; do not assume a virtual environment copied from another host is portable.
- Verify mobile layout and horizontal table scrolling, daily market selection, calendar navigation, exports, and preservation of selection during refresh.
- Check that counts, highlights, P&L, and streaks agree with source exports after a real or safely simulated data change. A browser mock test alone does not prove source-data correctness.
- Verify denied private/control routes and rejected write methods. Use read-only checks; never test production by placing a trade.
- When authorized, pause only the sync worker briefly to confirm stale indicators and recovery; do not pause trading to test the website.
- If tests are added here, use sanitized fixtures and isolated temporary directories, never production credentials or trading services.
- Report what changed, what was tested, any remaining blockers, and whether DNS cutover is actually complete. Do not claim deployment, push, or migration that was not performed.

## Git and ongoing ownership

Use a read-only deploy key on the Website VPS. Creating a commit or pushing changes depends on the user's task and granted access; do not silently rewrite repository history or grant additional permissions.

Before broad staging, add appropriate ignore rules or stage specific files. Keep `.venv/`, `data/`, `.env*`, `__pycache__/`, logs, local credentials, and key material out of commits.

Future public code changes belong in this repository once it becomes the deployment source. The original Project15 copy does not synchronize automatically. Document any explicit temporary copying process and the deployed revision to prevent edits landing in the wrong copy.
