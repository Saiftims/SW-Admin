"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function PersonalityPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [personality, setPersonality] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/personality`)
      .then((r) => r.json())
      .then((d) => { setPersonality(d.personality ?? ""); setLoading(false); });
  }, [tenantId]);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/tenants/${tenantId}/personality`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personality }),
    });
    if (res.ok) {
      setMessage("Personality saved.");
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage("Failed to save.");
    }
    setSaving(false);
  }

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ marginBottom: 6 }}>Bot Personality</h1>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div className="hint" style={{ marginBottom: 16 }}>
        Define how the bot speaks, its tone, style, and any specific instructions. This is injected into every conversation as the system prompt.
      </div>

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 750 }}>Personality & Style</div>
            <button className="btn btnPrimary" onClick={onSave} disabled={saving} style={{ fontSize: 12, padding: "5px 12px" }}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>

          <textarea
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder={`Example:\n\nYou are a professional crash analysis assistant for Johnson & Associates.\n\nTone: Professional but approachable. Use clear, simple language.\nStyle: Always present data first, then a brief explanation.\nDo: Be concise and confident in presenting the physics.\nDon't: Never give medical advice or legal opinions.\nSign off: End each analysis with "— Silent Witness for Johnson & Associates"`}
            style={{
              minHeight: 350,
              fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          />

          {message ? (
            <div style={{ marginTop: 10, fontSize: 13, color: message.includes("saved") ? "var(--success)" : "var(--danger)" }}>{message}</div>
          ) : null}

          <div className="hint" style={{ marginTop: 12 }}>
            Tips: Define the bot's name, tone (formal/casual), what it should and shouldn't say, and any firm-specific branding.
            This applies to Slack, SMS, and email responses.
          </div>
        </div>
      )}
    </div>
  );
}
