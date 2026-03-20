"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type FirmData = {
  counselorType: string;
  lawFirmName: string;
  billingEmail: string;
  phoneNumber: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
};

type TenantDetail = {
  id: string;
  name: string;
  onboardingStatus: string;
  defaultAnalysisStrategy: string;
  firm?: FirmData | null;
  clawdbotInstance?: {
    provisioningState: string;
    errorMessage?: string | null;
    externalInstanceId?: string | null;
  } | null;
  slackConfigs?: { id: string; verificationStatus: string }[];
  emailConfigs?: { id: string; enabled: boolean }[];
  twilioConfig?: { id: string; phoneNumber: string; verificationStatus: string } | null;
};

const statusColor: Record<string, string> = {
  ACTIVE: "var(--success)",
  PENDING: "var(--warning)",
  REQUIRES_ACTION: "var(--warning)",
  LIVE: "var(--success)",
  HEALTHY: "var(--success)",
  UNKNOWN: "var(--muted)",
  ERROR: "var(--danger)",
  FAILED: "var(--danger)",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
      background: `color-mix(in srgb, ${statusColor[status] ?? "var(--muted)"} 15%, transparent)`,
      color: statusColor[status] ?? "var(--muted)",
      border: `1px solid color-mix(in srgb, ${statusColor[status] ?? "var(--muted)"} 30%, transparent)`,
    }}>
      {status}
    </span>
  );
}

function FirmField({ label, value, editing, field, form, setForm }: {
  label: string; value: string; editing: boolean; field: string;
  form: Record<string, string>; setForm: (f: Record<string, string>) => void;
}) {
  return (
    <div>
      <label className="fieldLabel">{label}</label>
      {editing ? (
        <input value={form[field] ?? ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
      ) : (
        <div style={{ padding: "10px 0 4px", color: "var(--text)", fontSize: 14 }}>{value || "—"}</div>
      )}
    </div>
  );
}

function FirmEditor({ tenantId, firm, onSaved }: { tenantId: string; firm: FirmData; onSaved: (f: FirmData) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    lawFirmName: firm.lawFirmName,
    counselorType: firm.counselorType,
    billingEmail: firm.billingEmail,
    phoneNumber: firm.phoneNumber,
    streetAddress: firm.streetAddress,
    city: firm.city,
    state: firm.state,
    zipCode: firm.zipCode,
    country: firm.country ?? "United States",
  });

  function onCancel() {
    setForm({
      lawFirmName: firm.lawFirmName,
      counselorType: firm.counselorType,
      billingEmail: firm.billingEmail,
      phoneNumber: firm.phoneNumber,
      streetAddress: firm.streetAddress,
      city: firm.city,
      state: firm.state,
      zipCode: firm.zipCode,
      country: firm.country ?? "United States",
    });
    setEditing(false);
    setMessage(null);
  }

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/firm`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved(data.firm);
        setEditing(false);
        setMessage("Firm information updated.");
        setTimeout(() => setMessage(null), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 750 }}>Firm Information</div>
        <div style={{ display: "flex", gap: 6 }}>
          {editing ? (
            <>
              <button className="btn" onClick={onCancel} disabled={saving} style={{ fontSize: 12, padding: "5px 10px" }}>Cancel</button>
              <button className="btn btnPrimary" onClick={onSave} disabled={saving} style={{ fontSize: 12, padding: "5px 10px" }}>
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setEditing(true)} style={{ fontSize: 12, padding: "5px 10px" }}>Edit</button>
          )}
        </div>
      </div>

      {message ? <div style={{ marginBottom: 10, fontSize: 13, color: message.includes("updated") ? "var(--success)" : "var(--danger)" }}>{message}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <FirmField label="Law Firm Name" value={firm.lawFirmName} editing={editing} field="lawFirmName" form={form} setForm={setForm} />
        <FirmField label="Counselor Type" value={firm.counselorType} editing={editing} field="counselorType" form={form} setForm={setForm} />
        <FirmField label="Billing Email" value={firm.billingEmail} editing={editing} field="billingEmail" form={form} setForm={setForm} />
        <FirmField label="Phone Number" value={firm.phoneNumber} editing={editing} field="phoneNumber" form={form} setForm={setForm} />
        <FirmField label="Street Address" value={firm.streetAddress} editing={editing} field="streetAddress" form={form} setForm={setForm} />
        <FirmField label="City" value={firm.city} editing={editing} field="city" form={form} setForm={setForm} />
        <FirmField label="State" value={firm.state} editing={editing} field="state" form={form} setForm={setForm} />
        <FirmField label="ZIP Code" value={firm.zipCode} editing={editing} field="zipCode" form={form} setForm={setForm} />
        <FirmField label="Country" value={firm.country ?? "United States"} editing={editing} field="country" form={form} setForm={setForm} />
      </div>
    </div>
  );
}

export default function TenantDetailPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to load tenant.");
        }
        const data = await res.json();
        if (mounted) setTenant(data.tenant);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Failed to load tenant.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [tenantId]);

  const slackStatus = tenant?.slackConfigs?.[0]?.verificationStatus ?? "NOT_CONNECTED";
  const botStatus = tenant?.clawdbotInstance?.provisioningState ?? "NOT_STARTED";

  return (
    <div className="container">
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{tenant?.name ?? "Tenant"}</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            ID: <span style={{ fontFamily: "monospace", color: "var(--brand)" }}>{tenantId.slice(0, 12)}...</span>
          </div>
        </div>
        <Link className="btn" href="/admin/tenants">All tenants</Link>
      </div>

      <div style={{ height: 18 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {tenant && !loading ? (
        <>
          {/* Status cards */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div className="card">
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Tenant Status</div>
              <StatusBadge status={tenant.onboardingStatus} />
            </div>
            <div className="card">
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Bot Instance</div>
              <StatusBadge status={botStatus} />
            </div>
            <div className="card">
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Slack</div>
              <StatusBadge status={slackStatus} />
            </div>
            <div className="card">
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>SMS / Twilio</div>
              <StatusBadge status={tenant.twilioConfig?.verificationStatus ?? "NOT_CONNECTED"} />
            </div>
          </div>

          <div style={{ height: 16 }} />

          {/* Firm details — editable */}
          {tenant.firm ? (
            <FirmEditor tenantId={tenantId} firm={tenant.firm} onSaved={(updated) => setTenant({ ...tenant, firm: updated, name: updated.lawFirmName })} />
          ) : null}

          {/* Bot config */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr", marginBottom: 12 }}>
            <Link href={`/admin/tenants/${tenantId}/personality`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>🎭 Bot Personality</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Define the bot's tone, style, and behavior. Applied to every Slack, SMS, and email response.
              </div>
              <div style={{ marginTop: 10, color: "var(--brand)", fontSize: 13 }}>Edit personality →</div>
            </Link>

            <Link href={`/admin/tenants/${tenantId}/memory`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>🧠 Bot Memory</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Knowledge base, conversation history, and firm context. The bot remembers past interactions.
              </div>
              <div style={{ marginTop: 10, color: "var(--brand)", fontSize: 13 }}>View memory →</div>
            </Link>
          </div>

          {/* Integration links */}
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
            <Link href={`/admin/tenants/${tenantId}/slack`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Slack Integration</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Configure Slack bot credentials and webhook connection.
              </div>
              <div style={{ marginTop: 10, color: "var(--brand)", fontSize: 13 }}>Configure →</div>
            </Link>

            <Link href={`/admin/tenants/${tenantId}/twilio`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>SMS / Twilio</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                {tenant.twilioConfig
                  ? <>Connected: <span style={{ color: "var(--brand)" }}>{tenant.twilioConfig.phoneNumber}</span>. Text crash photos to get analysis.</>
                  : "Configure Twilio credentials and phone number for SMS-based crash analysis."
                }
              </div>
              <div style={{ marginTop: 10, color: "var(--brand)", fontSize: 13 }}>Configure →</div>
            </Link>

            <Link href={`/admin/tenants/${tenantId}/email-template`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Email Template</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Edit the branded HTML email template sent after crash analysis.
              </div>
              <div style={{ marginTop: 10, color: "var(--brand)", fontSize: 13 }}>Edit template →</div>
            </Link>

            <div className="card">
              <div style={{ fontWeight: 750, marginBottom: 6 }}>Email Ingestion</div>
              <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Emails with crash photos to <span style={{ color: "var(--brand)" }}>saif.altimims@gmail.com</span> are automatically polled and analyzed.
              </div>
              <div style={{ marginTop: 10, color: "var(--success)", fontSize: 12 }}>
                ● Polling every 60s
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
