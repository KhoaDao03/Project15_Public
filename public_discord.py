"""Display-only Discord contract shared by the exporter and public reader.

No recorder, execution, database or network imports belong here.
"""
import copy
import hashlib
import math
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation

CHANNELS = ('1570490132614619258', '1571977187119333396')
MAX_BYTES = 8 * 1024 * 1024


def pick(value, keys):
    value = value if isinstance(value, dict) else {}
    return {k: (v[:20000] if isinstance(v, str) else v)
            for k in keys.split() if k in value
            for v in [value[k]] if v is None or type(v) in (str, bool, int, float)
            if not isinstance(v, float) or math.isfinite(v)}


def records(value, limit):
    return [v for v in value[:limit] if isinstance(v, dict)] if isinstance(value, list) else []


def market_totals(trades, entries=None):
    """Combine all accounting scopes before limiting the displayed markets.

    realized_net already includes allocated entry/exit fees and settlements.
    Never add order cash flows or subtract those fees a second time.
    """
    groups = {}
    for trade in trades if isinstance(trades, list) else []:
        if not isinstance(trade, dict) or not isinstance(trade.get('ticker'), str):
            continue
        ticker = trade['ticker']
        group = groups.pop(ticker, None) or dict(ticker=ticker, directions=set(), statuses=set(),
                                                 realized_net=Decimal(0), open_contracts=Decimal(0))
        groups[ticker] = group  # Most recently recorded scope controls display order.
        group['directions'].add(str(trade.get('direction') or 'Unknown'))
        group['statuses'].add(trade.get('status'))
        for key in ('realized_net', 'open_contracts'):
            try:
                value = Decimal(str(trade.get(key)))
                if not value.is_finite():
                    raise ValueError('Unknown amount')
                if group[key] is not None:
                    group[key] += value
            except (InvalidOperation, ValueError):
                group[key] = None
    result = []
    for group in reversed(list(groups.values())):
        statuses = group.pop('statuses')
        group['direction'] = ' / '.join(sorted(group.pop('directions')))
        group['status'] = ('accounting_pending' if group['realized_net'] is None or group['open_contracts'] is None
                           else 'settlement_pending' if 'settlement_pending' in statuses
                           else 'open' if group['open_contracts'] > 0
                           else 'settled' if 'settled' in statuses else 'closed')
        for key in ('realized_net', 'open_contracts'):
            group[key] = str(group[key]) if group[key] is not None else None
        group.update(contracts_bought=None, entry_cost=None, average_entry=None)
        entry = (entries or {}).get(group['ticker'], {})
        try:
            qty, cost, fees = (Decimal(str(entry.get(k))) for k in ('contracts_bought', 'entry_cost', 'entry_fees'))
            if all(v.is_finite() for v in (qty, cost, fees)) and qty > 0 and 0 <= cost <= qty and fees >= 0:
                group.update(contracts_bought=str(qty), entry_cost=str(cost + fees), average_entry=str(cost / qty))
        except (InvalidOperation, ValueError, AttributeError):
            pass
        result.append(group)
    return result[:100]


def sanitize(source, channel):
    """Explicit allowlist; exclude raw exchange IDs, errors, parser and account data."""
    if channel not in CHANNELS or source.get('channel_id') != channel:
        raise ValueError('Unexpected channel')
    out = pick(source, 'total revisions unknown_authors')
    out.update(channel_id=channel, channels=list(CHANNELS), display_limit=100 if channel == CHANNELS[0] else 50,
               channel_url=f'https://discord.com/channels/1570490131503251679/{channel}', next_cursor=None)
    out['health'] = pick(source.get('health'), 'status updated_at fresh')
    out['channel_summaries'] = [pick(v, 'id count status fresh') for v in records(source.get('channel_summaries'), 2) if v.get('id') in CHANNELS]
    out['market_timer'] = pick(source.get('market_timer'), 'interval_end planned_direction planned_total_usd display_only')
    btc = source.get('btc_market') or {}
    out['btc_market'] = pick(btc, 'status ticker close_time published_at')
    out['btc_market']['quotes'] = pick(btc.get('quotes'), 'yes_bid yes_ask no_bid no_ask')
    out['messages'] = []
    for message in records(source.get('messages'), out['display_limit']):
        item = pick(message, 'message_id author display_author author_inferred source_timestamp text older_revisions_omitted')
        item['observations'] = [dict(pick(v, 'kind recorded_at'), body=pick(v.get('body'), 'text')) for v in records(message.get('observations'), 20)]
        item['trade_signal'] = pick(message.get('trade_signal'), 'action direction amount_usd target_total_usd limit_sell_cents limit_buy_cents buy_order_type interval_end interval_ended reason reported_cashout')
        item['trade_signal']['take_profit_plan'] = pick((message.get('trade_signal') or {}).get('take_profit_plan'), 'limit_price_cents')
        item['trade_execution'] = pick(message.get('trade_execution'), 'status') or None
        # Signed attachment URLs and archived metadata are not needed to display text.
        out['messages'].append(item)
    execution = source.get('execution') or {}
    e = pick(execution, 'connected status updated_at interval_owner')
    e['channels'] = [c for c in execution.get('channels', []) if c in CHANNELS]
    pnl = execution.get('pnl') or {}
    e['pnl'] = pick(pnl, 'day updated_at complete daily_realized_net all_time_realized_net')
    e['pnl']['markets'] = market_totals(pnl.get('trades'), execution.get('entry_totals'))
    e['pnl']['trades'] = [pick(t, 'ticker direction realized_net open_contracts status') for t in records(pnl.get('trades'), 100)]
    e['daily_loss_guard'] = pick(execution.get('daily_loss_guard'), 'day enabled latched accounting_ready reset_at')
    e['orders'] = []
    # The browser only needs a stable local key to join P&L; don't publish exchange IDs.
    e['pnl']['order_fees'], e['pnl']['order_pnl'] = {}, {}
    for order in records(execution.get('orders'), 100):
        row = pick(order, 'channel signal_id ticker action side filled count limit_cents status avg_price fees acknowledged_at reconciled_at created_at submitted_at')
        key = str(order.get('id', ''))
        row['id'] = hashlib.sha256(key.encode()).hexdigest()[:24]
        for field in ('order_fees', 'order_pnl'):
            mapping = pnl.get(field) or {}
            value = pick(mapping, key).get(key)
            if value is not None:
                e['pnl'][field][row['id']] = value
        e['orders'].append(row)
    out['execution'] = e
    return out


def display_snapshot(bundle, channel, search='', now=None):
    """Re-evaluate freshness after transfer; never refresh source timestamps."""
    now = time.time() if now is None else now
    data = copy.deepcopy(bundle['channels'][channel])
    def fresh(timestamp, age):
        return type(timestamp) in (int, float) and 0 <= now - timestamp < age
    data['updated_at'] = bundle['updated_at']
    data['stale'] = not fresh(bundle['updated_at'], 20)
    data['health']['fresh'] = not data['stale'] and fresh(data['health'].get('updated_at'), 15)
    for summary in data['channel_summaries']:
        health = bundle['channels'].get(summary['id'], {}).get('health', {})
        summary['fresh'] = not data['stale'] and fresh(health.get('updated_at'), 15)
    e = data['execution']
    e['connected'] = bool(e.get('connected')) and not data['stale'] and fresh(e.get('updated_at'), 15)
    btc = data['btc_market']
    try:
        unexpired = datetime.fromisoformat(btc.get('close_time', '').replace('Z', '+00:00')).timestamp() > now
    except (ValueError, TypeError):
        unexpired = False
    if data['stale'] or not unexpired or not fresh(btc.get('published_at'), 2):
        btc.update(status='stale', quotes={})
    query = search.casefold()
    if query:
        data['messages'] = [m for m in data['messages'] if query in (str(m.get('text') or '') + ' ' + str(m.get('display_author') or m.get('author') or '')).casefold()]
    return data
