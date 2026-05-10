import yfinance as yf
import numpy as np
from datetime import date
from backend.constants import COMMODITY_TICKERS, FALLBACK_FUTURES_CENTS


def get_futures_price(commodity: str) -> tuple[float, str]:
    """Return (price_dollars_per_bu, ticker). Falls back to static value if yfinance fails."""
    ticker = COMMODITY_TICKERS[commodity]
    try:
        h = yf.Ticker(ticker).history(period="2d", interval="1d")
        if h.empty:
            raise ValueError("empty history")
        price_cents = float(h["Close"].iloc[-1])
        return price_cents / 100, ticker
    except Exception:
        return FALLBACK_FUTURES_CENTS[commodity] / 100, ticker


def get_seasonal_returns(commodity: str, start_week: int, n_weeks: int) -> tuple[float, float]:
    """
    Return (mean_compound_return, std) over n_weeks from start_week,
    derived from 5yr weekly history. Falls back to (0.0, 0.02) if unavailable.
    """
    ticker = COMMODITY_TICKERS[commodity]
    try:
        h = yf.Ticker(ticker).history(period="5y", interval="1wk").copy()
        if h.empty or len(h) < 52:
            raise ValueError("insufficient history")

        h["pct"] = h["Close"].pct_change()
        h["week"] = h.index.isocalendar().week.astype(int)

        seasonal = h.groupby("week")["pct"].mean()

        weeks = [((start_week - 1 + i) % 52) + 1 for i in range(n_weeks)]
        changes = [seasonal.get(w, 0.0) for w in weeks]
        compound = float(np.prod([1 + c for c in changes]) - 1)

        std = float(h.groupby("week")["pct"].std().reindex(weeks).mean())
        return compound, std if not np.isnan(std) else 0.02
    except Exception:
        return 0.0, 0.02
