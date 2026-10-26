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

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

if __package__:
    from .public_performance import build_performance, build_intraday
else:  # The isolated website is installed without the trading package.
    from public_performance import build_performance, build_intraday

ASSETS = ("BTC", "ETH", "SOL", "XRP", "BNB", "HYPE", "DOGE", "GOLD", "SILVER", "WTI", "PLATINUM", "PALLADIUM", "COPPER", "NATGAS")
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

    @app.middleware("http")
    async def boundary(request, call_next):
        if request.method not in ("GET", "HEAD"):
            response = JSONResponse({"detail": "Read-only website"}, status_code=405)
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
    def view():
        return read("view.json", 20)

    def history_checked_at(asset, data):
        try:
            checked = json.loads((directory / "history-status.json").read_text()).get(asset)
            return max(data["updated_at"], checked) if type(checked) in (int, float) else data["updated_at"]
        except (OSError, ValueError, TypeError):
            return data["updated_at"]

    def history_page(asset, offset, limit, bounds=None, basis="closed"):
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
                return dict(rows=rows[offset:offset + limit], total=len(rows),
                            offset=offset, limit=limit,
                            stale=bool(data.get("stale")) or not 0 <= time.time() - history_checked_at(asset, data) <= 120)
        except (OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, "Public history unavailable; try again later") from None

    @app.get("/api/history/{asset}")
    async def history(asset: str, offset: int = Query(0, ge=0), limit: int = Query(25, ge=1, le=100),
                      day: date | None = None, basis: Literal["closed", "opened"] = "closed"):
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
        task = asyncio.create_task(asyncio.to_thread(history_page, asset, offset, limit, bounds, basis))

        def finished(done):
            nonlocal history_active
            history_active -= 1
            # Consume failures even if a disconnected request no longer awaits us.
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
        # Cancellation must not release capacity while the filesystem thread still runs.
        return await asyncio.shield(task)

    performance_task = None
    performance_checked = 0.0

    def calculate_performance():
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
                    return data
                except (OSError, ValueError, KeyError, TypeError):
                    return None
        result = build_performance(Histories(), ASSETS, time.time())
        if len(result["missing_assets"]) == len(ASSETS):
            raise HTTPException(503, "Performance history unavailable")
        return result

    @app.get("/api/performance")
    async def performance():
        nonlocal performance_task, performance_checked
        # Coalesce viewers and cap request-driven rebuilds; no background worker.
        if performance_task is None or (performance_task.done() and monotonic() - performance_checked >= 2):
            performance_checked = monotonic()
            performance_task = asyncio.create_task(asyncio.to_thread(calculate_performance))
            performance_task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
        return await asyncio.shield(performance_task)

    intraday_cache = OrderedDict()

    def calculate_intraday(day):
        zone = ZoneInfo("America/New_York")
        bounds = (datetime.combine(day, day_time.min, zone).timestamp(),
                  datetime.combine(day + timedelta(days=1), day_time.min, zone).timestamp())

        class Histories:
            def get(self, asset):
                try:
                    return history_page(asset, 0, 50_000, bounds, "closed")
                except HTTPException:
                    return None

        return build_intraday(Histories(), ASSETS, day.isoformat(), time.time())

    @app.get("/api/intraday")
    async def intraday(day: date):
        nonlocal history_tokens, history_checked, history_active
        if not 2000 <= day.year <= 2100:
            raise HTTPException(422, "Date out of range")
        now = monotonic()
        cached = intraday_cache.get(day)
        if cached and (not cached[1].done() or now - cached[0] < 2):
            return await asyncio.shield(cached[1])
        history_tokens = min(HISTORY_BURST, history_tokens + max(0, now - history_checked) * HISTORY_RATE)
        history_checked = now
        if history_tokens < 1 or history_active >= HISTORY_CONCURRENCY:
            raise HTTPException(429, "History is busy; retry shortly", headers={"Retry-After": "1"})
        if day not in intraday_cache and len(intraday_cache) >= 2:
            completed = next((key for key, value in intraday_cache.items() if value[1].done()), None)
            if completed is None:
                raise HTTPException(429, "History is busy; retry shortly", headers={"Retry-After": "1"})
            del intraday_cache[completed]
        history_tokens -= 1
        history_active += 1
        task = asyncio.create_task(asyncio.to_thread(calculate_intraday, day))
        intraday_cache[day] = (now, task)

        def finished(done):
            nonlocal history_active
            history_active -= 1
            if not done.cancelled():
                done.exception()

        task.add_done_callback(finished)
        return await asyncio.shield(task)

    @app.get("/performance")
    def performance_page():
        return FileResponse(static / "performance.html")

    @app.get("/performance.js")
    def performance_script():
        return FileResponse(static / "performance.js", media_type="text/javascript")

    @app.get("/")
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
