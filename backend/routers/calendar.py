"""
Seasonal calendar endpoint — static USDA/CME well-known price patterns by month.
No auth required.
"""

from datetime import date
from fastapi import APIRouter, HTTPException
from backend.models import CalendarMonth, CalendarResponse

router = APIRouter(prefix="/calendar", tags=["calendar"])

# avg_change_pct: average monthly price change (%) based on 20-yr USDA/CME patterns
# volatility_pct: typical std dev of that monthly change
_SEASONAL_DATA: dict[str, list[dict]] = {
    "corn": [
        {"month": 1,  "avg_change_pct":  0.8, "volatility_pct": 2.1},  # Jan: export demand lift
        {"month": 2,  "avg_change_pct":  0.5, "volatility_pct": 2.0},  # Feb: neutral
        {"month": 3,  "avg_change_pct":  1.2, "volatility_pct": 2.4},  # Mar: planting intention rally
        {"month": 4,  "avg_change_pct":  1.5, "volatility_pct": 2.8},  # Apr: weather premium builds
        {"month": 5,  "avg_change_pct":  1.3, "volatility_pct": 3.1},  # May: pre-planting peak
        {"month": 6,  "avg_change_pct": -0.4, "volatility_pct": 3.5},  # Jun: crop progress pressure
        {"month": 7,  "avg_change_pct": -0.8, "volatility_pct": 4.0},  # Jul: pollination risk (volatile)
        {"month": 8,  "avg_change_pct": -1.5, "volatility_pct": 3.8},  # Aug: harvest approach
        {"month": 9,  "avg_change_pct": -2.1, "volatility_pct": 3.2},  # Sep: harvest low
        {"month": 10, "avg_change_pct": -0.5, "volatility_pct": 2.5},  # Oct: harvest pressure eases
        {"month": 11, "avg_change_pct":  0.6, "volatility_pct": 2.2},  # Nov: export demand returns
        {"month": 12, "avg_change_pct":  0.9, "volatility_pct": 2.0},  # Dec: year-end positioning
    ],
    "soybeans": [
        {"month": 1,  "avg_change_pct":  1.2, "volatility_pct": 2.5},  # Jan: SA crop watch
        {"month": 2,  "avg_change_pct":  0.8, "volatility_pct": 2.8},  # Feb: SA harvest pressure
        {"month": 3,  "avg_change_pct": -0.3, "volatility_pct": 2.6},  # Mar: SA harvest + US planting
        {"month": 4,  "avg_change_pct":  0.9, "volatility_pct": 2.4},  # Apr: planting intentions
        {"month": 5,  "avg_change_pct":  1.4, "volatility_pct": 2.9},  # May: China demand peak
        {"month": 6,  "avg_change_pct":  0.7, "volatility_pct": 3.0},  # Jun: planting progress
        {"month": 7,  "avg_change_pct":  1.8, "volatility_pct": 4.5},  # Jul: drought scare premium
        {"month": 8,  "avg_change_pct": -1.2, "volatility_pct": 3.9},  # Aug: pod-fill, harvest nears
        {"month": 9,  "avg_change_pct": -2.3, "volatility_pct": 3.4},  # Sep: harvest low
        {"month": 10, "avg_change_pct": -0.8, "volatility_pct": 2.8},  # Oct: harvest pressure
        {"month": 11, "avg_change_pct":  0.4, "volatility_pct": 2.5},  # Nov: export lift
        {"month": 12, "avg_change_pct":  0.6, "volatility_pct": 2.3},  # Dec: neutral
    ],
    "wheat": [
        {"month": 1,  "avg_change_pct": -0.2, "volatility_pct": 2.8},  # Jan: winter dormancy
        {"month": 2,  "avg_change_pct":  0.3, "volatility_pct": 2.6},  # Feb: freeze risk watch
        {"month": 3,  "avg_change_pct":  1.1, "volatility_pct": 3.0},  # Mar: spring green-up rally
        {"month": 4,  "avg_change_pct":  1.4, "volatility_pct": 3.2},  # Apr: condition reports
        {"month": 5,  "avg_change_pct":  0.6, "volatility_pct": 3.5},  # May: pre-harvest
        {"month": 6,  "avg_change_pct": -2.0, "volatility_pct": 3.8},  # Jun: HRW harvest low
        {"month": 7,  "avg_change_pct": -1.5, "volatility_pct": 3.0},  # Jul: SRW harvest low
        {"month": 8,  "avg_change_pct":  0.2, "volatility_pct": 2.5},  # Aug: post-harvest stabilize
        {"month": 9,  "avg_change_pct":  0.5, "volatility_pct": 2.4},  # Sep: fall demand
        {"month": 10, "avg_change_pct":  0.8, "volatility_pct": 2.3},  # Oct: export season
        {"month": 11, "avg_change_pct":  1.0, "volatility_pct": 2.5},  # Nov: export demand
        {"month": 12, "avg_change_pct":  0.7, "volatility_pct": 2.2},  # Dec: year-end
    ],
}

_MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
]

_BEST_MONTHS = {"corn": [4, 5, 3], "soybeans": [7, 5, 1], "wheat": [4, 3, 11]}
_WORST_MONTHS = {"corn": [9, 8, 7], "soybeans": [9, 8, 10], "wheat": [6, 7, 5]}


def _signal(avg: float) -> str:
    if avg >= 0.8:
        return "bullish"
    if avg <= -0.5:
        return "bearish"
    return "neutral"


@router.get("/{commodity}", response_model=CalendarResponse)
def seasonal_calendar(commodity: str):
    if commodity not in _SEASONAL_DATA:
        raise HTTPException(status_code=400, detail=f"Unknown commodity: {commodity}")

    current_month = date.today().month
    months = [
        CalendarMonth(
            month=row["month"],
            month_name=_MONTH_NAMES[row["month"]],
            avg_change_pct=row["avg_change_pct"],
            volatility_pct=row["volatility_pct"],
            signal=_signal(row["avg_change_pct"]),
        )
        for row in _SEASONAL_DATA[commodity]
    ]
    current_row = next(m for m in months if m.month == current_month)

    return CalendarResponse(
        commodity=commodity,
        months=months,
        best_months=_BEST_MONTHS[commodity],
        worst_months=_WORST_MONTHS[commodity],
        current_month=current_month,
        current_signal=current_row.signal,
    )
