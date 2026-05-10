"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export default function HeaderAuth() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (user) {
    return (
      <button
        onClick={() => router.push("/profile")}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center text-white text-xs font-semibold">
          {user.email?.[0].toUpperCase()}
        </div>
        <span className="text-sm text-zinc-700 max-w-[140px] truncate hidden sm:block">
          {user.email}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push("/profile")}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-400 transition-colors text-sm text-zinc-600"
    >
      <LogIn className="w-3.5 h-3.5" />
      <span className="hidden sm:block">Sign in</span>
      <User className="w-3.5 h-3.5 sm:hidden" />
    </button>
  );
}
