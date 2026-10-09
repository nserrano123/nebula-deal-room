"use client";

import { useEffect, useState } from "react";

/** Signs the owner in once (httpOnly cookie, 30 days). Children render only when signed in. */
export function OwnerGate({ children }: { children: React.ReactNode }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" }).then((r) => r.json()).then((d) => setOwner(Boolean(d.owner))).catch(() => setOwner(false));
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setError(d.error);
    setKey("");
    setOwner(true);
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    setOwner(false);
  }

  if (owner === null) return <div className="h-40 animate-pulse rounded-2xl bg-card" />;
  if (!owner) {
    return (
      <form onSubmit={signIn} className="mx-auto mt-10 max-w-sm space-y-3 rounded-2xl border border-line bg-card p-6">
        <p className="font-serif text-xl">Owner sign-in</p>
        <p className="text-sm text-muted">Enter your owner key once. This browser stays signed in for 30 days.</p>
        <input type="password" autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="Owner key"
          className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent" />
        <button disabled={busy || !key} className="w-full rounded-lg bg-accent px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? "Checking…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-bad">{error}</p>}
      </form>
    );
  }
  return (
    <>
      <div className="mb-4 flex justify-end text-xs text-muted">
        Signed in as owner ·{" "}
        <button onClick={signOut} className="ml-1 underline hover:text-ink">sign out</button>
      </div>
      {children}
    </>
  );
}
