import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import paper_snapshot as paper
import bar_strategy as bar
import stock_data_server as data


class PaperSnapshotTests(unittest.TestCase):
    def tearDown(self):
        paper.daily_signals.cache_clear()

    def test_calendars_exclude_lunch_holidays_and_us_early_close(self):
        for market, zone, value, expected in [
            ('a', 'Asia/Shanghai', '2026-11-04T10:00', True),
            ('a', 'Asia/Shanghai', '2026-11-04T12:00', False),
            ('a', 'Asia/Shanghai', '2026-11-07T10:00', False),
            ('hk', 'Asia/Hong_Kong', '2026-11-04T10:00', True),
            ('hk', 'Asia/Hong_Kong', '2026-11-04T12:30', False),
            ('us', 'America/New_York', '2026-11-27T12:00', True),
            ('us', 'America/New_York', '2026-11-27T14:00', False),
        ]:
            with self.subTest(market=market, value=value):
                self.assertEqual(paper.market_session(market, datetime.fromisoformat(value).replace(tzinfo=ZoneInfo(zone))), expected)

    def test_signals_exclude_current_day_and_cache_by_day_and_pool(self):
        dates = pd.bdate_range('2025-01-02', '2026-11-04')
        close = np.arange(len(dates)) * .1 + 100
        frame = pd.DataFrame({'date': dates, 'open': close*.999, 'high': close*1.01, 'low': close*.99, 'close': close, 'volume': 10000})
        with patch.object(bar, 'history', return_value=frame) as history:
            result = paper.daily_signals('a', 'momentum', ('600001',), '2026-11-04')
            self.assertEqual(result['asOf'], '2026-11-03')
            self.assertEqual(result['rows'][0]['symbol'], '600001')
            paper.daily_signals('a', 'momentum', ('600001',), '2026-11-04')
            self.assertEqual(history.call_count, 1)
            self.assertEqual(history.call_args.args[3], '2026-11-03')

    def test_frozen_symbols_are_quoted_without_reading_the_saved_portfolio(self):
        with patch.object(data, 'portfolio_response', side_effect=AssertionError('不得重新读取持仓')), patch.object(data, 'portfolio_quote_batch', return_value={'600001': {'symbol':'600001','price':10,'as_of':'2026-11-04T10:00:00+08:00'}}):
            result = data.portfolio_quotes_response('a', [{'symbol':'600001'}])
            self.assertEqual(result['quotes'][0]['symbol'], '600001')

    def test_snapshot_validates_models_and_keeps_quotes_when_signal_provider_fails(self):
        menu = {'momentum': {'name':'日线动量'}, 'xgboost@test': {'checkpoint_id':'test','validation':{'passed':False}}}
        with patch.object(bar, 'options', return_value={'strategies':menu}), patch.object(data,'portfolio_quotes_response',return_value={'quotes':[]}), patch.object(paper,'market_session',return_value=True), patch.object(paper,'daily_signals',side_effect=ValueError('历史缺失')):
            result = paper.paper_snapshot({'market':'a','strategy':'momentum','symbols':['600001']})
            self.assertIn('历史缺失', result['signals']['error'])
            self.assertEqual(result['quotes'], [])
            with self.assertRaises(ValueError):
                paper.paper_snapshot({'market':'a','strategy':'xgboost@test','symbols':['600001']})
            with self.assertRaises(ValueError):
                paper.paper_snapshot({'market':'a','strategy':'momentum','symbols':[]})


if __name__ == '__main__':
    unittest.main()
