"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

export default function MemoryPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [memory, setMemory] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [firm, setFirm] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"memory" | "conversations" | "firm">("memory");

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/memory`)
      .then((r) => r.json())
      .then((d) => {
        setMemory(d.memory ?? "");
        setConversations(d.conversations ?? []);
        setFirm(d.firm);
        setVersions(d.versions ?? []);
        setLoading(false);
      });
  }, [tenantId]);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/tenants/${tenantId}/memory`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: memory }),
    });
    if (res.ok) {
      const d = await res.json();
      setMessage(`Memory saved (v${d.versionNumber}).`);
      setTimeout(() => setMessage(null), 3000);
    } else {
      setMessage("Failed to save.");
    }
    setSaving(false);
  }

  const tabStyle = (t: string) => ({
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600 as const,
    cursor: "pointer" as const,
    borderBottom: tab === t ? "2px solid var(--brand)" : "2px solid transparent",
    color: tab === t ? "var(--brand)" : "var(--muted)",
    background: "none",
    border: "none",
    borderBottomWidth: 2,
    borderBottomStyle: "solid" as const,
    borderBottomColor: tab === t ? "var(--brand)" : "transparent",
  });

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ marginBottom: 6 }}>Bot Memory</h1>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div className="hint" style={{ marginBottom: 16 }}>
        The bot's knowledge base, conversation history, and firm context. Memory is injected into every conversation so the bot understands the customer.
      </div>

      {loading ? <div style={{ color: "var(--muted)" }}>Loading...</div> : (
        <>
          <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <button style={tabStyle("memory")} onClick={() => setTab("memory")}>Memory.md</button>
            <button style={tabStyle("conversations")} onClick={() => setTab("conversations")}>Conversations ({conversations.length})</button>
            <button style={tabStyle("firm")} onClick={() => setTab("firm")}>Firm Context</button>
          </div>

          {tab === "memory" && (
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 750 }}>Knowledge Base</div>
                <button className="btn btnPrimary" onClick={onSave} disabled={saving} style={{ fontSize: 12, padding: "5px 12px" }}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>

              <textarea
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                style={{
                  minHeight: 400,
                  fontFamily: "ui-monospace, 'Cascadia Code', Menlo, monospace",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              />

              {message && <div style={{ marginTop: 10, fontSize: 13, color: "var(--success)" }}>{message}</div>}

              {versions.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Version History</div>
                  {versions.map((v: any) => (
                    <div key={v.id} style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3 }}>
                      v{v.versionNumber} — {new Date(v.createdAt).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "conversations" && (
            <div className="card">
              <div style={{ fontWeight: 750, marginBottom: 12 }}>Recent Conversations</div>
              {conversations.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No conversations yet. Messages will appear here as users interact with the bot.</div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: "auto" }}>
                  {conversations.map((msg: any) => (
                    <div key={msg.id} style={{
                      padding: "10px 14px",
                      marginBottom: 8,
                      borderRadius: 10,
                      background: msg.role === "user" ? "rgba(255,255,255,0.04)" : "rgba(110, 231, 255, 0.06)",
                      border: `1px solid ${msg.role === "user" ? "rgba(255,255,255,0.06)" : "rgba(110, 231, 255, 0.1)"}`,
                    }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {msg.role} · {msg.channel} · {new Date(msg.createdAt).toLocaleString()}
                        {msg.hasImages && " · 📷"}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 150, overflow: "hidden" }}>
                        {msg.content.slice(0, 500)}{msg.content.length > 500 ? "..." : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "firm" && (
            <div className="card">
              <div style={{ fontWeight: 750, marginBottom: 12 }}>Firm Context (auto-included in memory)</div>
              {firm ? (
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8, fontFamily: "monospace" }}>
                  <div>Firm: {firm.lawFirmName}</div>
                  <div>Type: {firm.counselorType}</div>
                  <div>Email: {firm.billingEmail}</div>
                  <div>Phone: {firm.phoneNumber}</div>
                  <div>Address: {firm.streetAddress}, {firm.city}, {firm.state} {firm.zipCode}</div>
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No firm information available.</div>
              )}
              <div className="hint" style={{ marginTop: 12 }}>
                This information is automatically included when the bot responds, so it knows which firm it's representing.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
