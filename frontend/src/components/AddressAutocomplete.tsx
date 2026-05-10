"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, MapPin, CheckCircle2 } from "lucide-react";

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    neighbourhood?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

const STATE_ABBR: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
  "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
  "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
  "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
  "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
  "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

function abbrevState(s: string | undefined): string {
  if (!s) return "";
  return STATE_ABBR[s] ?? s;
}

function extractCity(a: NominatimResult["address"]): string {
  return (
    a.city ?? a.town ?? a.village ?? a.hamlet ??
    a.municipality ?? a.suburb ?? a.neighbourhood ?? a.county ?? ""
  );
}

export interface AddressValue {
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface Props {
  value: AddressValue;
  onChange: (value: AddressValue, verified: boolean) => void;
}

const EMPTY: AddressValue = { street: "", city: "", state: "", zip: "" };

export function toAddressString(v: AddressValue): string {
  return [v.street, v.city, v.state, v.zip].filter(Boolean).join(", ");
}

export function fromAddressString(s: string): AddressValue {
  // Best-effort parse "street, city, state zip" or "street, city, state, zip"
  const parts = s.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const last = parts[parts.length - 1];
    const stateZip = last.match(/^([A-Za-z\s]+?)\s*(\d{5}(?:-\d{4})?)?$/)
    return {
      street: parts.slice(0, parts.length - 2).join(", "),
      city:   parts[parts.length - 2],
      state:  stateZip?.[1]?.trim() ?? last,
      zip:    stateZip?.[2] ?? "",
    };
  }
  return { ...EMPTY, street: s };
}

export default function AddressAutocomplete({ value, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const filled = value.street.trim().length > 0 && value.city.trim().length > 0;
    setVerified(filled);
  }, []); // only on mount

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Only the street field drives search — city/state/zip are plain inputs
  function handleStreetChange(street: string) {
    setVerified(false);
    onChange({ ...value, street }, true); // always valid — user can type freely

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (street.trim().length < 6) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(() => fetchSuggestions(street.trim()), 600);
  }

  function handleFieldChange(field: keyof AddressValue, val: string) {
    onChange({ ...value, [field]: val }, true); // always valid — user can type freely
  }

  async function fetchSuggestions(query: string) {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us`,
        { headers: { "Accept-Language": "en" }, signal: abortRef.current.signal }
      );
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }

  function select(s: NominatimResult) {
    const a = s.address;
    const filled: AddressValue = {
      street: [a.house_number, a.road].filter(Boolean).join(" ") || value.street,
      city:   extractCity(a) || value.city,
      state:  abbrevState(a.state) || value.state,
      zip:    a.postcode ?? value.zip,
    };
    setVerified(true);
    onChange(filled, true);
    setSuggestions([]);
    setOpen(false);
  }

  const streetQuery = value.street.trim();

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Street — dropdown anchors here */}
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            value={value.street}
            onChange={(e) => handleStreetChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Street address"
            className={`w-full h-10 rounded-md border px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200 ${
              verified ? "border-emerald-300" : "border-zinc-200"
            }`}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
            {loading
              ? <Loader2 className="w-3.5 h-3.5 text-zinc-300 animate-spin" />
              : verified
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                : <MapPin className="w-3.5 h-3.5 text-zinc-300" />
            }
          </div>
        </div>

        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => {
              const a = s.address;
              const street = [a.house_number, a.road].filter(Boolean).join(" ");
              const city = extractCity(a);
              const state = abbrevState(a.state);
              const zip = a.postcode ?? "";
              return (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={() => select(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 flex items-start gap-2"
                  >
                    <MapPin className="w-3.5 h-3.5 text-zinc-300 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-800 leading-snug">{street || s.display_name.split(",")[0]}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{[city, state, zip].filter(Boolean).join(", ")}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* City / State / ZIP */}
      <div className="grid grid-cols-5 gap-2">
        <input
          type="text"
          value={value.city}
          onChange={(e) => handleFieldChange("city", e.target.value)}
          placeholder="City"
          className="col-span-2 h-10 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <input
          type="text"
          value={value.state}
          onChange={(e) => handleFieldChange("state", e.target.value)}
          placeholder="State"
          className="col-span-1 h-10 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
        <input
          type="text"
          value={value.zip}
          onChange={(e) => handleFieldChange("zip", e.target.value)}
          placeholder="ZIP"
          className="col-span-2 h-10 rounded-md border border-zinc-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
        />
      </div>

    </div>
  );
}
