"""Bot viewer helper: summarize confirmed Discord buy fills, read-only."""
import json
import sqlite3
from decimal import Decimal, InvalidOperation


def entry_totals(db):
    groups = {}
    try:
        rows = db.execute('SELECT body FROM discord_fills')
        for (body,) in rows:
            fill = json.loads(body)
            if fill.get('action') != 'buy' or not isinstance(fill.get('ticker'), str):
                continue
            group = groups.setdefault(fill['ticker'], dict(contracts_bought=Decimal(0), entry_cost=Decimal(0), entry_fees=Decimal(0)))
            try:
                qty, cost, fee = (Decimal(str(fill.get(k))) for k in ('qty', 'cost', 'fee'))
                if not all(v.is_finite() for v in (qty,cost,fee)) or qty <= 0 or cost < 0 or cost > qty or fee < 0:
                    raise ValueError('Invalid buy fill')
                if group['contracts_bought'] is not None:
                    group['contracts_bought'] += qty
                    group['entry_cost'] += cost
                    group['entry_fees'] += fee
            except (InvalidOperation, ValueError):
                group.update(contracts_bought=None,entry_cost=None,entry_fees=None)
    except (sqlite3.Error, ValueError, TypeError):
        return {}  # No invented entries when accounting is unavailable.
    return {ticker:{key:str(value) if value is not None else None for key,value in group.items()} for ticker,group in groups.items()}
