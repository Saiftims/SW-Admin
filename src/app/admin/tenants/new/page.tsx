"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const countryOptions = ["United States"];

export default function NewTenantPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    counselorType: "",
    lawFirmName: "",
    billingEmail: "",
    phoneNumber: "",
    streetAddress: "",
    city: "",
    state: "",
    zipCode: "",
    country: "United States"
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.counselorType.trim() &&
      form.lawFirmName.trim() &&
      form.billingEmail.trim() &&
      form.phoneNumber.trim() &&
      form.streetAddress.trim() &&
      form.city.trim() &&
      form.state.trim() &&
      form.zipCode.trim() &&
      form.country.trim()
    );
  }, [form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please complete all required fields.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Failed to create tenant.");
        return;
      }
      const data = await res.json();
      router.push(`/admin/tenants/${data.tenantId}`);
    } catch {
      setError("Failed to create tenant (network error).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 6 }}>Onboard a new customer</h1>
      <div style={{ color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
        Subscription Setup / User Information (step 1). Provisioning and memory generation happen asynchronously.
      </div>

      <div className="card" style={{ maxWidth: 880 }}>
        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label className="fieldLabel">First Name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">Last Name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">Counselor Type</label>
              <input
                value={form.counselorType}
                onChange={(e) => setForm({ ...form, counselorType: e.target.value })}
                placeholder="e.g., Attorney"
              />
            </div>
            <div>
              <label className="fieldLabel">Law Firm Name</label>
              <input
                value={form.lawFirmName}
                onChange={(e) => setForm({ ...form, lawFirmName: e.target.value })}
                placeholder="e.g., Johnson & Associates"
              />
            </div>
            <div>
              <label className="fieldLabel">Billing Email</label>
              <input
                value={form.billingEmail}
                onChange={(e) => setForm({ ...form, billingEmail: e.target.value })}
                type="email"
              />
            </div>
            <div>
              <label className="fieldLabel">Phone Number</label>
              <input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
            </div>
          </div>

          <div style={{ height: 16 }} />

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.4fr 1fr" }}>
            <div>
              <label className="fieldLabel">Street Address</label>
              <input value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">Country</label>
              <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label className="fieldLabel">City</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">State</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div>
              <label className="fieldLabel">ZIP Code</label>
              <input value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} />
            </div>
          </div>

          {error ? <div className="error" style={{ marginTop: 14 }}>{error}</div> : null}

          <div style={{ height: 18 }} />

          <button className="btn btnPrimary" type="submit" disabled={!canSubmit || busy}>
            {busy ? "Creating tenant..." : "Create tenant"}
          </button>
        </form>
      </div>
    </div>
  );
}

