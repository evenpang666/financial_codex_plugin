"""Current quotes and completed daily signals for the independent paper ledger."""
from datetime import datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo


@lru_cache(maxsize=64)
def daily_signals(market, strategy, symbols, day):
    from bar_strategy import panel, scored
    from strategy_config import validate_parameters
    strategy_id, _, checkpoint = strategy.partition('@')
    parameters = validate_parameters(strategy_id)
    end = str(datetime.fromisoformat(day).date() - timedelta(days=1))
    frame = panel(market, 'daily', list(symbols), day, end, strategy_id, parameters)
    latest = frame[frame.date == frame.date.max()].copy()
    latest = scored(latest, market, 'daily', strategy_id, checkpoint, parameters,
                    str(latest.date.max().date()), require_validated=True)
    rows = [{'symbol': row.symbol, 'score': float(row.score), 'entry': bool(row.eligible)}
            for row in latest.dropna(subset=['score']).itertuples()]
    return {'rows': rows, 'asOf': str(latest.date.max().date()), 'topN': parameters['top_n']}


def market_session(market, now):
    import exchange_calendars as xc
    import pandas as pd
    day = pd.Timestamp(now.date())
    calendar = xc.get_calendar({'a': 'XSHG', 'hk': 'XHKG', 'us': 'XNYS'}[market],
                               start=day-pd.Timedelta(days=10), end=day+pd.Timedelta(days=10))
    # Includes holidays, lunch breaks and early closes in the exchange calendar.
    return bool(calendar.is_open_on_minute(pd.Timestamp(now).floor('min'), ignore_breaks=False))


def paper_snapshot(payload):
    from stock_data_server import normalize_market, normalize_symbol, portfolio_quotes_response
    from bar_strategy import options, ZONES
    market = normalize_market(payload.get('market', 'a'))
    strategy = payload.get('strategy', '')
    menu = options(market, 'daily')['strategies']
    selected = menu.get(strategy)
    if selected is None or (selected.get('checkpoint_id') and selected.get('validation', {}).get('passed') is not True):
        raise ValueError('请选择经典策略或已通过验证的日线模型。')
    symbols = payload.get('symbols')
    if not isinstance(symbols, list) or not 1 <= len(symbols) <= 100:
        raise ValueError('模拟股票池须包含 1–100 只股票。')
    symbols = tuple(dict.fromkeys(normalize_symbol(symbol, market) for symbol in symbols))
    now = datetime.now(ZoneInfo(ZONES[market]))
    result = {**portfolio_quotes_response(market, [{'symbol': symbol} for symbol in symbols]),
              'day': str(now.date()), 'strategyName': selected['name'], 'marketOpen': market_session(market, now)}
    if result['marketOpen']:
        try:
            result['signals'] = daily_signals(market, strategy, symbols, str(now.date()))
        except Exception as error:
            result['signals'] = {'error': f'日线策略信号暂不可用：{error}'}
    finished = datetime.now(ZoneInfo(ZONES[market]))
    result['marketOpen'] = finished.date() == now.date() and market_session(market, finished)
    return result
