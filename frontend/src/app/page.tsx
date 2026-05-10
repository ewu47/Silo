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
  MapPin,
  Search,
  LocateFixed,
  BookmarkPlus,
  Wheat,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ErrorBar,
  Cell,
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
import { analyze, MOCK_RESPONSE, fetchMarketContext, MOCK_MARKET, fetchNearbyElevators, getProfile } from "@/lib/api";
import type { NearbyElevator } from "@/lib/api";
import type { AnalyzeResponse, MPI, Confidence, WeatherRisk, MarketContextResponse } from "@/lib/types";
import MethodologyTab from "@/components/MethodologyTab";
import AddressAutocomplete, { toAddressString, fromAddressString, type AddressValue } from "@/components/AddressAutocomplete";
import { supabase } from "@/lib/supabase";

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
  farm_address: z.string().min(5, "Farm address required"),
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
    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
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
  const [headlines, setHeadlines] = useState<MarketContextResponse["headlines"]>(MOCK_MARKET.headlines);
  const [loading, setLoading] = useState(false);
  const [activeCommodity, setActiveCommodity] = useState<string>("soybeans");

  const load = useCallback(async () => {
    if (useMock) { setCtx(MOCK_MARKET); setHeadlines(MOCK_MARKET.headlines); return; }
    setLoading(true);
    try {
      const res = await fetchMarketContext();
      setCtx(res);
      if (res.headlines.length > 0 && res.headlines.some((h) => h.link && h.link !== "#")) {
        setHeadlines(res.headlines);
      }
    } catch {
      setCtx(MOCK_MARKET);
    } finally {
      setLoading(false);
    }
  }, [useMock]);

  useEffect(() => { load(); }, [load]);

  const data = ctx ?? MOCK_MARKET;

  return (
    <div className="p-5 space-y-5 w-full">
      {/* Futures quotes + refresh */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>Futures quotes</SectionLabel>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {data.quotes.map((q) => {
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
                <div className="flex items-baseline gap-2">
                  <p className="text-xl font-semibold text-zinc-900">${q.price.toFixed(3)}</p>
                  <p className={`text-sm font-medium ${up ? "text-emerald-600" : "text-red-500"}`}>
                    {up ? "▲" : "▼"} {fmtPct(Math.abs(q.momentum_weekly_pct))}/wk
                  </p>
                </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <SectionLabel>Economic indicators</SectionLabel>
          <div className="flex-1 rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
            {[
              { label: "Diesel", value: `$${data.diesel_per_gal.toFixed(2)}/gal` },
              { label: "T-Bill (3mo)", value: `${data.tbill_rate_pct.toFixed(2)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">{label}</span>
                <span className="text-sm font-semibold text-zinc-900">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 flex flex-col">
          <SectionLabel>Ag headlines</SectionLabel>
          <div className="flex-1 rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-50">
            {headlines.length === 0 ? (
              <p className="p-4 text-sm text-zinc-400">No headlines available.</p>
            ) : (
              headlines.map((h, i) => {
                const hasLink = h.link && h.link !== "#" && !h.link.startsWith("http://localhost");
                return hasLink ? (
                  <a
                    key={i}
                    href={h.link}
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
                ) : (
                  <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-800 leading-snug">{h.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {h.source} · {h.published ? h.published.slice(0, 16) : ""}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 7-day weather — standalone horizontal bubble */}
      {data.weather_summary && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>7-day weather outlook</SectionLabel>
            <WeatherBadge risk={data.weather_risk} />
          </div>
          <p className="text-sm text-zinc-500 leading-relaxed">{data.weather_summary}</p>
        </div>
      )}
    </div>
  );
}

// ── Scenario comparison chart ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScenarioTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-3 text-xs space-y-1 min-w-[170px]">
      <p className="font-semibold text-zinc-700 text-sm">{d.label}</p>
      <p className="text-zinc-400">Range: <span className="text-zinc-700 font-medium">{fmt(d.low)} – {fmt(d.high)}</span></p>
      <p className="text-zinc-400">Expected: <span className="text-zinc-900 font-semibold">{fmt(d.ev)}</span></p>
      <p className="text-zinc-400">EV/bu: <span className="text-zinc-700">{fmtBu(d.ev_per_bu)}</span></p>
      {d.recommended && <p className="text-amber-500 font-medium">★ Recommended</p>}
    </div>
  );
}

function ScenarioChart({
  scenarios,
  recommended,
}: {
  scenarios: import("@/lib/types").ScenarioResult[];
  recommended: import("@/lib/types").ScenarioResult | undefined;
}) {
  // One dot per scenario: show EV as the bar, range as error bars
  const data = scenarios.map((s) => ({
    label: s.label.replace("Sell Now — ", ""),
    ev: s.expected_value,
    ev_per_bu: s.ev_per_bu,
    low: s.low,
    high: s.high,
    recommended: s.recommended,
    isSellNow: s.action === "sell_now",
    // ErrorBar expects [below, above] from the center value
    range: [s.expected_value - s.low, s.high - s.expected_value] as [number, number],
  }));

  // Tight Y-axis: zoom in around EV range (not whisker extremes) so differences are readable
  const allEVs = data.map((d) => d.ev);
  const evMin = Math.min(...allEVs);
  const evMax = Math.max(...allEVs);
  const evSpread = Math.max(evMax - evMin, 500); // min $500 spread so chart isn't flat
  const pad = evSpread * 0.6;
  const domain: [number, number] = [Math.floor(evMin - pad), Math.ceil(evMax + pad)];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Expected value by scenario</SectionLabel>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-zinc-900" /> EV</span>
          <span className="flex items-center gap-1"><span className="inline-block w-0.5 h-3 bg-red-400" /> Range</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-amber-400" style={{ borderTop: "2px dashed #f59e0b" }} /> Recommended</span>
        </div>
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 4 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={domain}
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip content={<ScenarioTooltip />} cursor={{ fill: "#f9fafb" }} />
            {recommended && (
              <ReferenceLine
                y={recommended.expected_value}
                stroke="#f59e0b"
                strokeDasharray="4 2"
                strokeWidth={1.5}
                label={{ value: "Best", position: "right", fontSize: 10, fill: "#f59e0b" }}
              />
            )}
            <Bar dataKey="ev" radius={[3, 3, 0, 0]} maxBarSize={52}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.recommended ? "#18181b" : d.isSellNow ? "#71717a" : "#a1a1aa"}
                />
              ))}
              <ErrorBar dataKey="range" width={4} strokeWidth={1.5} stroke="#ef4444" direction="y" />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-zinc-400 mt-2">
        Bars show expected value. Whiskers show low–high range (1.5σ). Darker = higher priority.
      </p>
    </div>
  );
}

// ── Analysis results panel ────────────────────────────────────────────────────

function AnalysisPanel({ result, onClear, analyzedAt }: { result: AnalyzeResponse; onClear: () => void; analyzedAt: Date }) {
  const recommended = result.scenarios.find((s) => s.recommended);
  const sellNowScenarios = result.scenarios.filter((s) => s.action === "sell_now");
  const waitScenarios = result.scenarios.filter((s) => s.action !== "sell_now");

  const dateStr = analyzedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = analyzedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="p-5 space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 capitalize">{result.commodity}</h2>
          <span className="text-zinc-300">|</span>
          <p className="text-sm text-zinc-400">{result.quantity_bu.toLocaleString()} bu</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span>{dateStr}</span>
          <span className="text-zinc-300">|</span>
          <span>{timeStr}</span>
          <span className="text-zinc-300">|</span>
          <button onClick={onClear} className="hover:text-zinc-600 transition-colors">Clear</button>
          <span className="text-zinc-300">|</span>
          <button className="flex items-center gap-1 hover:text-zinc-600 transition-colors">
            <BookmarkPlus className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      </div>

      {/* Recommendation */}
      {recommended && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <SectionLabel>Recommendation</SectionLabel>
            <Star className="w-4 h-4 text-amber-400 mb-2" />
          </div>
          <p className="text-sm text-zinc-700 leading-relaxed mb-4">{result.llm_explanation}</p>
          <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 flex-wrap">
            <span className="text-sm text-zinc-500">Best action:</span>
            <span className="text-sm font-semibold text-zinc-900">{recommended.label}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-sm font-semibold text-zinc-900">{fmt(recommended.expected_value)}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-sm text-zinc-400">
              Conviction:{" "}
              <span className={{high:"text-emerald-600 font-medium",medium:"text-amber-500 font-medium",low:"text-red-400 font-medium"}[recommended.confidence]}>
                {recommended.confidence.charAt(0).toUpperCase() + recommended.confidence.slice(1)}
              </span>
              <span className="text-zinc-300 ml-1 text-xs">(how strongly the model favors this action over alternatives)</span>
            </span>
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
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-zinc-400">/bu</span>
              <span className={`text-sm font-medium ${result.market_signals.futures_momentum >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {result.market_signals.futures_momentum >= 0 ? "▲" : "▼"}{" "}
                {fmtPct(Math.abs(result.market_signals.futures_momentum))}/wk
              </span>
            </div>
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
        </div>
      </div>

      {/* 7-day weather — standalone horizontal bubble */}
      {result.market_signals.weather_summary && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>7-day weather outlook</SectionLabel>
            <WeatherBadge risk={result.market_signals.weather_risk} />
          </div>
          <p className="text-sm text-zinc-500 leading-relaxed">{result.market_signals.weather_summary}</p>
        </div>
      )}

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
                      <span className={`text-sm font-medium ${best ? "text-zinc-900" : "text-zinc-500"}`}>{b.name}</span>
                      {best && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
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

      {/* Scenarios — all in one bubble */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-4">
        <SectionLabel>Scenarios</SectionLabel>

        {/* Sell now rows */}
        <div className="rounded-md border border-zinc-100 divide-y divide-zinc-50">
          {sellNowScenarios.map((s) => (
            <div key={s.label} className={`flex items-center justify-between px-4 py-3 ${s.recommended ? "bg-zinc-50 rounded-md" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-700">{s.label}</span>
                {s.recommended && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
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
            <div key={s.label} className={`rounded-lg border bg-zinc-50 p-4 ${s.recommended ? "border-zinc-400" : "border-zinc-100"}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-zinc-800">{s.label}</span>
                  {s.recommended && <Star className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />}
                </div>
                <ConfidenceDot c={s.confidence} />
              </div>
              <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{fmt(s.expected_value)}</p>
              <p className="text-sm text-zinc-400 tabular-nums mt-0.5">{fmt(s.low)} – {fmt(s.high)}</p>
              <div className="mt-3 pt-3 border-t border-zinc-100 grid grid-cols-2 gap-x-3 gap-y-1.5">
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

      {/* Scenario comparison chart — zoomed to show real differences */}
      <ScenarioChart scenarios={result.scenarios} recommended={recommended} />

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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[
              { label: "Storage value/bu", value: `${result.storage_analysis.v_storage_per_bu >= 0 ? "+" : ""}$${result.storage_analysis.v_storage_per_bu.toFixed(4)}` },
              { label: "Total storage value", value: fmt(result.storage_analysis.total_storage_value) },
              { label: "Storage cost", value: fmt(result.storage_analysis.storage_cost_total) },
              { label: "Opportunity cost", value: fmt(result.storage_analysis.opportunity_cost) },
              { label: "Rate applied", value: `$${result.storage_analysis.storage_rate_per_bu_mo.toFixed(4)}/bu/mo` },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
                <p className="text-base font-semibold text-zinc-800 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transportation analysis */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <SectionLabel>Transportation analysis</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          {(() => {
            const best = result.buyers.find((b) => b.name === result.best_buyer);
            const nearest = [...result.buyers].sort((a, b) => a.distance_miles - b.distance_miles)[0];
            const avgCostPerBu = result.buyers.reduce((s, b) => s + b.transport_cost_per_bu, 0) / result.buyers.length;
            return [
              { label: "Best buyer haul cost", value: best ? fmt(best.transport_cost) : "—" },
              { label: "Nearest buyer", value: nearest ? `${nearest.distance_miles.toFixed(1)} mi` : "—" },
              { label: "Avg haul cost/bu", value: `$${avgCostPerBu.toFixed(3)}` },
              { label: "Best net/bu", value: best ? fmtBu(best.net_per_bu) : "—" },
            ];
          })().map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
              <p className="text-base font-semibold text-zinc-800 tabular-nums">{value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {result.buyers.map((b) => {
            const pct = result.buyers[0]?.net_revenue
              ? (b.net_revenue / result.buyers[0].net_revenue) * 100
              : 100;
            return (
              <div key={b.name} className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-36 truncate">{b.name}</span>
                <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-zinc-700"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-zinc-600 tabular-nums w-28 text-right">
                  {fmt(b.transport_cost)} haul · {b.distance_miles.toFixed(1)} mi
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Calendar tab ──────────────────────────────────────────────────────────────

type CalendarCommodity = "corn" | "soybeans" | "wheat";

const CALENDAR_DATA: Record<CalendarCommodity, {
  month: string; short: string; planting: boolean; harvest: boolean;
  avgChangePct: number; signal: "bullish" | "bearish" | "neutral"; note?: string;
}[]> = {
  corn: [
    { month: "January",   short: "Jan", planting: false, harvest: false, avgChangePct:  0.8, signal: "bullish",  note: "Export demand lifts prices" },
    { month: "February",  short: "Feb", planting: false, harvest: false, avgChangePct:  0.5, signal: "neutral",  note: "Pre-planting positioning" },
    { month: "March",     short: "Mar", planting: true,  harvest: false, avgChangePct:  1.2, signal: "bullish",  note: "Planting intention reports" },
    { month: "April",     short: "Apr", planting: true,  harvest: false, avgChangePct:  1.5, signal: "bullish",  note: "Weather premium builds" },
    { month: "May",       short: "May", planting: true,  harvest: false, avgChangePct:  1.3, signal: "bullish",  note: "Pre-planting price peak" },
    { month: "June",      short: "Jun", planting: false, harvest: false, avgChangePct: -0.4, signal: "neutral",  note: "Crop progress pressure" },
    { month: "July",      short: "Jul", planting: false, harvest: false, avgChangePct: -0.8, signal: "neutral",  note: "Pollination risk — volatile" },
    { month: "August",    short: "Aug", planting: false, harvest: true,  avgChangePct: -1.5, signal: "bearish",  note: "Harvest approaches" },
    { month: "September", short: "Sep", planting: false, harvest: true,  avgChangePct: -2.1, signal: "bearish",  note: "Harvest pressure low" },
    { month: "October",   short: "Oct", planting: false, harvest: true,  avgChangePct: -0.5, signal: "neutral",  note: "Harvest eases" },
    { month: "November",  short: "Nov", planting: false, harvest: false, avgChangePct:  0.6, signal: "bullish",  note: "Export demand returns" },
    { month: "December",  short: "Dec", planting: false, harvest: false, avgChangePct:  0.9, signal: "bullish",  note: "Year-end positioning" },
  ],
  soybeans: [
    { month: "January",   short: "Jan", planting: false, harvest: false, avgChangePct:  1.2, signal: "bullish",  note: "South America crop watch" },
    { month: "February",  short: "Feb", planting: false, harvest: false, avgChangePct:  0.8, signal: "bullish",  note: "SA harvest pressure begins" },
    { month: "March",     short: "Mar", planting: false, harvest: false, avgChangePct: -0.3, signal: "neutral",  note: "SA harvest + US planting prep" },
    { month: "April",     short: "Apr", planting: true,  harvest: false, avgChangePct:  0.9, signal: "bullish",  note: "Planting intentions" },
    { month: "May",       short: "May", planting: true,  harvest: false, avgChangePct:  1.4, signal: "bullish",  note: "China demand peak" },
    { month: "June",      short: "Jun", planting: true,  harvest: false, avgChangePct:  0.7, signal: "bullish",  note: "Planting progress" },
    { month: "July",      short: "Jul", planting: false, harvest: false, avgChangePct:  1.8, signal: "bullish",  note: "Drought scare premium — most volatile" },
    { month: "August",    short: "Aug", planting: false, harvest: true,  avgChangePct: -1.2, signal: "bearish",  note: "Pod-fill, harvest nears" },
    { month: "September", short: "Sep", planting: false, harvest: true,  avgChangePct: -2.3, signal: "bearish",  note: "Harvest low" },
    { month: "October",   short: "Oct", planting: false, harvest: true,  avgChangePct: -0.8, signal: "bearish",  note: "Harvest pressure" },
    { month: "November",  short: "Nov", planting: false, harvest: false, avgChangePct:  0.4, signal: "neutral",  note: "Export lift" },
    { month: "December",  short: "Dec", planting: false, harvest: false, avgChangePct:  0.6, signal: "neutral",  note: "Neutral" },
  ],
  wheat: [
    { month: "January",   short: "Jan", planting: false, harvest: false, avgChangePct: -0.2, signal: "neutral",  note: "Winter dormancy" },
    { month: "February",  short: "Feb", planting: false, harvest: false, avgChangePct:  0.3, signal: "neutral",  note: "Freeze risk watch" },
    { month: "March",     short: "Mar", planting: true,  harvest: false, avgChangePct:  1.1, signal: "bullish",  note: "Spring green-up rally" },
    { month: "April",     short: "Apr", planting: true,  harvest: false, avgChangePct:  1.4, signal: "bullish",  note: "Condition reports" },
    { month: "May",       short: "May", planting: false, harvest: false, avgChangePct:  0.6, signal: "bullish",  note: "Pre-harvest" },
    { month: "June",      short: "Jun", planting: false, harvest: true,  avgChangePct: -2.0, signal: "bearish",  note: "HRW harvest low" },
    { month: "July",      short: "Jul", planting: false, harvest: true,  avgChangePct: -1.5, signal: "bearish",  note: "SRW harvest low" },
    { month: "August",    short: "Aug", planting: true,  harvest: false, avgChangePct:  0.2, signal: "neutral",  note: "Post-harvest stabilize / winter planting" },
    { month: "September", short: "Sep", planting: true,  harvest: false, avgChangePct:  0.5, signal: "neutral",  note: "Fall demand" },
    { month: "October",   short: "Oct", planting: true,  harvest: false, avgChangePct:  0.8, signal: "bullish",  note: "Export season" },
    { month: "November",  short: "Nov", planting: false, harvest: false, avgChangePct:  1.0, signal: "bullish",  note: "Export demand" },
    { month: "December",  short: "Dec", planting: false, harvest: false, avgChangePct:  0.7, signal: "bullish",  note: "Year-end" },
  ],
};

const BEST_SELL_MONTHS: Record<CalendarCommodity, number[]> = {
  corn:     [4, 5, 3],
  soybeans: [7, 5, 1],
  wheat:    [4, 3, 11],
};

const WORST_SELL_MONTHS: Record<CalendarCommodity, number[]> = {
  corn:     [9, 8, 7],
  soybeans: [9, 8, 10],
  wheat:    [6, 7, 5],
};

function CalendarTab() {
  const [commodity, setCommodity] = useState<CalendarCommodity>("corn");
  const currentMonth = new Date().getMonth() + 1;
  const data = CALENDAR_DATA[commodity];
  const bestSell = BEST_SELL_MONTHS[commodity];
  const worstSell = WORST_SELL_MONTHS[commodity];
  const barMax = Math.max(...data.map((d) => Math.abs(d.avgChangePct)));

  return (
    <div className="p-5 space-y-5 w-full">
      {/* Header + commodity selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/silo.png" alt="Silo" className="w-5 h-5 object-contain" />
          <SectionLabel>Seasonal calendar</SectionLabel>
        </div>
        <div className="flex gap-2">
          {(["corn", "soybeans", "wheat"] as CalendarCommodity[]).map((c) => (
            <button
              key={c}
              onClick={() => setCommodity(c)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                commodity === c
                  ? "bg-zinc-900 text-white"
                  : "bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400"
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" /> Planting window</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" /> Harvest window</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-zinc-900 inline-block" /> Current month</span>
        <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> Bullish</span>
        <span className="flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5 text-red-400" /> Bearish</span>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {data.map((m, i) => {
          const monthNum = i + 1;
          const isCurrent = monthNum === currentMonth;
          const isBest = bestSell.includes(monthNum);
          const isWorst = worstSell.includes(monthNum);
          const barWidth = Math.round((Math.abs(m.avgChangePct) / barMax) * 100);

          let bg = "bg-white border-zinc-200";
          if (isCurrent) bg = "bg-zinc-900 border-zinc-900";
          else if (m.planting && m.harvest) bg = "bg-yellow-50 border-yellow-200";
          else if (m.planting) bg = "bg-emerald-50 border-emerald-200";
          else if (m.harvest) bg = "bg-amber-50 border-amber-200";

          return (
            <div key={m.month} className={`rounded-xl border p-4 flex flex-col gap-2 ${bg}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold ${isCurrent ? "text-white" : "text-zinc-800"}`}>
                  {m.short}
                  {isCurrent && <span className="ml-1.5 text-xs font-normal opacity-60">now</span>}
                </span>
                {m.signal === "bullish" && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                {m.signal === "bearish" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                {m.signal === "neutral" && <Minus className="w-3.5 h-3.5 text-zinc-400" />}
              </div>

              <div className="flex gap-1 flex-wrap">
                {m.planting && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCurrent ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>
                    Planting
                  </span>
                )}
                {m.harvest && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCurrent ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                    Harvest
                  </span>
                )}
                {isBest && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCurrent ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"}`}>
                    ★ Sell
                  </span>
                )}
                {isWorst && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCurrent ? "bg-white/20 text-white" : "bg-red-50 text-red-500"}`}>
                    Low
                  </span>
                )}
              </div>

              <div>
                <div className={`text-[11px] mb-1 ${isCurrent ? "text-white/70" : "text-zinc-400"}`}>
                  avg {m.avgChangePct > 0 ? "+" : ""}{m.avgChangePct.toFixed(1)}%/mo
                </div>
                <div className={`h-1 rounded-full ${isCurrent ? "bg-white/20" : "bg-zinc-100"}`}>
                  <div
                    className={`h-1 rounded-full ${m.avgChangePct > 0 ? "bg-emerald-400" : "bg-red-400"}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>

              {m.note && (
                <p className={`text-[11px] leading-snug ${isCurrent ? "text-white/60" : "text-zinc-400"}`}>
                  {m.note}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Best months to sell</p>
          <div className="flex gap-2 flex-wrap">
            {bestSell.map((m) => (
              <span key={m} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium">
                {data[m - 1].month}
              </span>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-3">Historically strongest price months for {commodity}.</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Harvest price pressure</p>
          <div className="flex gap-2 flex-wrap">
            {worstSell.map((m) => (
              <span key={m} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-lg text-sm font-medium">
                {data[m - 1].month}
              </span>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-3">Harvest supply glut typically drives prices down. Store if possible.</p>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

type Tab = "market" | "analysis" | "methodology" | "calendar";

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("market");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState<Date>(new Date());
  const [nearbyElevators, setNearbyElevators] = useState<NearbyElevator[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const EMPTY_ADDR: AddressValue = { street: "", city: "", state: "", zip: "" };
  const [farmAddr, setFarmAddr] = useState<AddressValue>(EMPTY_ADDR);
  const [farmAddressVerified, setFarmAddressVerified] = useState(false);
  const [buyerAddrs, setBuyerAddrs] = useState<AddressValue[]>([EMPTY_ADDR]);
  const [buyerAddrsVerified, setBuyerAddrsVerified] = useState<boolean[]>([false]);

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
      commodity: "" as "soybeans" | "corn" | "wheat",
      quantity_bu: "",
      farm_address: "",
      buyers: [{ name: "", bid_per_bu: "", address: "" }],
      has_storage: false,
      storage_type: "on_farm",
      storage_months: 3,
      urgency: "" as "low" | "medium" | "high",
    },
  });

  // Load saved farm address from profile if user is signed in
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      try {
        const profile = await getProfile(data.session.access_token);
        if (profile.farm_address) {
          const parsed = fromAddressString(profile.farm_address);
          setFarmAddr(parsed);
          setFarmAddressVerified(true);
          setValue("farm_address", profile.farm_address);
        }
      } catch {
        // not signed in or no profile — fine
      }
    });
  }, [setValue]);

  const { fields, append, remove } = useFieldArray({ control, name: "buyers" });
  const hasStorage = watch("has_storage");
  const storageMonths = watch("storage_months") ?? 3;
  const commodity = watch("commodity");
  const storageType = watch("storage_type");
  const urgency = watch("urgency");

  function setBuyerAddr(idx: number, addr: AddressValue, verified: boolean) {
    setBuyerAddrs((prev) => { const n = [...prev]; n[idx] = addr; return n; });
    setBuyerAddrsVerified((prev) => { const n = [...prev]; n[idx] = verified; return n; });
    setValue(`buyers.${idx}.address`, toAddressString(addr), { shouldValidate: true });
  }

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setApiError(null);
    try {
      const res = await analyze({
        ...values,
        storage_months: values.has_storage ? values.storage_months : undefined,
      });
      setResult(res);
      setAnalyzedAt(new Date());
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
    setAnalyzedAt(new Date());
    setUseMock(true);
    setApiError(null);
    setTab("analysis");
  }

  async function findMyLocation() {
    if (!navigator.geolocation) {
      setNearbyError("Geolocation not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const a = data.address ?? {};
          const parsed: AddressValue = {
            street: `${a.house_number ?? ""} ${a.road ?? ""}`.trim(),
            city:   a.city ?? a.town ?? a.village ?? a.hamlet ?? "",
            state:  a.state ?? "",
            zip:    a.postcode ?? "",
          };
          setFarmAddr(parsed);
          setFarmAddressVerified(true);
          setValue("farm_address", toAddressString(parsed));
        } catch {
          setNearbyError("Could not reverse-geocode location.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setNearbyError("Location access denied.");
        setLocating(false);
      }
    );
  }

  async function lookupNearby() {
    const addrStr = toAddressString(farmAddr);
    if (addrStr.length < 5) {
      setNearbyError("Enter a farm address first.");
      return;
    }
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const res = await fetchNearbyElevators(addrStr, 50);
      setNearbyElevators(res.elevators);
      if (res.elevators.length === 0) setNearbyError("No elevators found within 50 miles.");
    } catch {
      setNearbyError("Could not reach server.");
    } finally {
      setNearbyLoading(false);
    }
  }

  function addNearbyAsBuyer(elev: NearbyElevator) {
    const idx = fields.length;
    append({ name: elev.name, bid_per_bu: "", address: elev.address });
    const parsed = fromAddressString(elev.address);
    setBuyerAddrs((prev) => { const n = [...prev]; n[idx] = parsed; return n; });
    setBuyerAddrsVerified((prev) => { const n = [...prev]; n[idx] = true; return n; });
    // Ensure the form value uses the exact elevator address string, not the re-parsed version
    setTimeout(() => setValue(`buyers.${idx}.address`, elev.address, { shouldValidate: true }), 0);
  }

  return (
    <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-80 shrink-0 border-r border-zinc-200 bg-white overflow-y-auto">
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
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
                <SelectTrigger className="h-10 text-sm w-full">
                  <SelectValue placeholder="Select…">
                    {commodity ? commodity.charAt(0).toUpperCase() + commodity.slice(1) : ""}
                  </SelectValue>
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
              <Input type="number" placeholder="10,000" className="h-10 text-sm" {...register("quantity_bu")} />
              {errors.quantity_bu && <p className="text-red-500 text-xs mt-1">{errors.quantity_bu.message}</p>}
            </div>

            <div className="space-y-2">
              <FieldLabel>Farm address</FieldLabel>
              <button
                type="button"
                onClick={findMyLocation}
                disabled={locating}
                className="w-full h-10 flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-colors disabled:opacity-50"
              >
                {locating
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <LocateFixed className="w-4 h-4" />}
                Find my location
              </button>
              <AddressAutocomplete
                value={farmAddr}
                onChange={(addr, verified) => {
                  setFarmAddr(addr);
                  setFarmAddressVerified(verified);
                  setValue("farm_address", toAddressString(addr), { shouldValidate: true });
                }}
              />
              {errors.farm_address && <p className="text-red-500 text-xs">{errors.farm_address.message}</p>}
            </div>
          </div>

          <Separator className="bg-zinc-100" />

          {/* Buyers */}
          <div className="space-y-2">
            <FieldLabel>Buyers</FieldLabel>
            {fields.map((field, idx) => (
              <div key={field.id} className="rounded-md border border-zinc-100 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Buyer {idx + 1}</span>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => {
                      remove(idx);
                      setBuyerAddrs((p) => p.filter((_, i) => i !== idx));
                      setBuyerAddrsVerified((p) => p.filter((_, i) => i !== idx));
                    }} className="text-zinc-300 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Input placeholder="Name" className="h-9 text-sm" {...register(`buyers.${idx}.name`)} />
                {errors.buyers?.[idx]?.name && <p className="text-red-500 text-xs">{errors.buyers[idx]?.name?.message}</p>}
                <Input type="number" step="0.01" placeholder="$/bu bid" className="h-9 text-sm" {...register(`buyers.${idx}.bid_per_bu`)} />
                {errors.buyers?.[idx]?.bid_per_bu && <p className="text-red-500 text-xs">{errors.buyers[idx]?.bid_per_bu?.message}</p>}
                <AddressAutocomplete
                  value={buyerAddrs[idx] ?? { street: "", city: "", state: "", zip: "" }}
                  onChange={(addr, verified) => setBuyerAddr(idx, addr, verified)}
                />
                {errors.buyers?.[idx]?.address && <p className="text-red-500 text-xs">{errors.buyers[idx]?.address?.message}</p>}
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                append({ name: "", bid_per_bu: "", address: "" });
                setBuyerAddrs((p) => [...p, { street: "", city: "", state: "", zip: "" }]);
                setBuyerAddrsVerified((p) => [...p, false]);
              }}
              className="w-full py-2 border border-dashed border-zinc-200 rounded-md text-sm text-zinc-400 hover:text-zinc-700 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add buyer
            </button>

            {/* Nearby elevator lookup */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={lookupNearby}
                disabled={nearbyLoading}
                className="w-full py-2 rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {nearbyLoading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Search className="w-3.5 h-3.5" />}
                Find nearby elevators/co-ops
              </button>

              {nearbyError && (
                <p className="text-xs text-amber-600">{nearbyError}</p>
              )}

              {nearbyElevators.length > 0 && (
                <div className="rounded-md border border-zinc-100 divide-y divide-zinc-50 max-h-52 overflow-y-auto">
                  {nearbyElevators.map((e) => {
                    const alreadyAdded = fields.some(
                      (f) => (f as { name: string }).name === e.name
                    );
                    return (
                      <div key={e.name} className="flex items-center justify-between px-3 py-2.5 gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-zinc-700 truncate">{e.name}</p>
                          <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            {e.distance_miles} mi
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addNearbyAsBuyer(e)}
                          disabled={alreadyAdded}
                          className="shrink-0 text-[11px] font-medium px-2 py-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        >
                          {alreadyAdded ? "Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
                    <SelectTrigger className="h-10 text-sm w-full">
                      <SelectValue>{storageType === "on_farm" ? "On-farm" : "Commercial"}</SelectValue>
                    </SelectTrigger>
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
                  <input
                    type="range"
                    min={1}
                    max={12}
                    step={1}
                    value={storageMonths}
                    onChange={(e) => setValue("storage_months", Number(e.target.value))}
                    className="w-full h-1 rounded-full appearance-none cursor-pointer bg-zinc-200 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-900 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-zinc-900 [&::-moz-range-thumb]:border-0"
                  />
                  <div className="flex justify-between text-xs text-zinc-300 mt-1"><span>1</span><span>6</span><span>12</span></div>
                </div>
              </>
            )}

            <div>
              <FieldLabel>Urgency</FieldLabel>
              <Select value={urgency ?? ""} onValueChange={(v) => setValue("urgency", v as "low" | "medium" | "high", { shouldValidate: true })}>
                <SelectTrigger className="h-10 text-sm w-full">
                  <SelectValue placeholder="Select…">
                    {urgency === "low" ? "Low — can wait" : urgency === "medium" ? "Medium — weeks" : urgency === "high" ? "High — need cash now" : ""}
                  </SelectValue>
                </SelectTrigger>
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
            <Button
              type="submit"
              disabled={
                loading ||
                (!!toAddressString(farmAddr).trim() && !farmAddressVerified) ||
                buyerAddrs.some((a, i) => !!toAddressString(a).trim() && !buyerAddrsVerified[i])
              }
              className="w-full h-9 text-sm bg-zinc-900 hover:bg-zinc-700 text-white"
            >
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
        <div className="border-b border-zinc-200 bg-white px-5 flex items-center gap-1 h-11 shrink-0">
          {([
            ["market", "Market"] as const,
            ["analysis", "Analysis"] as const,
            ["calendar", "Calendar"] as const,
            ["methodology", "Methodology"] as const,
          ]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-base rounded transition-colors ${
                tab === t
                  ? "bg-zinc-100 text-zinc-900 font-semibold"
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
              ? <AnalysisPanel result={result} onClear={() => { setResult(null); setTab("market"); }} analyzedAt={analyzedAt} />
              : (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <p className="text-base font-medium text-zinc-400">No analysis yet</p>
                  <p className="text-sm text-zinc-300 mt-1">Fill in the form and run analysis, or use sample data.</p>
                </div>
              )
          )}
          {tab === "calendar" && <CalendarTab />}
          {tab === "methodology" && <MethodologyTab />}
        </div>
      </div>
    </div>
  );
}
