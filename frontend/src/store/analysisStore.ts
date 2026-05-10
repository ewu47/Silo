import { create } from "zustand";
import { analyze } from "@/lib/api";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

interface AnalysisState {
  status: "idle" | "loading" | "success" | "error";
  request: AnalyzeRequest | null;
  response: AnalyzeResponse | null;
  error: string | null;
  submitAnalysis: (req: AnalyzeRequest) => Promise<void>;
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  status: "idle",
  request: null,
  response: null,
  error: null,

  submitAnalysis: async (req: AnalyzeRequest) => {
    set({ status: "loading", request: req, error: null, response: null });
    try {
      const response = await analyze(req);
      set({ status: "success", response });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  },

  reset: () =>
    set({ status: "idle", request: null, response: null, error: null }),
}));
