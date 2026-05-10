"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Loader2, RefreshCw } from "lucide-react";
import { fetchPriceHistory } from "@/lib/api";
import type { PriceHistoryResponse } from "@/lib/types";

const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y"] as const;
type Period = (typeof PERIODS)[number];

const COMMODITY_LABELS: Record<string, string> = {
  soybeans: "Soybeans",
  corn: "Corn",
  wheat: "Wheat",
};

const MOCK_HISTORY: PriceHistoryResponse = (() => {
  const bars = [];
  const sma20: (number | null)[] = [];
  const sma50: (number | null)[] = [];
  let price = 11.2;
  const start = new Date("2024-11-01");
  for (let i = 0; i < 130; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    // skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const change = (Math.random() - 0.48) * 0.12;
    price = Math.max(9.5, Math.min(13.5, price + change));
    const open = price - (Math.random() - 0.5) * 0.08;
    const high = Math.max(price, open) + Math.random() * 0.05;
    const low = Math.min(price, open) - Math.random() * 0.05;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: +open.toFixed(4),
      high: +high.toFixed(4),
      low: +low.toFixed(4),
      close: +price.toFixed(4),
      volume: Math.round(80000 + Math.random() * 40000),
    });
  }
  for (let i = 0; i < bars.length; i++) {
    if (i >= 19) {
      const avg = bars.slice(i - 19, i + 1).reduce((s, b) => s + b.close, 0) / 20;
      sma20.push(+avg.toFixed(4));
    } else sma20.push(null);
    if (i >= 49) {
      const avg = bars.slice(i - 49, i + 1).reduce((s, b) => s + b.close, 0) / 50;
      sma50.push(+avg.toFixed(4));
    } else sma50.push(null);
  }
  return {
    commodity: "soybeans",
    ticker: "ZS=F",
    period: "6mo",
    bars,
    sma_20: sma20,
    sma_50: sma50,
    current_price: price,
    momentum_weekly_pct: 0.0031,
    volatility_ann: 0.182,
  };
})();

function formatDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr);
  if (period === "1mo") return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (period === "2y") return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Thin custom tooltip so we don't need recharts default
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const bar = payload.find((p: { dataKey: string }) => p.dataKey === "close");
  const s20 = payload.find((p: { dataKey: string }) => p.dataKey === "sma20");
  const s50 = payload.find((p: { dataKey: string }) => p.dataKey === "sma50");
  const vol = payload.find((p: { dataKey: string }) => p.dataKey === "volume");
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-3 text-xs space-y-1 min-w-[140px]">
      <p className="font-semibold text-zinc-700">{label}</p>
      {bar && <p className="text-zinc-900">Close: <span className="font-semibold">${Number(bar.value).toFixed(3)}</span></p>}
      {s20?.value != null && <p className="text-blue-500">SMA 20: ${Number(s20.value).toFixed(3)}</p>}
      {s50?.value != null && <p className="text-orange-400">SMA 50: ${Number(s50.value).toFixed(3)}</p>}
      {vol?.value != null && <p className="text-zinc-400">Vol: {Number(vol.value).toLocaleString()}</p>}
    </div>
  );
}

interface Props {
  commodity: string;
  useMock?: boolean;
}

export default function MarketChart({ commodity, useMock = false }: Props) {
  const [data, setData] = useState<PriceHistoryResponse | null>(null);
  const [period, setPeriod] = useState<Period>("6mo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (useMock) { setData(MOCK_HISTORY); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPriceHistory(commodity, period);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(MOCK_HISTORY); // show mock on error so chart is never blank
    } finally {
      setLoading(false);
    }
  }, [commodity, period, useMock]);

  useEffect(() => { load(); }, [load]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  // Build flat chart rows
  const chartRows = data.bars.map((b, i) => ({
    date: formatDate(b.date, period),
    close: b.close,
    open: b.open,
    high: b.high,
    low: b.low,
    volume: b.volume ?? 0,
    sma20: data.sma_20[i],
    sma50: data.sma_50[i],
    // price range bar for candlestick-style: [low, high]
    range: [b.low, b.high] as [number, number],
    // body bar: [min(open,close), max(open,close)]
    body: [Math.min(b.open, b.close), Math.max(b.open, b.close)] as [number, number],
    bullish: b.close >= b.open,
  }));

  // Thin out x-axis labels for readability
  const tickInterval = Math.max(1, Math.floor(chartRows.length / 8));

  const priceMin = Math.min(...data.bars.map((b) => b.low)) * 0.998;
  const priceMax = Math.max(...data.bars.map((b) => b.high)) * 1.002;

  const up = data.momentum_weekly_pct >= 0;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900">
              {COMMODITY_LABELS[commodity] ?? commodity}{" "}
              <span className="text-sm font-normal text-zinc-400">({data.ticker})</span>
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xl font-semibold text-zinc-900">${data.current_price.toFixed(3)}</span>
              <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
                {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {up ? "+" : ""}{(data.momentum_weekly_pct * 100).toFixed(2)}%/wk
              </span>
              <span className="text-xs text-zinc-400">
                vol {(data.volatility_ann * 100).toFixed(1)}% ann
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-amber-500">mock data</span>}
          <button onClick={load} disabled={loading} className="text-zinc-400 hover:text-zinc-700 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-0.5 bg-zinc-100 rounded-md p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  p === period
                    ? "bg-white text-zinc-900 font-medium shadow-sm"
                    : "text-zinc-400 hover:text-zinc-700"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price chart */}
      <div className="h-56" style={{ minHeight: 224 }}>
        <ResponsiveContainer width="100%" height={224}>
          <ComposedChart data={chartRows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#f4f4f5" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval={tickInterval}
            />
            <YAxis
              domain={[priceMin, priceMax]}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickFormatter={(v) => `$${v.toFixed(2)}`}
              axisLine={false}
              tickLine={false}
              width={48}
              yAxisId="price"
            />
            <YAxis yAxisId="vol" orientation="right" hide />
            <Tooltip content={<ChartTooltip />} />
            {/* Volume bars — muted, behind price */}
            <Bar yAxisId="vol" dataKey="volume" fill="#e4e4e7" opacity={0.5} radius={[1, 1, 0, 0]} isAnimationActive={false} />
            {/* Candlestick high-low wicks: thin range bars */}
            <Bar
              yAxisId="price"
              dataKey="range"
              fill="transparent"
              stroke="#a1a1aa"
              strokeWidth={1}
              isAnimationActive={false}
              // recharts doesn't have native candlestick; we use a range bar trick
              // The bar renders [low, high] as a thin line
              minPointSize={1}
            />
            {/* Close line — the main readable signal */}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="#18181b"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            {/* SMA 20 */}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="sma20"
              stroke="#3b82f6"
              strokeWidth={1}
              dot={false}
              strokeDasharray="4 2"
              connectNulls
              isAnimationActive={false}
            />
            {/* SMA 50 */}
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="sma50"
              stroke="#f97316"
              strokeWidth={1}
              dot={false}
              strokeDasharray="4 2"
              connectNulls
              isAnimationActive={false}
            />
            <ReferenceLine
              yAxisId="price"
              y={data.current_price}
              stroke="#18181b"
              strokeDasharray="3 3"
              strokeWidth={0.75}
              opacity={0.4}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              formatter={(value) =>
                value === "close" ? "Price" : value === "sma20" ? "SMA 20" : value === "sma50" ? "SMA 50" : value
              }
              iconType="plainline"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
