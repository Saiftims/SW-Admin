"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function TwilioConfigPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    accountSid: "",
    authToken: "",
    phoneNumber: "",
  });

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/tenants/${tenantId}/twilio`);
      const data = await res.json();
      setConfig(data.config);
      setLoading(false);
    })();
  }, [tenantId]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/twilio`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMessage("Twilio configuration saved.");
        setForm({ accountSid: "", authToken: "", phoneNumber: "" });
        const data = await fetch(`/api/tenants/${tenantId}/twilio`).then((r) => r.json());
        setConfig(data.config);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data?.error ?? "Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ marginBottom: 6 }}>SMS / Twilio Integration</h1>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div style={{ height: 16 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : null}

      {config && !loading ? (
        <div className="card" style={{ marginBottom: 16, padding: 18 }}>
          <div style={{ fontWeight: 750, marginBottom: 10 }}>Current Configuration</div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
            <div>Account SID: <span style={{ color: "var(--brand)" }}>{config.accountSid}</span></div>
            <div>Auth Token: <span style={{ color: "var(--brand)" }}>{config.authToken}</span></div>
            <div>Phone Number: <span style={{ color: "var(--brand)" }}>{config.phoneNumber}</span></div>
            <div>Status: <span style={{ color: config.verificationStatus === "HEALTHY" ? "var(--success)" : "var(--warning)" }}>{config.verificationStatus}</span></div>
            {config.errorMessage && <div style={{ color: "var(--danger)", marginTop: 4 }}>{config.errorMessage}</div>}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ fontWeight: 750, marginBottom: 6 }}>
          {config ? "Update Twilio Credentials" : "Connect Twilio SMS"}
        </div>
        <div className="hint" style={{ marginBottom: 14 }}>
          Create a Twilio account at <a href="https://www.twilio.com" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>twilio.com</a>.
          Get a phone number, then enter your Account SID, Auth Token, and Twilio number below.
          Configure the webhook URL for your number to point to <span style={{ color: "var(--brand)", fontFamily: "monospace", fontSize: 12 }}>/api/webhooks/twilio</span>.
        </div>

        <form onSubmit={onSave}>
          <label className="fieldLabel">Account SID (ACxxxxxxxx...)</label>
          <input
            value={form.accountSid}
            onChange={(e) => setForm({ ...form, accountSid: e.target.value })}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <div style={{ height: 10 }} />

          <label className="fieldLabel">Auth Token</label>
          <input
            value={form.authToken}
            onChange={(e) => setForm({ ...form, authToken: e.target.value })}
            placeholder="Auth token from Twilio console"
            type="password"
          />
          <div style={{ height: 10 }} />

          <label className="fieldLabel">Twilio Phone Number (+1...)</label>
          <input
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
            placeholder="+13187442046"
          />

          {message ? (
            <div style={{ marginTop: 12, color: message.includes("saved") ? "var(--success)" : "var(--danger)", fontSize: 13 }}>
              {message}
            </div>
          ) : null}

          <div style={{ height: 14 }} />
          <button className="btn btnPrimary" type="submit" disabled={!form.accountSid || !form.authToken || !form.phoneNumber || saving}>
            {saving ? "Saving..." : "Save Twilio config"}
          </button>
        </form>
      </div>
    </div>
  );
}
