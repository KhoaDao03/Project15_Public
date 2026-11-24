"""Read-only public website. Reads published files; never calls a private service."""

import asyncio
import json
import os
import threading
import time
from collections import OrderedDict
from datetime import date, datetime, timedelta
from datetime import time as day_time
from pathlib import Path
from time import monotonic
from typing import Literal
from zoneinfo import ZoneInfo
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Query, Request
from discord_auth import DiscordAuth, COOKIE, TTL
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from public_discord import CHANNELS as DISCORD_CHANNELS, MAX_BYTES as DISCORD_MAX_BYTES, display_snapshot

if __package__:
    from .public_performance import build_performance, build_intraday, normalize_trade, empty_stats
else:  # The isolated website is installed without the trading package.
    from public_performance import build_performance, build_intraday, normalize_trade, empty_stats

ASSETS = ("BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "GOLD", "SILVER", "WTI", "PLATINUM", "PALLADIUM", "COPPER", "NATGAS")
HISTORY_RATE = 5
HISTORY_BURST = 10
HISTORY_CONCURRENCY = 2
HISTORY_MAX_BYTES = 8 * 1024 * 1024


def create_app(data_dir=None):
    directory = Path(data_dir or os.environ["PROJECT15_PUBLIC_DATA_DIR"])
    if not directory.is_dir():
        raise ValueError("Public data directory is unavailable")
    static = Path(__file__).with_name("public_static")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    history_tokens = float(HISTORY_BURST)
    history_checked = monotonic()
    history_active = 0
    history_cache = OrderedDict()
    history_lock = threading.Lock()
    discord_cache = None
    discord_version = None
    discord_lock = threading.Lock()
    discord_auth = DiscordAuth()

    @app.post('/api/discord/session')
    async def discord_login(request: Request):
        origin = request.headers.get('origin')
        if origin and (urlsplit(origin).netloc != request.headers.get('host') or urlsplit(origin).scheme not in ('http', 'https')):
            raise HTTPException(403)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 1024:
                raise HTTPException(413)
        try:
            password = json.loads(body).get('password')
        except (ValueError, AttributeError):
            raise HTTPException(400) from None
        if not isinstance(password, str) or len(password) > 128:
            raise HTTPException(400)
        status, token = discord_auth.login(password)
        response = JSONResponse({'ok': status == 200}, status_code=status)
        if token:
            response.set_cookie(COOKIE, token, max_age=TTL, httponly=True, samesite='strict',
                                secure=request.url.hostname not in ('localhost', '127.0.0.1', 'testserver'))
        if status == 429:
            response.headers['Retry-After'] = '60'
        return response

    @app.post('/api/discord/logout')
    def discord_logout(request: Request):
        discord_auth.logout(request.cookies.get(COOKIE))
        response = JSONResponse({'ok': True})
        response.delete_cookie(COOKIE)
        return response

    @app.get('/discord')
    @app.get('/discord/')
    def discord_page(request: Request):
        name = 'index.html' if discord_auth.valid(request.cookies.get(COOKIE)) else 'login.html'
        return FileResponse(static / 'discord' / name)

    @app.get('/discord/{asset}')
    def discord_asset(asset: str):
        if asset not in ('app.js', 'style.css', 'login.js'):
            raise HTTPException(404)
        return FileResponse(static / 'discord' / asset,
                            media_type='text/javascript' if asset.endswith('.js') else 'text/css')

    @app.get('/api/discord/messages')
    def discord_messages(channel: str = DISCORD_CHANNELS[0], q: str = Query('', max_length=200)):
        nonlocal discord_cache, discord_version
        if channel not in DISCORD_CHANNELS:
            raise HTTPException(400, 'Unknown channel')
        try:
            with discord_lock, (directory / 'discord-view.json').open('rb') as source:
                stat = os.fstat(source.fileno())
                version = (stat.st_ino, stat.st_size, stat.st_mtime_ns)
                if stat.st_size > DISCORD_MAX_BYTES:
                    raise ValueError('Oversize export')
                if version != discord_version:
                    candidate = json.loads(source.read(DISCORD_MAX_BYTES + 1))
                    if candidate['schema_version'] != 1:
                        raise ValueError('Unknown schema')
                    # Validate before replacing the cached bundle.
                    for cid in DISCORD_CHANNELS:
                        display_snapshot(candidate, cid)
                    discord_cache, discord_version = candidate, version
                return display_snapshot(discord_cache, channel, q)
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'Discord display data unavailable; retry shortly') from None

    @app.middleware("http")
    async def boundary(request, call_next):
        path = request.url.path
        session_post = request.method == 'POST' and path in ('/api/discord/session', '/api/discord/logout')
        if request.method not in ("GET", "HEAD") and not session_post:
            response = JSONResponse({"detail": "Read-only website"}, status_code=405)
        elif path.startswith('/api/discord/') and path not in ('/api/discord/session', '/api/discord/logout') and not discord_auth.valid(request.cookies.get(COOKIE)):
            response = JSONResponse({'detail': 'Password required'}, status_code=401)
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; "
            "img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        )
        return response

    def read(name, max_age):
        try:
            data = json.loads((directory / name).read_text())
            age = time.time() - data["updated_at"]
            data["stale"] = bool(data.get("stale")) or not 0 <= age <= max_age
            return data
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Public data unavailable; try again later") from None

    @app.get("/api/view")
    def view(normalized: bool = False):
        data = read("view.json", 20)
        if normalized:
            # Snapshot aggregates reflect real sizing. Never expose these as
            # normalized fallback values while the performance request loads.
            data["realized_pnl"] = None
            data["totals_complete"] = False
            data["normalized"] = True
            for asset in data.get("assets", []):
                asset["trades"] = [normalize_trade(row) for row in asset.get("trades", [])]
                for key in (*empty_stats(), "current_streak", "longest_win_streak",
                            "longest_loss_streak", "session_pnl"):
                    if key != "open_positions":
                        asset[key] = None
        return data

    def history_checked_at(asset, data):
        try:
            checked = json.loads((directory / "history-status.json").read_text()).get(asset)
            return max(data["updated_at"], checked) if type(checked) in (int, float) else data["updated_at"]
        except (OSError, ValueError, TypeError):
            return data["updated_at"]

    def history_page(asset, offset, limit, bounds=None, basis="closed", normalized=False):
        # Fixed asset keys and two cached files bound memory; one loader prevents
        # concurrent misses from repeatedly decoding the same complete export.
        try:
            with history_lock, (directory / f"history-{asset}.json").open("rb") as source:
                info = os.fstat(source.fileno())
                version = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
                if info.st_size > HISTORY_MAX_BYTES:
                    raise ValueError("History export exceeds serving budget")
                cached = history_cache.get(asset)
                if cached is None or cached[0] != version:
                    raw = source.read(HISTORY_MAX_BYTES + 1)
                    if len(raw) > HISTORY_MAX_BYTES:
                        raise ValueError("History export exceeds serving budget")
                    data = json.loads(raw)
                    if (not isinstance(data["rows"], list) or len(data["rows"]) > 50_000
                            or type(data["total"]) is not int or data["total"] != len(data["rows"])
                            or type(data["updated_at"]) not in (int, float)):
                        raise ValueError("Invalid history export")
                    if asset not in history_cache and len(history_cache) == 2:
                        history_cache.popitem(last=False)
                    history_cache[asset] = (version, data)
                else:
                    data = cached[1]
                history_cache.move_to_end(asset)
                rows = data["rows"]
                if bounds:
                    field = "exit_timestamp" if basis == "closed" else "opened"
                    rows = [row for row in rows if (basis != "closed" or row.get("status") == "CLOSED")
                            and type(row.get(field)) in (int, float) and bounds[0] <= row[field] < bounds[1]]
                page = rows[offset:offset + limit]
                if normalized:
                    page = [normalize_trade(row) for row in page]
                return dict(rows=page, total=len(rows),
                            offset=offset, limit=limit,
                            stale=bool(data.get("stale")) or not 0 <= time.time() - history_checked_at(asset, data) <= 120)
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Public history unavailable; try again later") from None

    @app.get("/api/history/{asset}")
    async def history(asset: str, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
                      day: date | None = None, basis: Literal["closed", "opened"] = "closed",
                      normalized: bool = False):
        nonlocal history_tokens, history_checked, history_active
        if asset not in ASSETS:
            raise HTTPException(404, "Unknown market")
        bounds = None
        if day:
            if not 2000 <= day.year <= 2100:
                raise HTTPException(422, "Date out of range")
            zone = ZoneInfo("America/New_York")
            bounds = (datetime.combine(day, day_time.min, zone).timestamp(),
                      datetime.combine(day + timedelta(days=1), day_time.min, zone).timestamp())
        now = monotonic()
        history_tokens = min(HISTORY_BURST, history_tokens + max(0, now - history_checked) * HISTORY_RATE)
        history_checked = now
        # One event loop owns admission; do not queue excess work or trust forwarded IPs.
        if history_tokens < 1 or history_active >= HISTORY_CONCURRENCY:
            raise HTTPException(429, "History is busy; retry shortly", headers={"Retry-After": "1"})
        history_tokens -= 1
        history_active += 1
        task = asyncio.create_task(asyncio.to_thread(history_page, asset, offset, limit, bounds, basis, normalized))

        def finished(done):
            nonlocal history_active
            history_active -= 1
            # Consume failures even if a disconnected request no longer awaits us.
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
        # Cancellation must not release capacity while the filesystem thread still runs.
        return await asyncio.shield(task)

    # At most one cached result per mode. No timers or startup calculations.
    performance_cache = {}

    def calculate_performance(normalized=False):
        # Load one bounded export at a time. Only aggregated statistics survive.
        class Histories:
            def get(self, asset):
                try:
                    path = directory / f"history-{asset}.json"
                    with path.open("rb") as source:
                        raw = source.read(HISTORY_MAX_BYTES + 1)
                    if len(raw) > HISTORY_MAX_BYTES:
                        raise ValueError("History exceeds budget")
                    data = json.loads(raw)
                    if not isinstance(data["rows"], list) or len(data["rows"]) != data["total"]:
                        raise ValueError("Incomplete history")
                    data["updated_at"] = history_checked_at(asset, data)
                    if normalized:
                        data["rows"] = [normalize_trade(row) for row in data["rows"]]
                    return data
                except (OSError, ValueError, KeyError, TypeError):
                    return None
        result = build_performance(Histories(), ASSETS, time.time())
        if len(result["missing_assets"]) == len(ASSETS):
            raise HTTPException(503, "Performance history unavailable")
        return result

    @app.get("/api/performance")
    async def performance(normalized: bool = False):
        cached = performance_cache.get(normalized)
        now = monotonic()
        if cached is None or (cached[1].done() and now - cached[0] >= 2):
            task = asyncio.create_task(asyncio.to_thread(calculate_performance, normalized))
            task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
            cached = performance_cache[normalized] = (now, task)
        return await asyncio.shield(cached[1])

    intraday_cache = OrderedDict()

    def calculate_intraday(day, normalized=False):
        zone = ZoneInfo("America/New_York")
        bounds = (datetime.combine(day, day_time.min, zone).timestamp(),
                  datetime.combine(day + timedelta(days=1), day_time.min, zone).timestamp())

        class Histories:
            def get(self, asset):
                try:
                    return history_page(asset, 0, 50_000, bounds, "closed", normalized)
                except HTTPException:
                    return None

        return build_intraday(Histories(), ASSETS, day.isoformat(), time.time())

    @app.get("/api/intraday")
    async def intraday(day: date, normalized: bool = False):
        nonlocal history_tokens, history_checked, history_active
        if not 2000 <= day.year <= 2100:
            raise HTTPException(422, "Date out of range")
        now = monotonic()
        cache_key = (day, normalized)
        cached = intraday_cache.get(cache_key)
        if cached and (not cached[1].done() or now - cached[0] < 2):
            return await asyncio.shield(cached[1])
        history_tokens = min(HISTORY_BURST, history_tokens + max(0, now - history_checked) * HISTORY_RATE)
        history_checked = now
        if history_tokens < 1 or history_active >= HISTORY_CONCURRENCY:
            raise HTTPException(429, "History is busy; retry shortly", headers={"Retry-After": "1"})
        if cache_key not in intraday_cache and len(intraday_cache) >= 2:
            completed = next((key for key, value in intraday_cache.items() if value[1].done()), None)
            if completed is None:
                raise HTTPException(429, "History is busy; retry shortly", headers={"Retry-After": "1"})
            del intraday_cache[completed]
        history_tokens -= 1
        history_active += 1
        task = asyncio.create_task(asyncio.to_thread(calculate_intraday, day, normalized))
        intraday_cache[cache_key] = (now, task)

        def finished(done):
            nonlocal history_active
            history_active -= 1
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
        return await asyncio.shield(task)

    def normalized_page(filename):
        html = (static / filename).read_text()
        html = html.replace("<body", '<body data-results-mode="normalized"', 1)
        html = html.replace("Project15 · ", "Project15 · Paper Trading · ", 1)
        html = html.replace("<h1>", "<h1>Paper Trading · ", 1)
        notice = ('<aside class="normalization-notice" aria-label="Calculation basis">'
                  '<strong>Paper Trading with 1 contract</strong>'
                  '<p>Each recorded trade is scaled to one originally bought contract. '
                  'Net P&amp;L and recorded fees are divided by contracts bought. '
                  'Entry/exit prices, timing, and trade counts stay the same. '
                  'These hypothetical results reuse recorded trades; they are not actual returns '
                  'or an independently executed paper-trading simulation. '
                  'Missing sizes remain unavailable; fees are proportional estimates. '
                  'Live status and open-trade counts describe the actual bot.</p></aside>')
        return HTMLResponse(html.replace("<main>", "<main>" + notice, 1))

    @app.get("/")
    @app.get("/normalized")
    def normalized_index():
        return normalized_page("index.html")

    @app.get("/performance")
    @app.get("/normalized/performance")
    def normalized_performance_page():
        return normalized_page("performance.html")

    @app.get("/results-mode.js")
    def results_mode_script():
        return FileResponse(static / "results-mode.js", media_type="text/javascript")

    @app.get("/real/performance")
    def performance_page():
        return FileResponse(static / "performance.html")

    @app.get("/performance.js")
    def performance_script():
        return FileResponse(static / "performance.js", media_type="text/javascript")

    @app.get("/real")
    def index():
        return FileResponse(static / "index.html")

    @app.get("/viewer.js")
    def javascript():
        return FileResponse(static / "viewer.js", media_type="text/javascript")

    @app.get("/viewer.css")
    def stylesheet():
        return FileResponse(static / "viewer.css", media_type="text/css")

    @app.get("/section-logo.svg")
    def section_logo():
        return FileResponse(static / "section-logo.svg", media_type="image/svg+xml")

    @app.get("/logo.svg")
    def logo():
        return FileResponse(static / "logo.svg", media_type="image/svg+xml")

    return app
