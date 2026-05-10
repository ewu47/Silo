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
FRED_DIESEL_SERIES = "GASDESW"   # US national average (fallback)
FRED_TBILL_SERIES  = "DTB3"

# PADD regional diesel series (EIA data hosted on FRED, same API key)
# PADD 1 = East Coast, PADD 2 = Midwest, PADD 3 = Gulf Coast,
# PADD 4 = Rocky Mountain, PADD 5 = West Coast
FRED_DIESEL_BY_PADD: dict[int, str] = {
    1: "GASD1SW",   # East Coast
    2: "GASD2SW",   # Midwest
    3: "GASD3SW",   # Gulf Coast
    4: "GASD4SW",   # Rocky Mountain
    5: "GASD5SW",   # West Coast
}

# State → PADD mapping (contiguous US)
STATE_TO_PADD: dict[str, int] = {
    # PADD 1 — East Coast
    "CT": 1, "DE": 1, "FL": 1, "GA": 1, "MA": 1, "MD": 1, "ME": 1,
    "NC": 1, "NH": 1, "NJ": 1, "NY": 1, "PA": 1, "RI": 1, "SC": 1,
    "VA": 1, "VT": 1, "WV": 1,
    # PADD 2 — Midwest
    "IA": 2, "IL": 2, "IN": 2, "KS": 2, "KY": 2, "MI": 2, "MN": 2,
    "MO": 2, "ND": 2, "NE": 2, "OH": 2, "OK": 2, "SD": 2, "TN": 2,
    "WI": 2,
    # PADD 3 — Gulf Coast
    "AL": 3, "AR": 3, "LA": 3, "MS": 3, "NM": 3, "TX": 3,
    # PADD 4 — Rocky Mountain
    "CO": 4, "ID": 4, "MT": 4, "UT": 4, "WY": 4,
    # PADD 5 — West Coast (+ AK/HI)
    "AK": 5, "AZ": 5, "CA": 5, "HI": 5, "NV": 5, "OR": 5, "WA": 5,
}

# State → USDA-preferred region tag for dynamic report scoring
# Used to up-score USDA Market News reports matching the farm's state
STATE_TO_USDA_REGION: dict[str, list[str]] = {
    "IL": ["illinois", " il "],
    "IA": ["iowa", " ia "],
    "IN": ["indiana", " in "],
    "OH": ["ohio", " oh "],
    "MN": ["minnesota", " mn "],
    "WI": ["wisconsin", " wi "],
    "MO": ["missouri", " mo "],
    "NE": ["nebraska", " ne "],
    "KS": ["kansas", " ks "],
    "SD": ["south dakota", " sd "],
    "ND": ["north dakota", " nd "],
    "MI": ["michigan", " mi "],
    "KY": ["kentucky", " ky "],
    "TN": ["tennessee", " tn "],
    "TX": ["texas", " tx "],
    "OK": ["oklahoma", " ok "],
    "AR": ["arkansas", " ar "],
}

# ── API bases ──────────────────────────────────────────────────────────────────
USDA_BASE = "https://marsapi.ams.usda.gov/services/v1.2"
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
NWS_BASE  = "https://api.weather.gov"

# ── Fallbacks ──────────────────────────────────────────────────────────────────
FALLBACK_FUTURES_CENTS = {
    "soybeans": 1040.0,   # ~$10.40/bu (May 2026)
    "corn":     440.0,    # ~$4.40/bu
    "wheat":    530.0,    # ~$5.30/bu
}
FALLBACK_DIESEL     = 4.00   # $/gal (Midwest diesel, May 2026)
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
