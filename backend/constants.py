TRANSPORT_COST_PER_BU_MILE = 0.042  # $/bu/mile industry default

COMMODITY_TICKERS = {
    "soybeans": "ZS=F",
    "corn": "ZC=F",
    "wheat": "ZW=F",
}

FRED_DIESEL_SERIES = "GASDESW"
FRED_TBILL_SERIES = "DTB3"

USDA_BASE = "https://marsapi.ams.usda.gov/services/v1.2"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
NWS_BASE = "https://api.weather.gov"

# Storage cost components ($/bu/month)
STORAGE_COST_PER_BU_MONTH = 0.04       # commercial storage rate
INTEREST_RATE_FALLBACK = 0.04          # fallback if FRED down (annual)

# Static fallback prices (cents/bu) — used if yfinance is down
FALLBACK_FUTURES_CENTS = {
    "soybeans": 1180.0,
    "corn": 460.0,
    "wheat": 560.0,
}

FALLBACK_DIESEL = 5.40        # $/gal
FALLBACK_TBILL_RATE = 4.0     # %
