export type Commodity = "soybeans" | "corn" | "wheat";
export type Urgency = "low" | "medium" | "high";
export type Confidence = "high" | "medium" | "low";
export type MPI = "bullish" | "neutral" | "bearish";
export type WeatherRisk = "low" | "medium" | "high";
export type StorageType = "on_farm" | "commercial";

// ── Request ───────────────────────────────────────────────────────────────────

export interface Buyer {
  name: string;
  bid_per_bu: number;
  address: string;
}

export interface AnalyzeRequest {
  commodity: Commodity;
  quantity_bu: number;
  farm_address: string;
  buyers: Buyer[];
  has_storage: boolean;
  storage_type: StorageType;
  storage_months?: number;
  urgency: Urgency;
}

// ── Response ──────────────────────────────────────────────────────────────────

export interface BuyerResult {
  name: string;
  bid_per_bu: number;
  distance_miles: number;
  gross_revenue: number;
  transport_cost: number;
  transport_cost_per_bu: number;
  net_revenue: number;
  net_per_bu: number;
  rank: number;
  vs_best_net: number;
  transport_arbitrage_value: number;
}

export interface PriceDrivers {
  transport_impact: number;
  seasonality_impact: number;
  basis_gap: number;
  weather_impact: number;
}

export interface FairPriceAnalysis {
  p_fair: number;
  p_fair_low: number;
  p_fair_high: number;
  p_futures: number;
  basis_regional: number;
  basis_local: number;
  mispricing_pct: number;
  revenue_impact: number;
  drivers: PriceDrivers;
}

export interface StorageAnalysis {
  v_storage_per_bu: number;
  total_storage_value: number;
  storage_cost_total: number;
  opportunity_cost: number;
  recommend_delay: boolean;
  storage_type: StorageType;
}

export interface ScenarioResult {
  action: string;
  label: string;
  buyer_name: string | null;
  expected_value: number;
  ev_per_bu: number;
  cost_total: number;
  risk_exposure: number;
  low: number;
  high: number;
  confidence: Confidence;
  seasonal_trend_pct: number;
  recommended: boolean;
}

export interface MarketSignals {
  futures_price: number;
  futures_ticker: string;
  futures_momentum: number;
  futures_volatility: number;
  diesel_per_gal: number;
  tbill_rate_pct: number;
  basis_regional: number;
  inventory_signal: number;
  mpi_score: number;
  mpi: MPI;
  weather_summary?: string;
  weather_risk: WeatherRisk;
  weather_disruption_index: number;
}

export interface AnalyzeResponse {
  commodity: string;
  quantity_bu: number;
  best_buyer: string;
  buyers: BuyerResult[];
  scenarios: ScenarioResult[];
  fair_price: FairPriceAnalysis;
  market_signals: MarketSignals;
  storage_analysis: StorageAnalysis | null;
  llm_explanation: string;
}

// ── Price history (GET /history/:commodity) ───────────────────────────────────

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface PriceHistoryResponse {
  commodity: string;
  ticker: string;
  period: string;
  bars: PriceBar[];
  sma_20: (number | null)[];
  sma_50: (number | null)[];
  current_price: number;
  momentum_weekly_pct: number;
  volatility_ann: number;
}

// ── Market context (GET /market) ──────────────────────────────────────────────

export interface FuturesQuote {
  commodity: string;
  ticker: string;
  price: number;
  momentum_weekly_pct: number;
  volatility_ann: number;
}

export interface NewsHeadline {
  source: string;
  title: string;
  link: string;
  published: string;
}

export interface MarketContextResponse {
  quotes: FuturesQuote[];
  diesel_per_gal: number;
  tbill_rate_pct: number;
  weather_summary?: string;
  weather_risk: WeatherRisk;
  headlines: NewsHeadline[];
}
