import numpy as np
import yfinance as yf
from datetime import date
from backend.constants import COMMODITY_TICKERS, FALLBACK_FUTURES_CENTS


def get_futures_price(commodity: str) -> tuple[float, str]:
    """Return (price_dollars_per_bu, ticker). Fallback to static value if yfinance fails."""
    ticker = COMMODITY_TICKERS[commodity]
    try:
        h = yf.Ticker(ticker).history(period="2d", interval="1d")
        if h.empty:
            raise ValueError("empty history")
        price_cents = float(h["Close"].iloc[-1])
        return price_cents / 100, ticker
    except Exception:
        return FALLBACK_FUTURES_CENTS[commodity] / 100, ticker


def get_futures_features(commodity: str) -> dict:
    """
    Return a dict with price, momentum (weekly slope %), and volatility (annualized std).
    Uses 6 months of daily data to compute rolling statistics.
    Falls back gracefully if yfinance is unavailable.
    """
    ticker = COMMODITY_TICKERS[commodity]
    fallback_price = FALLBACK_FUTURES_CENTS[commodity] / 100

    try:
        h = yf.Ticker(ticker).history(period="6mo", interval="1d").copy()
        if h.empty or len(h) < 20:
            raise ValueError("insufficient history")

        closes = h["Close"].dropna()

        # Current price (cents → dollars)
        price = float(closes.iloc[-1]) / 100

        # Momentum: linear slope over last 20 days, normalized to % per week
        recent = closes.iloc[-20:].values / 100  # $/bu
        x = np.arange(len(recent), dtype=float)
        slope, _ = np.polyfit(x, recent, 1)
        momentum_weekly_pct = float(slope * 5 / price) if price > 0 else 0.0

        # Volatility: annualized std of daily log returns over last 20 days
        log_returns = np.diff(np.log(closes.iloc[-21:].values))
        volatility_ann = float(np.std(log_returns) * np.sqrt(252)) if len(log_returns) > 0 else 0.05

        return {
            "price": price,
            "ticker": ticker,
            "momentum_weekly_pct": round(momentum_weekly_pct, 5),
            "volatility_ann": round(volatility_ann, 4),
        }
    except Exception:
        return {
            "price": fallback_price,
            "ticker": ticker,
            "momentum_weekly_pct": 0.0,
            "volatility_ann": 0.05,
        }


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
