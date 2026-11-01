import unittest
from datetime import datetime

from public_performance import session_stats, normalize_trade


class SessionDSTTests(unittest.TestCase):
    def test_repeated_hour_uses_est_trade_in_both_modes(self):
        now = datetime.fromisoformat('2026-11-01T06:17:00+00:00').timestamp()
        rows = {
            'KXSOL15M-26NOV010115-15': [dict(status='CLOSED', net_pnl=2, bought=50)],
            'KXSOL15M-26NOV010130-30': [dict(status='CLOSED', net_pnl=-26.8154,
                                          bought=50, exit_timestamp=now-3600)],
            'KXSOL15M-26NOV010115EST-15': [dict(status='CLOSED', net_pnl=1.6317, bought=50)],
        }
        for normalized in (False, True):
            data = {k: [normalize_trade(r) if normalized else r for r in v] for k,v in rows.items()}
            result = session_stats(data, 'SOL', now, True)
            self.assertAlmostEqual(result['session_pnl'], 1.6317 / (50 if normalized else 1))
            self.assertFalse(result['session_early_exit'])
            self.assertEqual(result['session_close'], now-120)
            self.assertEqual(session_stats(data, 'SOL', now+900, True)['session_pnl'], 0)
            self.assertAlmostEqual(session_stats(data, 'SOL', now-3600)['session_pnl'], 2/(50 if normalized else 1))

    def test_real_est_early_loss_still_displays(self):
        now = datetime.fromisoformat('2026-11-01T06:17:00+00:00').timestamp()
        rows = {'KXSOL15M-26NOV010130EST-30': [dict(status='CLOSED', net_pnl=-3, exit_timestamp=now-1)]}
        result = session_stats(rows, 'SOL', now, True)
        self.assertEqual(result['session_pnl'], -3)
        self.assertTrue(result['session_early_exit'])
