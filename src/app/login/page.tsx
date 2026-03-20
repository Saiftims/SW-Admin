"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.length > 0, [email, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Login failed.");
        return;
      }
      router.push("/admin/tenants");
    } catch (err) {
      setError("Login failed (network error).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 520, margin: "56px auto" }}>
        <h1 style={{ marginTop: 0, marginBottom: 6 }}>Silent Witness Admin</h1>
        <div style={{ color: "var(--muted)", marginBottom: 18, lineHeight: 1.5 }}>
          Sign in to onboard firms, provision Clawdbot, and manage tenant integrations.
        </div>

        <form onSubmit={onSubmit}>
          <label className="fieldLabel" htmlFor="email">
            Email
          </label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />

          <div style={{ height: 12 }} />

          <label className="fieldLabel" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error ? <div className="error">{error}</div> : null}

          <div style={{ height: 16 }} />

          <button className="btn btnPrimary" disabled={!canSubmit || busy} type="submit">
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

