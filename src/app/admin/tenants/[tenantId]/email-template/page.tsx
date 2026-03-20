"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function EmailTemplatePage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [currentHtml, setCurrentHtml] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  async function loadTemplate() {
    const res = await fetch(`/api/tenants/${tenantId}/email-template`);
    const data = await res.json();
    setCurrentHtml(data.currentHtml);
    setPreviewHtml(data.previewHtml);
    setPlaceholders(data.placeholders);
    setVersions(data.versions);
    setLoading(false);
  }

  useEffect(() => {
    loadTemplate();
  }, [tenantId]);

  async function onSave(publish: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/email-template`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ htmlBody: currentHtml, publish }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Version ${data.versionNumber} ${publish ? "published" : "saved as draft"}.`);
        await loadTemplate();
      } else {
        setMessage("Failed to save.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function refreshPreview() {
    const res = await fetch(`/api/tenants/${tenantId}/email-template`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ htmlBody: currentHtml, publish: false }),
    });
    if (res.ok) await loadTemplate();
  }

  return (
    <div className="container" style={{ maxWidth: 1400 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ marginBottom: 0 }}>Email Template Editor</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
          <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back</Link>
        </div>
      </div>

      {loading ? <div style={{ color: "var(--muted)" }}>Loading template...</div> : null}

      {!loading ? (
        <div style={{ display: "grid", gridTemplateColumns: showPreview ? "1fr 1fr" : "1fr", gap: 16 }}>
          {/* Editor panel */}
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>HTML Source</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" onClick={() => onSave(false)} disabled={saving} style={{ fontSize: 12, padding: "6px 10px" }}>
                    Save Draft
                  </button>
                  <button className="btn btnPrimary" onClick={() => onSave(true)} disabled={saving} style={{ fontSize: 12, padding: "6px 10px" }}>
                    Publish
                  </button>
                </div>
              </div>
              <textarea
                value={currentHtml}
                onChange={(e) => setCurrentHtml(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 600,
                  fontFamily: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
                  fontSize: 12,
                  lineHeight: 1.5,
                  border: "none",
                  borderRadius: "0 0 16px 16px",
                  resize: "vertical",
                  padding: 16,
                  background: "rgba(0,0,0,0.3)",
                }}
              />
            </div>

            {message ? (
              <div style={{ marginTop: 10, color: "var(--success)", fontSize: 13 }}>{message}</div>
            ) : null}

            {/* Placeholders reference */}
            <div className="card" style={{ marginTop: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "var(--muted)" }}>AVAILABLE PLACEHOLDERS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {placeholders.map((p) => (
                  <span key={p} style={{ background: "rgba(110, 231, 255, 0.1)", border: "1px solid rgba(110, 231, 255, 0.2)", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontFamily: "monospace" }}>
                    {"{{" + p + "}}"}
                  </span>
                ))}
              </div>
            </div>

            {/* Version history */}
            {versions.length > 0 ? (
              <div className="card" style={{ marginTop: 12, padding: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: "var(--muted)" }}>VERSION HISTORY</div>
                {versions.map((v) => (
                  <div key={v.id} style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                    v{v.versionNumber} — {v.status} — {new Date(v.createdAt).toLocaleString()}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Preview panel */}
          {showPreview ? (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: 13 }}>
                Live Preview (mock data)
              </div>
              <iframe
                srcDoc={previewHtml}
                style={{
                  width: "100%",
                  height: 700,
                  border: "none",
                  background: "#0b0f17",
                }}
                sandbox="allow-same-origin"
                title="Email Preview"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
