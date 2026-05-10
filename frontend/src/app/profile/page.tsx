"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, User, Wheat, Clock, ChevronDown, ChevronUp, Loader2, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getProfile, updateProfile, listAnalyses } from "@/lib/api";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { UserProfile, SavedAnalysis } from "@/lib/types";
import AddressAutocomplete, { toAddressString, fromAddressString, type AddressValue } from "@/components/AddressAutocomplete";

// ── Auth form ─────────────────────────────────────────────────────────────────

function AuthForm({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Account created — prompt them to sign in
        setSuccess("Account created! Sign in to continue.");
        setPassword("");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="bg-white rounded-2xl border border-zinc-200 p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <User className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-900">
            {mode === "signin" ? "Sign in to Silo" : "Create account"}
          </h2>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full h-10 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full h-10 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              placeholder="••••••••"
            />
          </div>
          {success && <p className="text-sm text-emerald-600 font-medium">{success}</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setSuccess(null); }}
          className="w-full text-center text-sm text-zinc-400 hover:text-zinc-600 mt-4 transition-colors"
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ── Saved analysis card ───────────────────────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: SavedAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const r = analysis.response_json;
  const recommended = r.scenarios?.find((s) => s.recommended);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Wheat className="w-4 h-4 text-zinc-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-zinc-900 capitalize">{r.commodity} — {r.quantity_bu?.toLocaleString()} bu</p>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(analysis.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {analysis.farm_address && ` · ${analysis.farm_address}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {recommended && (
            <span className="text-xs font-medium text-zinc-500 hidden sm:block">
              {recommended.label}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-zinc-100 pt-4 space-y-4">
          {/* LLM explanation */}
          {r.llm_explanation && (
            <p className="text-sm text-zinc-600 leading-relaxed">{r.llm_explanation}</p>
          )}

          {/* Fair price */}
          {r.fair_price && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-0.5">Fair price</p>
                <p className="text-sm font-semibold text-zinc-900">${r.fair_price.p_fair?.toFixed(3)}/bu</p>
              </div>
              <div className="bg-zinc-50 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-0.5">Best buyer</p>
                <p className="text-sm font-semibold text-zinc-900 truncate">{r.best_buyer}</p>
              </div>
              <div className="bg-zinc-50 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-0.5">Market</p>
                <p className={`text-sm font-semibold capitalize ${
                  r.market_signals?.mpi === "bullish" ? "text-emerald-600"
                  : r.market_signals?.mpi === "bearish" ? "text-red-500"
                  : "text-zinc-500"
                }`}>{r.market_signals?.mpi}</p>
              </div>
            </div>
          )}

          {/* Top scenarios */}
          {r.scenarios && r.scenarios.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Scenarios</p>
              <div className="space-y-1">
                {r.scenarios.slice(0, 4).map((s) => (
                  <div key={s.label} className={`flex items-center justify-between py-1.5 px-3 rounded-md ${s.recommended ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-700"}`}>
                    <span className="text-xs">{s.label}</span>
                    <span className="text-xs font-semibold tabular-nums">
                      ${s.expected_value?.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Profile page ──────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [farmAddr, setFarmAddr] = useState<AddressValue>({ street: "", city: "", state: "", zip: "" });
  const [addressVerified, setAddressVerified] = useState(false);
  const [prefCommodity, setPrefCommodity] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) loadUserData(data.session!.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session) loadUserData(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(token: string) {
    setLoadingData(true);
    try {
      const [p, a] = await Promise.all([
        getProfile(token).catch(() => null),
        listAnalyses(token, undefined, 20).catch(() => []),
      ]);
      if (p) {
        setProfile(p);
        if (p.farm_address) {
          setFarmAddr(fromAddressString(p.farm_address));
          setAddressVerified(true);
        }
        setPrefCommodity(p.preferred_commodity ?? "");
      }
      setAnalyses(a);
    } finally {
      setLoadingData(false);
    }
  }

  async function saveProfile() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    setSavingProfile(true);
    setProfileMsg(null);

    try {
      const farmAddressStr = toAddressString(farmAddr);
      await updateProfile({
        farm_address: farmAddressStr || undefined,
        preferred_commodity: (prefCommodity || undefined) as "corn" | "soybeans" | "wheat" | undefined,
      }, data.session.access_token);
      setProfileMsg("Saved.");
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/landing");
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => router.push("/landing")} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold text-zinc-900">Your Profile</h1>
          </div>
          <AuthForm onAuth={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/landing")} className="text-zinc-400 hover:text-zinc-700 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <User className="w-5 h-5 text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-900">Your Profile</h1>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile settings */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Account</p>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-zinc-900 flex items-center justify-center text-white text-sm font-semibold">
                  {user.email?.[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{user.email}</p>
                  <p className="text-xs text-zinc-400">Member since {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-zinc-200 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Farm settings</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Farm address</label>
                  <AddressAutocomplete
                    value={farmAddr}
                    onChange={(addr, verified) => {
                      setFarmAddr(addr);
                      setAddressVerified(verified);
                    }}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">Preferred commodity</label>
                  <select
                    value={prefCommodity}
                    onChange={(e) => setPrefCommodity(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 bg-white"
                  >
                    <option value="">None</option>
                    <option value="corn">Corn</option>
                    <option value="soybeans">Soybeans</option>
                    <option value="wheat">Wheat</option>
                  </select>
                </div>
                <button
                  onClick={saveProfile}
                  disabled={savingProfile || (!!toAddressString(farmAddr).trim() && !addressVerified)}
                  className="w-full h-9 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save
                </button>
                {profileMsg && (
                  <p className={`text-xs text-center ${profileMsg === "Saved." ? "text-emerald-600" : "text-red-500"}`}>
                    {profileMsg}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => router.push("/")}
              className="w-full flex items-center justify-center gap-2 h-10 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Eye className="w-4 h-4" /> Go to dashboard
            </button>
          </div>

          {/* Saved analyses */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Saved analyses ({analyses.length})
              </p>
            </div>
            {loadingData ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              </div>
            ) : analyses.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
                <Wheat className="w-8 h-8 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">No saved analyses yet.</p>
                <p className="text-xs text-zinc-300 mt-1">Run an analysis on the dashboard and save it to see it here.</p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-4 text-sm text-zinc-600 hover:text-zinc-900 underline underline-offset-2 transition-colors"
                >
                  Go to dashboard
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {analyses.map((a) => <AnalysisCard key={a.id} analysis={a} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
