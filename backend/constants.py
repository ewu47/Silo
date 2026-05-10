# ── Transport ──────────────────────────────────────────────────────────────────
# C_transport = d × (TRANSPORT_FIXED + TRANSPORT_FUEL_SCALE × (diesel / DIESEL_REFERENCE))
# At reference diesel ($3.80/gal): effective rate ≈ $0.042/bu/mile (industry benchmark)
TRANSPORT_FIXED_PER_BU_MILE = 0.030      # $/bu/mile (driver, truck, overhead)
TRANSPORT_FUEL_SCALE = 0.012             # $/bu/mile fuel component at reference diesel
DIESEL_REFERENCE = 3.80                  # reference diesel $/gal

# ── Storage ────────────────────────────────────────────────────────────────────
STORAGE_COST_ON_FARM = 0.015             # $/bu/month (electricity, shrinkage, labor)
STORAGE_COST_COMMERCIAL = 0.040          # $/bu/month (elevator handling + storage)
INTEREST_RATE_FALLBACK = 0.04            # annual, used if FRED down

# ── Hedging ────────────────────────────────────────────────────────────────────
HEDGE_COMMISSION_PER_BU = 0.015          # round-trip brokerage $/bu

# ── Commodities ────────────────────────────────────────────────────────────────
COMMODITY_TICKERS = {
    "soybeans": "ZS=F",
    "corn":     "ZC=F",
    "wheat":    "ZW=F",
}

# Typical historical basis ($/bu) — used when USDA unavailable
# Basis = cash - futures; negative = cash below futures (normal carry market)
FALLBACK_BASIS = {
    "soybeans": -0.35,
    "corn":     -0.25,
    "wheat":    -0.45,
}

# Basis std dev ($/bu) — historical variability
BASIS_STD = {
    "soybeans": 0.18,
    "corn":     0.15,
    "wheat":    0.22,
}

# ── FRED ───────────────────────────────────────────────────────────────────────
FRED_DIESEL_SERIES = "GASDESW"
FRED_TBILL_SERIES  = "DTB3"

# ── API bases ──────────────────────────────────────────────────────────────────
USDA_BASE = "https://marsapi.ams.usda.gov/services/v1.2"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
NWS_BASE  = "https://api.weather.gov"

# ── Fallbacks ──────────────────────────────────────────────────────────────────
FALLBACK_FUTURES_CENTS = {
    "soybeans": 1180.0,
    "corn":     460.0,
    "wheat":    560.0,
}
FALLBACK_DIESEL     = 5.40   # $/gal
FALLBACK_TBILL_RATE = 4.0    # %

# ── MPI weights (must sum to 1.0) ──────────────────────────────────────────────
MPI_WEIGHTS = {
    "futures_momentum":   0.30,   # X1: ΔP_futures slope
    "inventory_imbalance": 0.25,  # X2: supply pressure signal
    "basis_signal":        0.20,  # X4: basis widening/contracting
    "weather_disruption":  0.15,  # X5: weather-induced supply shock
    "export_demand":       0.10,  # X3: export demand shift proxy
}

# ── Scenario windows ───────────────────────────────────────────────────────────
SCENARIO_WINDOWS = {
    "wait_1_week":  1,    # weeks
    "wait_1_month": 4,    # weeks
}
