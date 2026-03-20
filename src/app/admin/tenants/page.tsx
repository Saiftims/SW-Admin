"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TenantListItem = {
  id: string;
  name: string;
  onboardingStatus: string;
  updatedAt: string;
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/tenants");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to load tenants.");
        }
        const data = await res.json();
        if (mounted) setTenants(data.tenants ?? []);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Failed to load tenants.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Tenants</h1>
          <div style={{ color: "var(--muted)", lineHeight: 1.5 }}>Onboard firms and manage per-customer bot instances.</div>
        </div>
        <Link href="/admin/tenants/new" className="btn btnPrimary">
          Create tenant
        </Link>
      </div>

      <div style={{ height: 18 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {!loading && !error && tenants.length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          No tenants yet. Start with the premium onboarding flow.
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {tenants.map((t) => (
          <Link key={t.id} href={`/admin/tenants/${t.id}`} className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 750 }}>{t.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                  Status: <span style={{ color: "var(--brand)" }}>{t.onboardingStatus}</span>
                </div>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Updated: {new Date(t.updatedAt).toLocaleString()}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

