import type { AnalyzeRequest, AnalyzeResponse, MarketContextResponse, PriceHistoryResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export const analyze = (req: AnalyzeRequest) =>
  post<AnalyzeResponse>("/analyze", req);

export const fetchMarketContext = (location?: string) =>
  get<MarketContextResponse>("/market", location ? { location } : undefined);

export const fetchPriceHistory = (commodity: string, period = "6mo") =>
  get<PriceHistoryResponse>(`/history/${commodity}`, { period });

export interface NearbyElevator {
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance_miles: number;
}

export interface NearbyResponse {
  address: string;
  radius_miles: number;
  count: number;
  elevators: NearbyElevator[];
}

export const fetchNearbyElevators = (address: string, radius = 50) =>
  get<NearbyResponse>("/nearby", { address, radius: String(radius) });

export const MOCK_RESPONSE: AnalyzeResponse = {
  commodity: "soybeans",
  quantity_bu: 10000,
  best_buyer: "Heartland Grain Co.",
  buyers: [
    {
      name: "Heartland Grain Co.",
      bid_per_bu: 11.25,
      distance_miles: 18.4,
      gross_revenue: 112500,
      transport_cost: 1840,
      transport_cost_per_bu: 0.184,
      net_revenue: 110660,
      net_per_bu: 11.066,
      rank: 1,
      vs_best_net: 0,
      transport_arbitrage_value: -920,
    },
    {
      name: "Prairie Elevator",
      bid_per_bu: 11.1,
      distance_miles: 7.2,
      gross_revenue: 111000,
      transport_cost: 720,
      transport_cost_per_bu: 0.072,
      net_revenue: 110280,
      net_per_bu: 11.028,
      rank: 2,
      vs_best_net: -380,
      transport_arbitrage_value: 0,
    },
    {
      name: "County Co-op",
      bid_per_bu: 11.05,
      distance_miles: 4.1,
      gross_revenue: 110500,
      transport_cost: 410,
      transport_cost_per_bu: 0.041,
      net_revenue: 110090,
      net_per_bu: 11.009,
      rank: 3,
      vs_best_net: -570,
      transport_arbitrage_value: 310,
    },
  ],
  scenarios: [
    {
      action: "sell_now",
      label: "Sell Now — Heartland Grain Co.",
      buyer_name: "Heartland Grain Co.",
      expected_value: 110660,
      ev_per_bu: 11.066,
      cost_total: 1840,
      risk_exposure: 0,
      low: 110660,
      high: 110660,
      confidence: "high",
      seasonal_trend_pct: 0,
      recommended: false,
    },
    {
      action: "sell_now",
      label: "Sell Now — Prairie Elevator",
      buyer_name: "Prairie Elevator",
      expected_value: 110280,
      ev_per_bu: 11.028,
      cost_total: 720,
      risk_exposure: 0,
      low: 110280,
      high: 110280,
      confidence: "high",
      seasonal_trend_pct: 0,
      recommended: false,
    },
    {
      action: "sell_now",
      label: "Sell Now — County Co-op",
      buyer_name: "County Co-op",
      expected_value: 110090,
      ev_per_bu: 11.009,
      cost_total: 410,
      risk_exposure: 0,
      low: 110090,
      high: 110090,
      confidence: "high",
      seasonal_trend_pct: 0,
      recommended: false,
    },
    {
      action: "wait_1_week",
      label: "Wait 1 Week",
      buyer_name: null,
      expected_value: 111200,
      ev_per_bu: 11.12,
      cost_total: 420,
      risk_exposure: 5800,
      low: 107400,
      high: 115000,
      confidence: "medium",
      seasonal_trend_pct: 0.8,
      recommended: true,
    },
    {
      action: "wait_1_month",
      label: "Wait 1 Month",
      buyer_name: null,
      expected_value: 113200,
      ev_per_bu: 11.32,
      cost_total: 1680,
      risk_exposure: 15600,
      low: 104000,
      high: 122000,
      confidence: "medium",
      seasonal_trend_pct: 2.3,
      recommended: false,
    },
    {
      action: "store_hedge",
      label: "Store + Hedge (3mo)",
      buyer_name: null,
      expected_value: 109800,
      ev_per_bu: 10.98,
      cost_total: 2200,
      risk_exposure: 2100,
      low: 107700,
      high: 111900,
      confidence: "high",
      seasonal_trend_pct: 2.3,
      recommended: false,
    },
  ],
  fair_price: {
    p_fair: 11.42,
    p_fair_low: 10.98,
    p_fair_high: 11.86,
    p_futures: 11.18,
    basis_regional: -0.12,
    basis_local: 0.07,
    mispricing_pct: 0.015,
    revenue_impact: 1700,
    drivers: {
      transport_impact: -0.063,
      seasonality_impact: 0.041,
      basis_gap: 0.19,
      weather_impact: 0.024,
    },
  },
  market_signals: {
    futures_price: 11.18,
    futures_ticker: "ZS=F",
    futures_momentum: 0.0031,
    futures_volatility: 0.182,
    diesel_per_gal: 3.82,
    tbill_rate_pct: 5.28,
    basis_regional: -0.12,
    inventory_signal: -0.04,
    mpi_score: 0.31,
    mpi: "bullish",
    weather_summary:
      "Dry conditions expected in central IL over the next 7 days, supporting easing of harvest pressure.",
    weather_risk: "low",
    weather_disruption_index: 0.08,
  },
  storage_analysis: {
    v_storage_per_bu: 0.24,
    total_storage_value: 2400,
    storage_cost_total: 1200,
    opportunity_cost: 420,
    recommend_delay: true,
    storage_type: "on_farm",
  },
  llm_explanation:
    "Market conditions mildly favor waiting. Soybean futures are trending upward (+0.31% weekly) and seasonal patterns suggest a 0.8–2.3% gain over the next 1–4 weeks. Your best immediate option is Heartland Grain Co. at $11.07/bu net — slightly offset by the longer haul. If you can absorb short-term price risk, waiting one week has the highest expected value at $111,200. The T-bill rate at 5.28% sets a meaningful hurdle for storage: you need prices to rise ~$0.048/bu/month just to break even on capital cost alone. High urgency? Sell to Heartland now.",
};

export const MOCK_MARKET: MarketContextResponse = {
  quotes: [
    { commodity: "corn", ticker: "ZC=F", price: 4.52, momentum_weekly_pct: -0.0012, volatility_ann: 0.21 },
    { commodity: "soybeans", ticker: "ZS=F", price: 11.18, momentum_weekly_pct: 0.0031, volatility_ann: 0.182 },
    { commodity: "wheat", ticker: "ZW=F", price: 5.84, momentum_weekly_pct: 0.0008, volatility_ann: 0.24 },
  ],
  diesel_per_gal: 3.82,
  tbill_rate_pct: 5.28,
  weather_summary: "Dry conditions in central IL. No disruption expected this week.",
  weather_risk: "low",
  headlines: [
    { source: "DTN", title: "USDA raises soybean export forecast on strong Chinese demand", link: "#", published: "2026-05-09" },
    { source: "Reuters", title: "Corn futures fall on favorable planting weather outlook", link: "#", published: "2026-05-09" },
    { source: "AgWeb", title: "Wheat prices tick up on dry Plains forecast", link: "#", published: "2026-05-08" },
  ],
};
