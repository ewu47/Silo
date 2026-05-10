"use client";

import "katex/dist/katex.min.css";
import React, { useRef } from "react";
import { BlockMath, InlineMath } from "react-katex";
import { motion, useInView, type Variants } from "framer-motion";
import {
  BookOpen,
  TrendingUp,
  Truck,
  BarChart2,
  Activity,
  Database,
  ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

// ── Primitive helpers ─────────────────────────────────────────────────────────

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-emerald-50 text-emerald-800 px-0.5 rounded-sm font-medium">
      {children}
    </span>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <span className="text-zinc-500">{icon}</span>
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      </div>
      <Separator className="bg-zinc-100" />
      {children}
    </div>
  );
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-4 py-4 overflow-x-auto">
      {children}
    </div>
  );
}

function Term({
  tex,
  label,
  children,
}: {
  tex: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm items-start">
      <div className="shrink-0 w-28 pt-0.5 text-right">
        <InlineMath math={tex} />
      </div>
      <div className="leading-relaxed">
        <span className="font-semibold text-zinc-800">{label}</span>
        <span className="text-zinc-400"> — </span>
        <span className="text-zinc-600">{children}</span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-50 last:border-0">
      <span className="text-sm text-zinc-600">{label}</span>
      <span className="text-sm font-semibold text-zinc-800 font-mono">{value}</span>
    </div>
  );
}

// ── Animated linear flow graph ────────────────────────────────────────────────

type FlowNodeDef = {
  id: string;
  label: string;
  sub?: string;
  variant?: "default" | "output" | "dim";
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const pop: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease: "easeOut" } },
};

function FlowNodeBox({ node }: { node: FlowNodeDef }) {
  const styles = {
    default: "border-zinc-200 bg-white",
    output: "border-emerald-200 bg-emerald-50",
    dim: "border-zinc-100 bg-zinc-50",
  };
  const textColor =
    node.variant === "output" ? "text-emerald-800" : "text-zinc-700";

  return (
    <motion.div
      variants={pop}
      className={`rounded-lg border px-3 py-2.5 text-center min-w-[110px] shrink-0 ${
        styles[node.variant ?? "default"]
      }`}
    >
      <p className={`text-xs font-semibold whitespace-nowrap leading-tight ${textColor}`}>{node.label}</p>
      {node.sub && <p className="text-xs text-zinc-400 mt-0.5 leading-tight">{node.sub}</p>}
    </motion.div>
  );
}

function FlowArrow() {
  return (
    <motion.div variants={pop} className="flex items-center shrink-0">
      <div className="w-5 h-px bg-zinc-300" />
      <ChevronRight className="w-3.5 h-3.5 text-zinc-300 -ml-0.5 shrink-0" />
    </motion.div>
  );
}

function FlowGraph({ nodes }: { nodes: FlowNodeDef[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="overflow-x-auto pb-1">
      <div className="flex justify-center">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        className="flex items-center gap-1 min-w-max py-2 px-1"
      >
        {nodes.map((node, i) => (
          <React.Fragment key={node.id}>
            <FlowNodeBox node={node} />
            {i < nodes.length - 1 && <FlowArrow />}
          </React.Fragment>
        ))}
      </motion.div>
      </div>
    </div>
  );
}

// ── Animated fan-in graph (MPI) ───────────────────────────────────────────────

type FanInput = { label: string; weight: string };

function FanInGraph({
  inputs,
  centerTex,
  output,
}: {
  inputs: FanInput[];
  centerTex: string;
  output: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const delay = (i: number) => i * 0.09;

  return (
    <div ref={ref} className="overflow-x-auto pb-1">
      <div className="flex justify-center">
      <div className="flex items-center gap-3 min-w-max py-2 px-1">
        {/* Input column */}
        <div className="flex flex-col gap-1.5">
          {inputs.map((inp, i) => (
            <motion.div
              key={inp.label}
              initial={{ opacity: 0, x: -14 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: delay(i), duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-2"
            >
              <div className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 w-44">
                <p className="text-xs font-medium text-zinc-700">{inp.label}</p>
              </div>
              <ChevronRight className="w-3 h-3 text-zinc-300 shrink-0" />
            </motion.div>
          ))}
        </div>

        {/* Aggregation node */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{
            delay: delay(inputs.length) + 0.05,
            duration: 0.35,
            ease: "easeOut",
          }}
          className="rounded-lg border-2 border-zinc-300 bg-zinc-50 px-5 py-4 text-center shrink-0"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Aggregation
          </p>
          <InlineMath math={centerTex} />
        </motion.div>

        {/* Arrow */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: delay(inputs.length) + 0.2 }}
          className="flex items-center shrink-0"
        >
          <div className="w-5 h-px bg-zinc-300" />
          <ChevronRight className="w-3.5 h-3.5 text-zinc-300 -ml-0.5 shrink-0" />
        </motion.div>

        {/* Output node */}
        <motion.div
          initial={{ opacity: 0, x: 14 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: delay(inputs.length) + 0.3, duration: 0.32 }}
          className="rounded-lg border-2 border-emerald-200 bg-emerald-50 px-5 py-4 text-center shrink-0"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-2">
            Label
          </p>
          {output.map((o) => (
            <p key={o} className="text-xs font-semibold text-emerald-800 leading-relaxed">
              {o}
            </p>
          ))}
        </motion.div>
      </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MethodologyTab() {
  return (
    <div className="p-5 space-y-5">

      {/* Intro banner */}
      <div className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <BookOpen className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-zinc-800 mb-0.5">How Silo works</p>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Silo is a <Highlight>quantitative engine</Highlight>, not a prediction tool. Every number
            you see is derived from live public market data using the formulas documented here.
            The AI layer (Gemini 2.0 Flash) receives the engine's structured output and
            explains it in plain English.
          </p>
        </div>
      </div>

      {/* ── Fair Price Model ─────────────────────────────────────────────────── */}
      <Section icon={<TrendingUp className="w-4 h-4" />} title="Fair Price Model">
        <p className="text-sm text-zinc-500 leading-relaxed">
          Estimates what your grain <Highlight>should be worth</Highlight> given current market
          conditions, then compares it to your best local bid to identify pricing gaps.
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Computation pipeline
          </p>
          <FlowGraph
            nodes={[
              { id: "futures", label: "CBOT Futures", sub: "ZS=F / ZC=F / ZW=F", variant: "dim" },
              { id: "basis",   label: "+ Regional Basis", sub: "USDA state avg" },
              { id: "season",  label: "+ Seasonal Adj.", sub: "4-week return" },
              { id: "weather", label: "+ Weather Premium", sub: "NOAA NWS" },
              { id: "trans",   label: "− Ref. Transport", sub: "closest buyer" },
              { id: "pfair",   label: "P_fair", sub: "± 1σ range", variant: "output" },
            ]}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Core formula
          </p>
          <FormulaBox>
            <BlockMath math="P_{\text{fair}} = P_{\text{futures}} + B_{\text{region}} + A_{\text{season}} + W_{\text{weather}} - C_{\text{transport\_ref}}" />
          </FormulaBox>
        </div>

        <div className="space-y-3 pt-1">
          <Term tex="P_{\text{futures}}" label="Futures price">
            Front-month CBOT futures from yfinance. Prices arrive in cents/bu and are divided by 100.
          </Term>
          <Term tex="B_{\text{region}}" label="Regional basis">
            Cash minus futures from USDA. Usually negative — cash trades below futures in normal carry markets.
          </Term>
          <Term tex="A_{\text{season}}" label="Seasonal adjustment">
            <InlineMath math="P_f \times r_{\text{seasonal}}" />, where{" "}
            <InlineMath math="r_{\text{seasonal}}" /> is the historical average 4-week price change
            for this commodity and calendar month.
          </Term>
          <Term tex="W_{\text{weather}}" label="Weather premium">
            Any supply disruption — drought or flood — reduces available grain and pushes prices up.
            Scale: $0 to +$0.30/bu based on disruption index severity.
          </Term>
          <Term tex="C_{\text{transport\_ref}}" label="Ref. transport">
            Haul cost to the farmer's <em>closest</em> buyer using the fuel-scaled rate. Anchors{" "}
            <InlineMath math="P_{\text{fair}}" /> at-farm relative to the nearest available market.
          </Term>
        </div>

        <Separator className="bg-zinc-100" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Mispricing &amp; revenue impact
            </p>
            <FormulaBox>
              <BlockMath math="M = \frac{P_{\text{fair}} - P_{\text{local}}}{P_{\text{fair}}}" />
              <BlockMath math="\Delta R = \bigl(P_{\text{fair}} - P_{\text{local}}\bigr) \times Q" />
            </FormulaBox>
            <p className="text-sm text-zinc-500 mt-2">
              Positive <InlineMath math="M" /> → bid is below fair value.{" "}
              <InlineMath math="\Delta R" /> is the total dollar gap on your lot.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Uncertainty range (1σ)
            </p>
            <FormulaBox>
              <BlockMath math="\sigma = \sqrt{\sigma_{\text{basis}}^2 + \bigl(P_f \cdot \sigma_{\text{seasonal}}\bigr)^2}" />
              <BlockMath math="P_{\text{fair}}^{\pm} = P_{\text{fair}} \pm \sigma" />
            </FormulaBox>
            <p className="text-sm text-zinc-500 mt-2">
              <Highlight>Wider band = higher market uncertainty.</Highlight> Derived from historical
              basis volatility and seasonal return std dev.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Transport Model ──────────────────────────────────────────────────── */}
      <Section icon={<Truck className="w-4 h-4" />} title="Transport Model">
        <p className="text-sm text-zinc-500 leading-relaxed">
          Computes the actual haul cost to each buyer and ranks them by{" "}
          <Highlight>net revenue after transport</Highlight>. Live diesel prices from FRED scale
          the fuel component in real time — when fuel is expensive, distant buyers lose their
          bid advantage faster.
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Computation pipeline
          </p>
          <FlowGraph
            nodes={[
              { id: "farm",  label: "Farm Address", variant: "dim" },
              { id: "dist",  label: "Distance (mi)", sub: "Maps / geopy" },
              { id: "rate",  label: "Fuel-scaled Rate", sub: "FRED diesel" },
              { id: "cost",  label: "Haul Cost", sub: "per bushel" },
              { id: "net",   label: "Net Revenue", sub: "per buyer", variant: "output" },
            ]}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Cost formula
          </p>
          <FormulaBox>
            <BlockMath math="C_{\text{transport}} = d \times \!\underbrace{\left(0.030 + 0.012 \times \frac{d_{\text{diesel}}}{3.80}\right)}_{\text{rate \$/bu/mile}}\! \times Q" />
          </FormulaBox>
          <p className="text-sm text-zinc-500 mt-2">
            At reference diesel ($3.80/gal) the effective rate is{" "}
            <Highlight>$0.042 /bu/mile</Highlight> — the industry benchmark. At $5.40/gal: ≈ $0.047/bu/mile.
          </p>
        </div>

        <div className="space-y-3">
          <Term tex="d" label="Distance">
            Driving miles computed from farm and buyer addresses.
          </Term>
          <Term tex="d_{\text{diesel}}" label="Live diesel">
            Regional diesel price from FRED — PADD region matched to the farm's state (e.g. GASD2SW for Midwest). Falls back to national GASDESW. Updated every request.
          </Term>
          <Term tex="Q" label="Quantity">Your total bushels. Haul cost scales linearly.</Term>
        </div>

        <Separator className="bg-zinc-100" />

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Transport arbitrage
          </p>
          <FormulaBox>
            <BlockMath math="V_{\text{transport}} = \text{net}_{\text{this buyer}} - \text{net}_{\text{nearest buyer}}" />
          </FormulaBox>
          <p className="text-sm text-zinc-500 mt-2">
            Positive → driving farther is worth it. Negative → closer buyer wins after fuel.
          </p>
        </div>
      </Section>

      {/* ── EV Model ─────────────────────────────────────────────────────────── */}
      <Section icon={<BarChart2 className="w-4 h-4" />} title="Scenario Expected Value Model">
        <p className="text-sm text-zinc-500 leading-relaxed">
          Evaluates every decision path — sell now, wait, or store — using{" "}
          <Highlight>expected value</Highlight>. Accounts for what the market is likely to do,
          what it costs to execute, and how much downside risk you carry.
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Decision pipeline
          </p>
          <FlowGraph
            nodes={[
              { id: "scenarios", label: "All Scenarios", sub: "sell / wait / store", variant: "dim" },
              { id: "er",        label: "E[Revenue]", sub: "seasonal + momentum" },
              { id: "cost",      label: "− Costs", sub: "transport + storage" },
              { id: "risk",      label: "− Risk", sub: "1.5σ × Q" },
              { id: "ev",        label: "EV(a)", sub: "per scenario" },
              { id: "best",      label: "Best Action", sub: "highest EV", variant: "output" },
            ]}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Core formula
          </p>
          <FormulaBox>
            <BlockMath math="\text{EV}(a) = \underbrace{\mathbb{E}[R(a)]}_{\text{expected revenue}} - \underbrace{C(a)}_{\text{all costs}} - \underbrace{1.5\,\sigma \cdot Q}_{\text{downside risk proxy}}" />
          </FormulaBox>
        </div>

        <div className="space-y-3">
          <Term tex="\mathbb{E}[R(a)]" label="Expected revenue">
            Sell now: exact <InlineMath math="P \times Q - C_{\text{transport}}" />. Wait scenarios:{" "}
            <InlineMath math="\text{best\_net} \times (1 + r_{\text{seasonal}} + 0.5 \cdot r_{\text{momentum}} \cdot n_w)" />.
          </Term>
          <Term tex="C(a)" label="All costs">
            Transport (sell now) + storage at $0.015–$0.040/bu/mo + opportunity cost
            (T-bill rate × deferred cash × holding months).
          </Term>
          <Term tex="\sigma" label="Price std dev">
            Seasonal return standard deviation for the holding period. Wider for longer waits — uncertainty grows with time horizon.
          </Term>
        </div>

        <Separator className="bg-zinc-100" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Scenarios produced
            </p>
            <div className="space-y-1.5">
              {([
                ["Sell Now (× buyers)", "Exact net revenue. Zero uncertainty."],
                ["Wait 1 Week", "1-week seasonal return + 50% momentum decay."],
                ["Wait 1 Month", "4-week horizon. Wider uncertainty band."],
                ["Store + Hedge", "Lock futures price, hold physical grain. Basis risk remains — modeled at 50% convergence to delivery. Storage + commission costs apply."],
              ] as [string, string][]).map(([name, desc]) => (
                <div key={name} className="text-sm">
                  <span className="font-medium text-zinc-700">{name}: </span>
                  <span className="text-zinc-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              Storage constants
            </p>
            <Row label="On-farm storage" value="$0.015 / bu / mo" />
            <Row label="Commercial elevator" value="$0.040 / bu / mo" />
            <Row label="Hedge commission" value="$0.015 / bu" />
            <Row label="Opportunity cost rate" value="T-bill (3mo) via FRED" />
          </div>
        </div>
      </Section>

      {/* ── MPI ──────────────────────────────────────────────────────────────── */}
      <Section icon={<Activity className="w-4 h-4" />} title="Market Pressure Index (MPI)">
        <p className="text-sm text-zinc-500 leading-relaxed">
          A composite score from <Highlight>−1 to +1</Highlight> summarizing whether market forces
          are currently pushing prices up or down. Five independent signals are each normalized to
          [−1, +1] and combined by importance-weighted sum.
        </p>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Signal aggregation pipeline
          </p>
          <FanInGraph
            inputs={[
              { label: "X₁ — Futures momentum",    weight: "0.30" },
              { label: "X₂ — Inventory imbalance", weight: "0.25" },
              { label: "X₃ — Basis widening",      weight: "0.20" },
              { label: "X₄ — Weather disruption",  weight: "0.15" },
              { label: "X₅ — Export demand",       weight: "0.10" },
            ]}
            centerTex="\sum_{i=1}^{5} w_i \cdot X_i"
            output={["Bullish", "Neutral", "Bearish"]}
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Weighted sum formula
          </p>
          <FormulaBox>
            <BlockMath math="\text{MPI} = 0.30\,X_1 + 0.25\,X_2 + 0.20\,X_3 + 0.15\,X_4 + 0.10\,X_5 \;\in\; [-1,\;+1]" />
          </FormulaBox>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500">
                <th className="text-left pb-2 pr-4 font-medium">Signal</th>
                <th className="text-left pb-2 pr-4 font-medium">Weight</th>
                <th className="text-left pb-2 pr-4 font-medium">Source</th>
                <th className="text-left pb-2 font-medium">Normalization to [−1, +1]</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["X₁ — Futures momentum",    "0.30", "yfinance 20-day slope",        "±2%/week maps to ±1.0"],
                ["X₂ — Inventory imbalance", "0.25", "Basis deviation proxy",         "Inverted: tight supply = +1"],
                ["X₃ — Basis widening",      "0.20", "USDA / FRED regional basis",    "±$0.25/bu from norm = ±1.0"],
                ["X₄ — Weather disruption",  "0.15", "NOAA NWS 7-day forecast",       "0.0 (calm) → 1.0 (severe)"],
                ["X₅ — Export demand",       "0.10", "Momentum × basis concordance",  "Avg of X₁ and X₃ signals"],
              ] as [string, string, string, string][]).map(([sig, w, src, norm]) => (
                <tr key={sig} className="border-b border-zinc-50 last:border-0">
                  <td className="py-2 pr-4 font-medium text-zinc-700">{sig}</td>
                  <td className="py-2 pr-4 font-mono font-semibold text-zinc-700">{w}</td>
                  <td className="py-2 pr-4 text-zinc-600">{src}</td>
                  <td className="py-2 text-zinc-600">{norm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Separator className="bg-zinc-100" />

        <div className="grid grid-cols-3 gap-3">
          {([
            ["Bullish",  "MPI ≥ +0.15",         "border-emerald-200 bg-emerald-50 text-emerald-700"],
            ["Neutral",  "−0.15 < MPI < +0.15",  "border-zinc-200 bg-zinc-50 text-zinc-600"],
            ["Bearish",  "MPI ≤ −0.15",          "border-red-200 bg-red-50 text-red-600"],
          ] as [string, string, string][]).map(([label, rule, cls]) => (
            <div key={label} className={`rounded-md border px-3 py-3 text-center ${cls}`}>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs font-mono mt-0.5">{rule}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-zinc-500">
          Rate overlay: T-bill &gt; 5% applies a −0.10 penalty (high carry cost pressures selling).
          T-bill &lt; 3% applies +0.05 (cheap money makes storage relatively affordable).
        </p>
      </Section>

      {/* ── Data Sources ─────────────────────────────────────────────────────── */}
      <Section icon={<Database className="w-4 h-4" />} title="Data Sources">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-xs uppercase tracking-wider text-zinc-500">
                <th className="text-left pb-2 pr-4 font-medium">Source</th>
                <th className="text-left pb-2 pr-4 font-medium">Data</th>
                <th className="text-left pb-2 font-medium">Used In</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["yfinance (CBOT)",      "Corn / soy / wheat front-month futures",                          "Fair price, scenarios, MPI"],
                ["FRED (St. Louis Fed)", "PADD regional diesel (e.g. GASD2SW), T-bill (DTB3)",            "Transport cost, storage opportunity cost, MPI"],
                ["NOAA NWS",            "7-day forecast at farm lat/lon",                                  "Weather premium, MPI signal"],
                ["USDA Market News",    "State-specific cash bid (routed by farm location)",               "Regional basis in fair price model"],
                ["Nominatim (OSM)",     "Farm address → state, lat/lon",                                   "PADD diesel routing, USDA report selection, nearby elevators"],
                ["Google Maps / geopy", "Driving distance farm → each buyer",                              "Transport cost, buyer ranking"],
                ["RSS ag feeds",        "DTN, USDA, Reuters headlines",                                    "Market dashboard news panel"],
              ] as [string, string, string][]).map(([src, data, usedIn]) => (
                <tr key={src} className="border-b border-zinc-50 last:border-0">
                  <td className="py-2 pr-4 text-zinc-700 font-semibold align-top">{src}</td>
                  <td className="py-2 pr-4 text-zinc-600 align-top">{data}</td>
                  <td className="py-2 text-zinc-600 align-top">{usedIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>


    </div>
  );
}
