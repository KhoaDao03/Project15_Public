"""Daily public performance derived only from sanitized, recorded trade history."""

import math
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TIMEZONE = "America/New_York"


def trade_day(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        return None
    try:
        return datetime.fromtimestamp(value, ZoneInfo(TIMEZONE)).date().isoformat()
    except (ValueError, OverflowError, OSError):
        return None


def empty_stats():
    return dict(realized_pnl=0.0, completed_trades=0, wins=0, losses=0,
                breakeven_trades=0, unknown_pnl=0, win_rate=None, opened_trades=0, open_positions=0,
                completed_contracts=0.0, unknown_contracts=0, average_net_cents=None)


def record_close(stats, row):
    stats["completed_trades"] += 1
    contracts = row.get('bought')
    if type(contracts) in (int, float) and math.isfinite(contracts) and contracts > 0:
        stats['completed_contracts'] += contracts
    else:
        stats['unknown_contracts'] += 1
    pnl = row.get("net_pnl")
    if type(pnl) not in (int, float) or not math.isfinite(pnl):
        stats["unknown_pnl"] += 1
    else:
        stats["realized_pnl"] += pnl
        stats["wins" if pnl > 0 else "losses" if pnl < 0 else "breakeven_trades"] += 1


def finish(stats):
    if stats["unknown_pnl"]:
        stats["realized_pnl"] = None
    else:
        stats["realized_pnl"] = round(stats["realized_pnl"], 8)
        if stats["completed_trades"]:
            stats["win_rate"] = stats["wins"] / stats["completed_trades"]
    if not stats['unknown_pnl'] and not stats['unknown_contracts'] and stats['completed_contracts'] > 0:
        stats['average_net_cents'] = stats['realized_pnl'] * 100 / stats['completed_contracts']
    return stats


def session_stats(rows, asset, as_of, include_early_loss=False):
    close = math.floor(as_of / 900) * 900
    def trades_at(timestamp):
        local = datetime.fromtimestamp(timestamp, ZoneInfo(TIMEZONE))
        month = ('JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC')[local.month-1]
        ticker = f"KX{asset}15M-{local:%y}{month}{local:%d%H%M}-{local:%M}"
        return rows.get(ticker, [])
    matches = trades_at(close)
    early = False
    if include_early_loss and asset in ('BTC','ETH','SOL','XRP','BNB','DOGE'):
        current = trades_at(close + 900)
        closed = [r for r in current if r.get('status') == 'CLOSED']
        if closed and all(type(r.get('net_pnl')) in (int,float) and math.isfinite(r['net_pnl'])
                          and type(r.get('exit_timestamp')) in (int,float) and r['exit_timestamp'] <= as_of
                          for r in closed) and math.fsum(r['net_pnl'] for r in closed) < 0:
            matches, close, early = current, close + 900, True
    pending = any(r.get('status') == 'OPEN' for r in matches)
    values = [r.get('net_pnl') for r in matches if r.get('status') == 'CLOSED']
    known = all(type(v) in (int,float) and math.isfinite(v) for v in values)
    return dict(session_pnl=round(math.fsum(values),8) if known and (early or not pending) else None,
                session_pending=pending, session_close=close, session_early_exit=early)


def build_performance(histories, assets, now):
    today = trade_day(now)
    daily = {}
    all_time = {}
    sessions = {}
    excluded = 0
    timestamps = []
    missing = []
    stale = False
    for asset in assets:
        data = histories.get(asset)
        if data is None:
            missing.append(asset)
            continue
        timestamps.append(data["updated_at"])
        stale = stale or bool(data.get("stale")) or not 0 <= now - data["updated_at"] <= 120
        grouped = {}
        for row in data['rows']:
            grouped.setdefault(row.get('market'), []).append(row)
        sessions[asset] = grouped
        total = empty_stats()
        total.update(session_stats(grouped, asset, now, include_early_loss=True))
        streak = longest_win = longest_loss = 0
        for row in sorted((r for r in data["rows"] if r.get("status") == "CLOSED"),
                          key=lambda r: (r.get("exit_timestamp") or r.get("timestamp") or 0, r.get("market", ""))):
            pnl = row.get("net_pnl")
            if type(pnl) not in (int, float) or not math.isfinite(pnl):
                streak = 0
                continue
            streak = (streak + 1 if streak > 0 else 1) if pnl > 0 else ((streak - 1 if streak < 0 else -1) if pnl < 0 else 0)
            longest_win, longest_loss = max(longest_win, streak), max(longest_loss, -streak)
        total.update(current_streak=streak, longest_win_streak=longest_win, longest_loss_streak=longest_loss)
        all_time[asset] = total
        for row in data["rows"]:
            opened = trade_day(row.get("opened"))
            if opened and "2000-01-01" <= opened <= today:
                total["opened_trades"] += 1
                daily.setdefault(opened, {}).setdefault(asset, empty_stats())["opened_trades"] += 1
            if row.get("status") == "OPEN":
                total["open_positions"] += 1
                continue
            if row.get("status") != "CLOSED":
                continue
            record_close(total, row)
            closed = trade_day(row.get("exit_timestamp"))
            if not closed or not "2000-01-01" <= closed <= today:
                excluded += 1
                continue
            record_close(daily.setdefault(closed, {}).setdefault(asset, empty_stats()), row)
    # Explicit zero-trade days make adjacent-day comparisons meaningful.
    first = min(daily, default=today)
    day = datetime.fromisoformat(first).date()
    end = datetime.fromisoformat(today).date()
    days = []
    while day <= end:
        key = day.isoformat()
        stats = daily.get(key, {})
        as_of = min(now, datetime.combine(day + timedelta(days=1), datetime.min.time(), ZoneInfo(TIMEZONE)).timestamp() - .001)
        day_assets = {}
        for asset in all_time:
            value = finish(stats.get(asset, empty_stats()))
            value.update(session_stats(sessions[asset], asset, as_of, include_early_loss=key == today))
            day_assets[asset] = value
        days.append(dict(date=key, assets=day_assets))
        day += timedelta(days=1)
    return dict(timezone=TIMEZONE, today=today, updated_at=min(timestamps, default=now),
                generated_at=now, stale=stale or bool(missing), missing_assets=missing,
                excluded_undated_trades=excluded, all_time={a: finish(s) for a, s in all_time.items()}, days=days)


def build_intraday(histories, assets, day, now):
    """Cumulative realized P&L at actual close times, with DST-aware day bounds."""
    zone = ZoneInfo(TIMEZONE)
    start_date = datetime.fromisoformat(day).date()
    start = datetime.combine(start_date, datetime.min.time(), zone).timestamp()
    end = datetime.combine(start_date + timedelta(days=1), datetime.min.time(), zone).timestamp()
    until = max(start, min(now, end))
    series, missing, changes = {}, [], {}
    stale = False
    for asset in assets:
        history = histories.get(asset)
        if history is None:
            missing.append(asset)
            series[asset] = [dict(timestamp=start, pnl=None)]
            continue
        stale = stale or bool(history.get('stale'))
        grouped = {}
        for row in history['rows']:
            closed = row.get('exit_timestamp')
            if (row.get('status') != 'CLOSED' or type(closed) not in (int, float)
                    or not start <= closed < end or closed > until):
                continue
            pnl = row.get('net_pnl')
            value = pnl if type(pnl) in (int, float) and math.isfinite(pnl) else None
            previous = grouped.get(closed, 0)
            grouped[closed] = previous + value if previous is not None and value is not None else None
        cumulative = 0
        points = [dict(timestamp=start, pnl=0)]
        for timestamp, value in sorted(grouped.items()):
            cumulative = cumulative + value if cumulative is not None and value is not None else None
            points.append(dict(timestamp=timestamp, pnl=cumulative))
            changes.setdefault(timestamp, {})[asset] = cumulative
        points.append(dict(timestamp=until, pnl=cumulative))
        series[asset] = points
    current = {asset: None if asset in missing else 0 for asset in assets}

    def total_value():
        return math.fsum(current.values()) if all(v is not None for v in current.values()) else None

    total = [dict(timestamp=start, pnl=total_value())]
    for timestamp, values in sorted(changes.items()):
        current.update(values)
        total.append(dict(timestamp=timestamp, pnl=total_value()))
    total.append(dict(timestamp=until, pnl=total_value()))
    return dict(day=day, timezone=TIMEZONE, start=start, end=end, until=until,
                generated_at=now, assets=series, total=total, missing_assets=missing,
                stale=stale or bool(missing))
