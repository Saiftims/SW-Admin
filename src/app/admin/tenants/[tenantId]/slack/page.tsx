"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function SlackConfigPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    botToken: "",
    signingSecret: "",
    appToken: "",
  });

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/tenants/${tenantId}/slack`);
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
      const res = await fetch(`/api/tenants/${tenantId}/slack`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          botToken: form.botToken,
          signingSecret: form.signingSecret,
          appToken: form.appToken || undefined,
        }),
      });
      if (res.ok) {
        setMessage("Slack configuration saved. Restart the worker to connect the bot.");
        setForm({ botToken: "", signingSecret: "", appToken: "" });
        const data = await fetch(`/api/tenants/${tenantId}/slack`).then((r) => r.json());
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
        <h1 style={{ marginBottom: 6 }}>Slack Integration</h1>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div style={{ height: 16 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : null}

      {config && !loading ? (
        <div className="card" style={{ marginBottom: 16, padding: 18 }}>
          <div style={{ fontWeight: 750, marginBottom: 10 }}>Current Configuration</div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7 }}>
            <div>Bot Token: <span style={{ color: "var(--brand)" }}>{config.botTokenEncrypted}</span></div>
            <div>Signing Secret: <span style={{ color: "var(--brand)" }}>{config.signingSecretEncrypted}</span></div>
            <div>Status: <span style={{ color: config.verificationStatus === "HEALTHY" ? "var(--success)" : "var(--warning)" }}>{config.verificationStatus}</span></div>
            {config.errorMessage && <div style={{ color: "var(--danger)", marginTop: 4 }}>{config.errorMessage}</div>}
          </div>
          <div style={{ marginTop: 12, padding: 12, background: "rgba(110, 231, 255, 0.06)", borderRadius: 10, border: "1px solid rgba(110, 231, 255, 0.12)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>WEBHOOK URL (set this in your Slack app → Event Subscriptions → Request URL)</div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--brand)", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/slack` : "/api/webhooks/slack"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ fontWeight: 750, marginBottom: 6 }}>
          {config ? "Update Slack Credentials" : "Connect Slack"}
        </div>
        <div className="hint" style={{ marginBottom: 14 }}>
          Create a Slack app at <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>api.slack.com/apps</a>.
          Add bot scopes: <strong>chat:write, app_mentions:read, im:history, im:read, im:write, files:read</strong>.
          Then enable <strong>Event Subscriptions</strong> and set the Request URL to the webhook shown above.
          Subscribe to bot events: <strong>message.im, message.channels, app_mention</strong>.
        </div>

        <form onSubmit={onSave}>
          <label className="fieldLabel">Bot User OAuth Token (xoxb-...)</label>
          <input
            value={form.botToken}
            onChange={(e) => setForm({ ...form, botToken: e.target.value })}
            placeholder="xoxb-..."
            type="password"
          />
          <div style={{ height: 10 }} />

          <label className="fieldLabel">Signing Secret</label>
          <input
            value={form.signingSecret}
            onChange={(e) => setForm({ ...form, signingSecret: e.target.value })}
            placeholder="Signing secret from app settings"
            type="password"
          />

          {message ? (
            <div style={{ marginTop: 12, color: message.includes("saved") ? "var(--success)" : "var(--danger)", fontSize: 13 }}>
              {message}
            </div>
          ) : null}

          <div style={{ height: 14 }} />
          <button className="btn btnPrimary" type="submit" disabled={!form.botToken || !form.signingSecret || saving}>
            {saving ? "Saving..." : "Save Slack config"}
          </button>
        </form>
      </div>
    </div>
  );
}
