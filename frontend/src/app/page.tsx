"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import MarketChart from "@/components/MarketChart";
import { analyze, MOCK_RESPONSE, fetchMarketContext, MOCK_MARKET } from "@/lib/api";
import type { AnalyzeResponse, MPI, Confidence, WeatherRisk, MarketContextResponse } from "@/lib/types";

// ── Schema ────────────────────────────────────────────────────────────────────

const buyerSchema = z.object({
  name: z.string().min(1, "Required"),
  bid_per_bu: z
    .string()
    .min(1, "Required")
    .transform((v) => parseFloat(v))
    .refine((v) => !isNaN(v) && v > 0, "Must be > 0"),
  address: z.string().min(5, "Full address required"),
});

const schema = z.object({
  commodity: z.enum(["soybeans", "corn", "wheat"], { message: "Select a commodity" }),
  quantity_bu: z
    .string()
    .min(1, "Required")
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v > 0, "Must be a positive number"),
  farm_address: z.string().min(5, "Full address required"),
  buyers: z.array(buyerSchema).min(1).max(5),
  has_storage: z.boolean(),
  storage_type: z.enum(["on_farm", "commercial"]),
  storage_months: z.number().min(1).max(12).optional(),
  urgency: z.enum(["low", "medium", "high"], { message: "Select urgency" }),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

// ── Small shared components ───────────────────────────────────────────────────

function MPILabel({ mpi }: { mpi: MPI }) {
  if (mpi === "bullish")
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
        <TrendingUp className="w-4 h-4" /> Bullish
      </span>
    );
  if (mpi === "bearish")
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-red-500">
        <TrendingDown className="w-4 h-4" /> Bearish
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400">
      <Minus className="w-4 h-4" /> Neutral
    </span>
  );
}

function WeatherBadge({ risk }: { risk: WeatherRisk }) {
  const map = { low: "text-emerald-600", medium: "text-amber-500", high: "text-red-500" };
  return <span className={`text-sm font-medium capitalize ${map[risk]}`}>{risk} risk</span>;
}

function ConfidenceDot({ c }: { c: Confidence }) {
  const color = { high: "bg-emerald-500", medium: "bg-amber-400", low: "bg-red-400" }[c];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {c.charAt(0).toUpperCase() + c.slice(1)}
    </span>
  );
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const fmtBu = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 3 });

const fmtPct = (n: number, showSign = false) =>
  `${showSign && n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
      {children}
    </p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
      {children}
    </p>
  );
}

function StatTile({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-400 mb-1.5">{label}</p>
      <p className="text-xl font-semibold text-zinc-900 leading-none">
        {value}
        {unit && <span className="text-sm font-normal text-zinc-400 ml-1">{unit}</span>}
      </p>
      {sub && <div className="mt-1.5">{sub}</div>}
    </div>
  );
}

// ── Market tab ────────────────────────────────────────────────────────────────

const COMMODITIES = ["corn", "soybeans", "wheat"] as const;

function MarketTab({ useMock }: { useMock: boolean }) {
  const [ctx, setCtx] = useState<MarketContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeCommodity, setActiveCommodity] = useState<string>("soybeans");

  const load = useCallback(async () => {
    if (useMock) { setCtx(MOCK_MARKET); return; }
    setLoading(true);
    try {
      const res = await fetchMarketContext();
      setCtx(res);
    } catch {
      setCtx(MOCK_MARKET);
    } finally {
      setLoading(false);
    }
  }, [useMock]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      {/* Quick quote tiles */}
      <div>
        <SectionLabel>Futures quotes</SectionLabel>
        <div className="grid grid-cols-3 gap-3">
          {(ctx ?? MOCK_MARKET).quotes.map((q) => {
            const up = q.momentum_weekly_pct >= 0;
            return (
              <button
                key={q.commodity}
                onClick={() => setActiveCommodity(q.commodity)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  activeCommodity === q.commodity
                    ? "border-zinc-900 bg-zinc-50"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <p className="text-xs text-zinc-400 capitalize mb-1">{q.commodity} ({q.ticker})</p>
                <p className="text-xl font-semibold text-zinc-900">${q.price.toFixed(3)}</p>
                <p className={`text-sm font-medium mt-1 ${up ? "text-emerald-600" : "text-red-500"}`}>
                  {up ? "▲" : "▼"} {fmtPct(Math.abs(q.momentum_weekly_pct))}/wk
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">vol {fmtPct(q.volatility_ann)} ann</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active commodity chart */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <MarketChart commodity={activeCommodity} useMock={useMock} />
      </div>

      {/* Economic indicators + news side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <SectionLabel>Economic indicators</SectionLabel>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
            {[
              { label: "Diesel", value: `$${(ctx ?? MOCK_MARKET).diesel_per_gal.toFixed(2)}/gal` },
              { label: "T-Bill (3mo)", value: `${(ctx ?? MOCK_MARKET).tbill_rate_pct.toFixed(2)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{label}</span>
                <span className="text-sm font-semibold text-zinc-900">{value}</span>
              </div>
            ))}
            <Separator className="bg-zinc-100" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-zinc-500">7-day weather</span>
                <WeatherBadge risk={(ctx ?? MOCK_MARKET).weather_risk} />
              </div>
              {(ctx ?? MOCK_MARKET).weather_summary && (
                <p className="text-sm text-zinc-500 leading-relaxed mt-1">
                  {(ctx ?? MOCK_MARKET).weather_summary}
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <SectionLabel>Ag headlines</SectionLabel>
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-50">
            {(ctx ?? MOCK_MARKET).headlines.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">No headlines available.</p>
            ) : (
              (ctx ?? MOCK_MARKET).headlines.map((h, i) => (
                <a
                  key={i}
                  href={h.link || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors group"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-800 group-hover:text-zinc-900 leading-snug">
                      {h.title}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {h.source} · {h.published ? h.published.slice(0, 16) : ""}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-zinc-300 group-hover:text-zinc-500 shrink-0 mt-0.5" />
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Analysis results panel ────────────────────────────────────────────────────

function AnalysisPanel({ result, onClear }: { result: AnalyzeResponse; onClear: () => void }) {
  const recommended = result.scenarios.find((s) => s.recommended);
  const sellNowScenarios = result.scenarios.filter((s) => s.action === "sell_now");
  const waitScenarios = result.scenarios.filter((s) => s.action !== "sell_now");

  const chartData = result.scenarios.map((s) => ({
    name: s.label.replace("Sell Now — ", "").replace(" — ", "\n"),
    Low: Math.round(s.low),
    Expected: Math.round(s.expected_value),
    High: Math.round(s.high),
  }));

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 capitalize">{result.commodity}</h2>
          <p className="text-sm text-zinc-400">{result.quantity_bu.toLocaleString()} bu</p>
        </div>
        <button onClick={onClear} className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
          Clear
        </button>
      </div>

      {/* Recommendation */}
      {recommended && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400" />
            <SectionLabel>Recommendation</SectionLabel>
          </div>
          <p className="text-base text-zinc-700 leading-relaxed mb-4">{result.llm_explanation}</p>
          <div className="flex items-center gap-3 pt-3 border-t border-zinc-100">
            <span className="text-sm text-zinc-500">Best action:</span>
            <span className="text-sm font-semibold text-zinc-900">{recommended.label}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-sm font-semibold text-zinc-900">{fmt(recommended.expected_value)}</span>
            <ConfidenceDot c={recommended.confidence} />
          </div>
        </div>
      )}

      {/* Market signal tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label={`Futures (${result.market_signals.futures_ticker})`}
          value={`$${result.market_signals.futures_price.toFixed(2)}`}
          unit="/bu"
          sub={
            <span className={`text-sm ${result.market_signals.futures_momentum >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {result.market_signals.futures_momentum >= 0 ? "▲" : "▼"}{" "}
              {fmtPct(Math.abs(result.market_signals.futures_momentum))}/wk
            </span>
          }
        />
        <StatTile label="Diesel" value={`$${result.market_signals.diesel_per_gal.toFixed(2)}`} unit="/gal" />
        <StatTile label="T-Bill" value={`${result.market_signals.tbill_rate_pct.toFixed(2)}`} unit="%" />
        <StatTile label="Market pressure" value="" sub={<MPILabel mpi={result.market_signals.mpi} />} />
      </div>

      {/* Fair price + market details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border border-zinc-200 bg-white p-5">
          <SectionLabel>Fair price model</SectionLabel>
          <div className="flex items-end gap-2 mb-1">
            <span className="text-3xl font-semibold text-zinc-900">${result.fair_price.p_fair.toFixed(3)}</span>
            <span className="text-sm text-zinc-400 mb-1">/bu estimated fair value</span>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Range: ${result.fair_price.p_fair_low.toFixed(3)} – ${result.fair_price.p_fair_high.toFixed(3)}
            &nbsp;·&nbsp;Futures: ${result.fair_price.p_futures.toFixed(3)}
          </p>
          {result.fair_price.mispricing_pct !== 0 && (
            <div className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md mb-4 ${
              result.fair_price.mispricing_pct > 0
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}>
              {result.fair_price.mispricing_pct > 0 ? "Underpriced by" : "Overpriced by"}&nbsp;
              <strong>{fmtPct(Math.abs(result.fair_price.mispricing_pct))}</strong>
              &nbsp;({fmt(Math.abs(result.fair_price.revenue_impact))} on your lot)
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              { label: "Transport impact", val: result.fair_price.drivers.transport_impact },
              { label: "Seasonality", val: result.fair_price.drivers.seasonality_impact },
              { label: "Basis gap", val: result.fair_price.drivers.basis_gap },
              { label: "Weather", val: result.fair_price.drivers.weather_impact },
            ].map(({ label, val }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">{label}</span>
                <span className={`text-sm font-medium tabular-nums ${val >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {val >= 0 ? "+" : ""}{val.toFixed(3)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-3">
          <SectionLabel>Market details</SectionLabel>
          {[
            { label: "Regional basis", value: `${result.market_signals.basis_regional >= 0 ? "+" : ""}${result.market_signals.basis_regional.toFixed(3)}` },
            { label: "Local basis", value: `${result.fair_price.basis_local >= 0 ? "+" : ""}${result.fair_price.basis_local.toFixed(3)}` },
            { label: "Futures vol (ann)", value: fmtPct(result.market_signals.futures_volatility) },
            { label: "Inventory signal", value: result.market_signals.inventory_signal.toFixed(3) },
            { label: "MPI score", value: result.market_signals.mpi_score.toFixed(3) },
            { label: "Weather disruption", value: result.market_signals.weather_disruption_index.toFixed(3) },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">{label}</span>
              <span className="text-sm font-medium text-zinc-700 tabular-nums">{value}</span>
            </div>
          ))}
          {result.market_signals.weather_summary && (
            <>
              <Separator className="bg-zinc-100" />
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-zinc-400">7-day weather</span>
                  <WeatherBadge risk={result.market_signals.weather_risk} />
                </div>
                <p className="text-sm text-zinc-500 leading-relaxed">{result.market_signals.weather_summary}</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Buyer comparison */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <SectionLabel>Buyer comparison</SectionLabel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-400">
              <th className="text-left pb-2 pr-4 font-medium">Buyer</th>
              <th className="text-right pb-2 pr-4 font-medium">Bid/bu</th>
              <th className="text-right pb-2 pr-4 font-medium">Miles</th>
              <th className="text-right pb-2 pr-4 font-medium">Haul cost</th>
              <th className="text-right pb-2 pr-4 font-medium">Net/bu</th>
              <th className="text-right pb-2 font-medium">Net total</th>
            </tr>
          </thead>
          <tbody>
            {result.buyers.map((b) => {
              const best = b.name === result.best_buyer;
              return (
                <tr key={b.name} className="border-b border-zinc-50 last:border-0">
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2">
                      {best && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      <span className={`text-sm font-medium ${best ? "text-zinc-900" : "text-zinc-500"}`}>{b.name}</span>
                    </span>
                  </td>
                  <td className="text-right py-3 pr-4 text-sm text-zinc-500 tabular-nums">{fmtBu(b.bid_per_bu)}</td>
                  <td className="text-right py-3 pr-4 text-sm text-zinc-400 tabular-nums">{b.distance_miles.toFixed(1)}</td>
                  <td className="text-right py-3 pr-4 text-sm text-zinc-400 tabular-nums">-{fmt(b.transport_cost)}</td>
                  <td className="text-right py-3 pr-4 text-sm tabular-nums text-zinc-500">{fmtBu(b.net_per_bu)}</td>
                  <td className={`text-right py-3 text-sm font-semibold tabular-nums ${best ? "text-zinc-900" : "text-zinc-400"}`}>
                    {fmt(b.net_revenue)}
                    {b.vs_best_net < 0 && (
                      <span className="block text-xs text-red-400 font-normal">{fmt(b.vs_best_net)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scenarios */}
      <div className="space-y-3">
        <SectionLabel>Scenarios</SectionLabel>

        {/* Sell now rows */}
        <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-50">
          {sellNowScenarios.map((s) => (
            <div key={s.label} className={`flex items-center justify-between px-5 py-3 ${s.recommended ? "bg-zinc-50" : ""}`}>
              <div className="flex items-center gap-2">
                {s.recommended && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <span className="text-sm text-zinc-700">{s.label}</span>
              </div>
              <div className="flex items-center gap-5">
                <span className="text-sm text-zinc-400 tabular-nums">{fmtBu(s.ev_per_bu)}/bu</span>
                <span className={`text-sm font-semibold tabular-nums ${s.recommended ? "text-zinc-900" : "text-zinc-500"}`}>
                  {fmt(s.expected_value)}
                </span>
                <ConfidenceDot c={s.confidence} />
              </div>
            </div>
          ))}
        </div>

        {/* Wait / store cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {waitScenarios.map((s) => (
            <div key={s.label} className={`rounded-lg border bg-white p-4 ${s.recommended ? "border-zinc-400" : "border-zinc-200"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  {s.recommended && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                  <span className="text-sm font-medium text-zinc-800">{s.label}</span>
                </div>
                <ConfidenceDot c={s.confidence} />
              </div>
              <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{fmt(s.expected_value)}</p>
              <p className="text-sm text-zinc-400 tabular-nums mt-0.5">{fmt(s.low)} – {fmt(s.high)}</p>
              <div className="mt-3 pt-3 border-t border-zinc-50 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <p className="text-xs text-zinc-400">Cost</p>
                  <p className="text-sm text-zinc-600 tabular-nums">{fmt(s.cost_total)}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Risk exposure</p>
                  <p className="text-sm text-zinc-600 tabular-nums">{fmt(s.risk_exposure)}</p>
                </div>
                {s.seasonal_trend_pct !== 0 && (
                  <div className="col-span-2">
                    <p className="text-xs text-zinc-400">Seasonal trend</p>
                    <p className={`text-sm tabular-nums ${s.seasonal_trend_pct > 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {s.seasonal_trend_pct > 0 ? "+" : ""}{s.seasonal_trend_pct.toFixed(2)}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario bar chart */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <SectionLabel>Scenario range</SectionLabel>
        <div className="h-52" style={{ minHeight: 208 }}>
          <ResponsiveContainer width="100%" height={208}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a1a1aa" }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(value) => [typeof value === "number" ? fmt(value) : String(value)]}
                contentStyle={{ borderRadius: 6, border: "1px solid #e4e4e7", fontSize: 13 }}
                cursor={{ fill: "#f9f9f9" }}
              />
              {recommended && (
                <ReferenceLine y={recommended.expected_value} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} />
              )}
              <Bar dataKey="Low" fill="#d4d4d8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Expected" fill="#18181b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="High" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Storage analysis */}
      {result.storage_analysis && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionLabel>Storage analysis</SectionLabel>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
              result.storage_analysis.recommend_delay
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-600"
            }`}>
              {result.storage_analysis.recommend_delay ? "Storage adds value" : "Sell now preferred"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Storage value/bu", value: `${result.storage_analysis.v_storage_per_bu >= 0 ? "+" : ""}$${result.storage_analysis.v_storage_per_bu.toFixed(4)}` },
              { label: "Total storage value", value: fmt(result.storage_analysis.total_storage_value) },
              { label: "Storage cost", value: fmt(result.storage_analysis.storage_cost_total) },
              { label: "Opportunity cost", value: fmt(result.storage_analysis.opportunity_cost) },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
                <p className="text-base font-semibold text-zinc-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

type Tab = "market" | "analysis";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("market");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      commodity: undefined,
      quantity_bu: "",
      farm_address: "",
      buyers: [{ name: "", bid_per_bu: "", address: "" }],
      has_storage: false,
      storage_type: "on_farm",
      storage_months: 3,
      urgency: undefined,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "buyers" });
  const hasStorage = watch("has_storage");
  const storageMonths = watch("storage_months") ?? 3;
  const commodity = watch("commodity");
  const storageType = watch("storage_type");
  const urgency = watch("urgency");

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setApiError(null);
    try {
      const res = await analyze({
        ...values,
        storage_months: values.has_storage ? values.storage_months : undefined,
      });
      setResult(res);
      setUseMock(false);
      setTab("analysis");
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function loadMock() {
    setResult(MOCK_RESPONSE);
    setUseMock(true);
    setApiError(null);
    setTab("analysis");
  }

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 border-r border-zinc-200 bg-white overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Farm */}
          <div className="space-y-3">
            <div>
              <FieldLabel>Commodity</FieldLabel>
              <Select
                value={commodity}
                onValueChange={(v) =>
                  setValue("commodity", v as "soybeans" | "corn" | "wheat", { shouldValidate: true })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corn">Corn</SelectItem>
                  <SelectItem value="soybeans">Soybeans</SelectItem>
                  <SelectItem value="wheat">Wheat</SelectItem>
                </SelectContent>
              </Select>
              {errors.commodity && <p className="text-red-500 text-xs mt-1">{errors.commodity.message}</p>}
            </div>

            <div>
              <FieldLabel>Quantity (bu)</FieldLabel>
              <Input type="number" placeholder="10,000" className="h-9 text-sm" {...register("quantity_bu")} />
              {errors.quantity_bu && <p className="text-red-500 text-xs mt-1">{errors.quantity_bu.message}</p>}
            </div>

            <div>
              <FieldLabel>Farm address</FieldLabel>
              <Input placeholder="123 County Rd, Springfield, IL" className="h-9 text-sm" {...register("farm_address")} />
              {errors.farm_address && <p className="text-red-500 text-xs mt-1">{errors.farm_address.message}</p>}
            </div>
          </div>

          <Separator className="bg-zinc-100" />

          {/* Buyers */}
          <div className="space-y-2">
            <FieldLabel>Buyers (1–5)</FieldLabel>
            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-md border border-zinc-100 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Buyer {idx + 1}</span>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)} className="text-zinc-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Input placeholder="Name" className="h-8 text-sm" {...register(`buyers.${idx}.name`)} />
                {errors.buyers?.[idx]?.name && <p className="text-red-500 text-xs">{errors.buyers[idx]?.name?.message}</p>}
                <Input type="number" step="0.01" placeholder="$/bu bid" className="h-8 text-sm" {...register(`buyers.${idx}.bid_per_bu`)} />
                {errors.buyers?.[idx]?.bid_per_bu && <p className="text-red-500 text-xs">{errors.buyers[idx]?.bid_per_bu?.message}</p>}
                <Input placeholder="Address" className="h-8 text-sm" {...register(`buyers.${idx}.address`)} />
                {errors.buyers?.[idx]?.address && <p className="text-red-500 text-xs">{errors.buyers[idx]?.address?.message}</p>}
              </div>
            ))}
            {fields.length < 5 && (
              <button
                type="button"
                onClick={() => append({ name: "", bid_per_bu: "", address: "" })}
                className="w-full py-2 border border-dashed border-zinc-200 rounded-md text-sm text-zinc-400 hover:text-zinc-700 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add buyer
              </button>
            )}
          </div>

          <Separator className="bg-zinc-100" />

          {/* Storage & Urgency */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <FieldLabel>Storage available</FieldLabel>
                <p className="text-xs text-zinc-400">Enables wait scenarios</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hasStorage}
                onClick={() => setValue("has_storage", !hasStorage)}
                className={`relative w-9 h-5 rounded-full transition-colors outline-none ${hasStorage ? "bg-zinc-900" : "bg-zinc-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasStorage ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </div>

            {hasStorage && (
              <>
                <div>
                  <FieldLabel>Storage type</FieldLabel>
                  <Select value={storageType} onValueChange={(v) => setValue("storage_type", v as "on_farm" | "commercial")}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="on_farm">On-farm</SelectItem>
                      <SelectItem value="commercial">Commercial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="flex justify-between mb-2">
                    <FieldLabel>Storage duration</FieldLabel>
                    <span className="text-sm font-semibold text-zinc-700">{storageMonths} mo</span>
                  </div>
                  <Slider min={1} max={12} step={1} value={[storageMonths]} onValueChange={(v) => setValue("storage_months", (v as number[])[0])} />
                  <div className="flex justify-between text-xs text-zinc-300 mt-1"><span>1</span><span>6</span><span>12</span></div>
                </div>
              </>
            )}

            <div>
              <FieldLabel>Urgency</FieldLabel>
              <Select value={urgency ?? ""} onValueChange={(v) => setValue("urgency", v as "low" | "medium" | "high", { shouldValidate: true })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low — can wait</SelectItem>
                  <SelectItem value="medium">Medium — weeks</SelectItem>
                  <SelectItem value="high">High — need cash now</SelectItem>
                </SelectContent>
              </Select>
              {errors.urgency && <p className="text-red-500 text-xs mt-1">{errors.urgency.message}</p>}
            </div>
          </div>

          {apiError && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {apiError}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <Button type="submit" disabled={loading} className="w-full h-9 text-sm bg-zinc-900 hover:bg-zinc-700 text-white">
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</span>
              ) : "Run analysis"}
            </Button>
            <button
              type="button"
              onClick={loadMock}
              className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
            >
              Use sample data
            </button>
          </div>
        </form>
      </aside>

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-zinc-200 bg-white px-5 flex items-center gap-1 h-10 shrink-0">
          {([["market", "Market"] as const, ["analysis", "Analysis"] as const]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                tab === t
                  ? "bg-zinc-100 text-zinc-900 font-medium"
                  : "text-zinc-400 hover:text-zinc-700"
              }`}
            >
              {label}
              {t === "analysis" && result && (
                <span className="ml-1.5 text-xs bg-zinc-900 text-white rounded-full px-1.5 py-0.5">1</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-zinc-50">
          {tab === "market" && <MarketTab useMock={useMock} />}
          {tab === "analysis" && (
            result
              ? <AnalysisPanel result={result} onClear={() => { setResult(null); setTab("market"); }} />
              : (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <p className="text-base font-medium text-zinc-400">No analysis yet</p>
                  <p className="text-sm text-zinc-300 mt-1">Fill in the form and run analysis, or use sample data.</p>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
}
