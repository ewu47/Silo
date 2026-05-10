def calc_mpi(futures_price: float, tbill_rate_pct: float, seasonal_2w: float) -> str:
    """
    Market Pressure Index — simple heuristic combining rate environment and seasonal trend.
    Returns "bullish", "neutral", or "bearish".
    """
    score = 0

    # Seasonal trend signal
    if seasonal_2w > 0.01:
        score += 1
    elif seasonal_2w < -0.01:
        score -= 1

    # Rate environment: low rates favor holding
    if tbill_rate_pct < 3.0:
        score += 1
    elif tbill_rate_pct > 5.0:
        score -= 1

    if score >= 1:
        return "bullish"
    if score <= -1:
        return "bearish"
    return "neutral"
