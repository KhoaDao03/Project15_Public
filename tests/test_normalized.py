import asyncio
import copy
import json
import math
import tempfile
import time
import unittest
from datetime import datetime, date
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from public_performance import normalize_trade, build_performance, build_intraday
from public_site import create_app, ASSETS


def trade(size=10, pnl=2, **changes):
    now = time.time() - 5
    row = dict(bought=size, quantity=0, net_pnl=pnl, fees=.2, entry=.5,
               exit=.72, status='CLOSED', opened=now-100, exit_timestamp=now,
               timestamp=now, market='fixture', side='yes')
    row.update(changes)
    return row


class NormalizationTests(unittest.TestCase):
    def test_closed_trade_uses_bought_not_remaining_and_preserves_source(self):
        row = trade()
        before = copy.deepcopy(row)
        result = normalize_trade(row)
        self.assertEqual(result['bought'], 1)
        self.assertEqual(result['quantity'], 0)
        self.assertAlmostEqual(result['net_pnl'], .2)
        self.assertAlmostEqual(result['fees'], .02)
        self.assertEqual(result['entry'], .5)
        self.assertEqual(result['exit_timestamp'], row['exit_timestamp'])
        self.assertEqual(row, before)

    def test_invalid_sizes_do_not_fall_back_to_quantity_or_zero(self):
        for size in (None, 0, -1, True, '10', math.nan, math.inf):
            with self.subTest(size=size):
                result = normalize_trade(trade(size=size, quantity=20))
                self.assertIsNone(result['net_pnl'])
                self.assertIsNone(result['fees'])
                self.assertIsNone(result['bought'])
                self.assertFalse(result['normalization_available'])

    def test_bad_pnl_and_overflow_stay_unavailable(self):
        for value in (None, True, '2', math.nan, math.inf):
            self.assertIsNone(normalize_trade(trade(pnl=value))['net_pnl'])
        self.assertIsNone(normalize_trade(trade(size=1e-300, pnl=1e300))['net_pnl'])

    def test_partial_open_position_is_scaled_but_not_realized(self):
        row = normalize_trade(trade(size=10, quantity=4, status='OPEN', pnl=1))
        self.assertEqual(row['quantity'], .4)
        result = build_performance({'BTC':dict(rows=[row],updated_at=time.time())}, ['BTC'], time.time())
        self.assertEqual(result['all_time']['BTC']['realized_pnl'], 0)
        self.assertEqual(result['all_time']['BTC']['open_positions'], 1)

    def test_per_trade_sum_not_weighted_average_and_dst_closure(self):
        zone = ZoneInfo('America/New_York')
        one = datetime(2026, 11, 1, 1, 30, tzinfo=zone, fold=0).timestamp()
        two = datetime(2026, 11, 1, 1, 30, tzinfo=zone, fold=1).timestamp()
        now = datetime(2026, 11, 1, 20, tzinfo=zone).timestamp()
        rows = [normalize_trade(trade(10, 2, opened=one-60, exit_timestamp=one)),
                normalize_trade(trade(100, -10, opened=two-60, exit_timestamp=two))]
        histories = {'BTC':dict(rows=rows,updated_at=now)}
        result = build_performance(histories, ['BTC'], now)
        stats = result['all_time']['BTC']
        self.assertAlmostEqual(stats['realized_pnl'], .1)
        self.assertEqual(stats['completed_contracts'], 2)
        self.assertEqual(stats['wins'], 1)
        self.assertEqual(stats['losses'], 1)
        self.assertEqual(stats['current_streak'], -1)
        self.assertAlmostEqual(result['days'][-1]['assets']['BTC']['realized_pnl'], .1)
        chart = build_intraday(histories, ['BTC'], '2026-11-01', now)
        self.assertEqual(chart['end'] - chart['start'], 25*3600)
        self.assertAlmostEqual(chart['total'][-1]['pnl'], .1)

    def test_unknown_size_propagates_to_aggregate_and_chart(self):
        now = time.time()
        histories = {'BTC':dict(rows=[normalize_trade(trade(size=None))],updated_at=now)}
        result = build_performance(histories, ['BTC'], now)
        self.assertIsNone(result['all_time']['BTC']['realized_pnl'])
        self.assertEqual(result['all_time']['BTC']['unknown_pnl'], 1)
        chart = build_intraday(histories, ['BTC'], result['today'], now)
        self.assertIsNone(chart['total'][-1]['pnl'])


class ApiModeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.now = time.time()
        for asset in ASSETS:
            rows = [trade(10, 2), trade(100, -10)] if asset == 'BTC' else []
            (self.directory / f'history-{asset}.json').write_text(json.dumps(dict(
                rows=rows, total=len(rows), updated_at=self.now)))
        (self.directory/'view.json').write_text(json.dumps(dict(updated_at=self.now,
            realized_pnl=1000,totals_complete=True,assets=[dict(asset='BTC',
            realized_pnl=1000,open_positions=2,trades=[trade()])])) )
        self.before = {p.name:p.read_bytes() for p in self.directory.iterdir()}
        self.app = create_app(self.directory)

    def endpoint(self, path):
        return next(r.endpoint for r in self.app.routes if r.path == path)

    async def test_actual_requests_and_idle_do_no_normalization(self):
        with patch('public_site.normalize_trade', wraps=normalize_trade) as scale:
            self.endpoint('/api/view')()
            await self.endpoint('/api/performance')()
            await self.endpoint('/api/history/{asset}')('BTC',0,25,None,'closed',False)
            day = datetime.now(ZoneInfo('America/New_York')).date()
            await self.endpoint('/api/intraday')(day)
            await asyncio.sleep(.05)
            self.assertEqual(scale.call_count, 0)

    async def test_cache_modes_coalesce_without_mutating_history_or_disk(self):
        fn = self.endpoint('/api/performance')
        with patch('public_site.build_performance', wraps=build_performance) as build:
            a, b = await asyncio.gather(fn(True), fn(True))
            self.assertIs(a, b)
            self.assertEqual(build.call_count, 1)
            actual = await fn(False)
            self.assertEqual(build.call_count, 2)
        self.assertAlmostEqual(a['all_time']['BTC']['realized_pnl'], .1)
        self.assertEqual(actual['all_time']['BTC']['realized_pnl'], -8)
        history = self.endpoint('/api/history/{asset}')
        scaled = await history('BTC',0,1,None,'closed',True)
        raw = await history('BTC',0,1,None,'closed',False)
        self.assertEqual(scaled['rows'][0]['bought'], 1)
        self.assertEqual(raw['rows'][0]['bought'], 10)
        self.assertEqual(scaled['total'], 2)
        self.assertEqual(self.before,{p.name:p.read_bytes() for p in self.directory.iterdir()})

    async def test_snapshot_does_not_leak_actual_sized_totals(self):
        normalized = self.endpoint('/api/view')(True)
        actual = self.endpoint('/api/view')(False)
        self.assertIsNone(normalized['realized_pnl'])
        self.assertIsNone(normalized['assets'][0]['realized_pnl'])
        self.assertEqual(normalized['assets'][0]['open_positions'], 2)
        self.assertEqual(normalized['assets'][0]['trades'][0]['bought'], 1)
        self.assertEqual(actual['assets'][0]['realized_pnl'], 1000)

    async def test_new_source_data_appears_after_cache_expiry(self):
        fn = self.endpoint('/api/performance')
        first = await fn(True)
        path = self.directory / 'history-BTC.json'
        data = json.loads(path.read_text())
        data['rows'].append(trade(20, 10))
        data['total'] += 1
        path.write_text(json.dumps(data))
        self.assertIs(await fn(True), first)
        # Advance the request clock without a timer or production file writes.
        with patch('public_site.monotonic', return_value=time.monotonic()+3):
            refreshed = await fn(True)
        self.assertAlmostEqual(refreshed['all_time']['BTC']['realized_pnl'], .6)
        self.assertAlmostEqual(first['all_time']['BTC']['realized_pnl'], .1)

    async def test_intraday_caches_are_separate(self):
        day = datetime.now(ZoneInfo('America/New_York')).date()
        fn = self.endpoint('/api/intraday')
        normalized = await fn(day, True)
        actual = await fn(day, False)
        self.assertAlmostEqual(normalized['total'][-1]['pnl'], .1)
        self.assertEqual(actual['total'][-1]['pnl'], -8)

    async def test_new_pages_are_labeled_without_loading_history(self):
        with patch('public_site.normalize_trade', wraps=normalize_trade) as scale:
            for path in ('/','/performance','/normalized','/normalized/performance'):
                html = self.endpoint(path)().body.decode()
                self.assertIn('data-results-mode="normalized"',html)
                self.assertIn('Paper Trading with 1 contract',html)
                self.assertIn('/results-mode.js',html)
            self.assertEqual(scale.call_count,0)


if __name__ == '__main__':
    unittest.main()
