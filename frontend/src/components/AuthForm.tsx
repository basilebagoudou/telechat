"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Spinner from "./Spinner";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split("@")[0] } },
      });
      if (error) setError(error.message);
      else router.push("/chat");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push("/chat");
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      {mode === "signup" && (
        <input
          type="text"
          placeholder="Nom affiché"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-xl bg-tg-row-hover px-4 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-tg-blue/40"
        />
      )}
      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-xl bg-tg-row-hover px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tg-blue/40"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-xl bg-tg-row-hover px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-tg-blue/40"
      />
      {error && <p className="animate-modal-in text-sm text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-tg-blue px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:bg-tg-blue-dark active:scale-[0.98] disabled:opacity-50"
      >
        {loading && <Spinner />}
        {mode === "signup" ? "Créer un compte" : "Se connecter"}
      </button>
    </form>
  );
}
