"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Report = {
  id: string;
  sourceType: string;
  sourceRef: string | null;
  senderPhone: string | null;
  senderEmail: string | null;
  subject: string | null;
  imageCount: number;
  resultJson: any;
  createdAt: string;
};

const sourceLabels: Record<string, string> = {
  SLACK: "Slack",
  SMS: "SMS",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
};

const sourceColors: Record<string, string> = {
  SLACK: "#6366f1",
  SMS: "#10b981",
  WHATSAPP: "#22c55e",
  EMAIL: "#3b82f6",
};

export default function CasesPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tenants/${tenantId}/cases`)
      .then((r) => r.json())
      .then((d) => { setReports(d.reports ?? []); setLoading(false); });
  }, [tenantId]);

  return (
    <div className="container">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Case Files</h1>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            All crash analyses run for this tenant across Slack, SMS, WhatsApp, and Email.
          </div>
        </div>
        <Link className="btn" href={`/admin/tenants/${tenantId}`}>Back to tenant</Link>
      </div>

      <div style={{ height: 16 }} />

      {loading ? <div style={{ color: "var(--muted)" }}>Loading cases...</div> : null}

      {!loading && reports.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)", fontSize: 13 }}>
          No analyses yet. Cases will appear here when users send crash photos via any channel.
        </div>
      ) : null}

      {!loading && reports.length > 0 ? (
        <div style={{ display: "grid", gap: 10 }}>
          {reports.map((r) => {
            const result = r.resultJson as any;
            const deltaV = result?.deltaV;
            const sender = r.senderPhone || r.senderEmail || r.sourceRef || "Unknown";

            return (
              <Link
                key={r.id}
                href={`/report/${r.id}`}
                target="_blank"
                className="card"
                style={{ textDecoration: "none", padding: 16 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        background: `${sourceColors[r.sourceType] ?? "var(--muted)"}20`,
                        color: sourceColors[r.sourceType] ?? "var(--muted)",
                        border: `1px solid ${sourceColors[r.sourceType] ?? "var(--muted)"}40`,
                      }}>
                        {sourceLabels[r.sourceType] ?? r.sourceType}
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>
                        {r.imageCount} photo{r.imageCount !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                      {r.subject || `Analysis from ${sender}`}
                    </div>

                    <div style={{ display: "flex", gap: 20, color: "var(--muted)", fontSize: 13 }}>
                      {deltaV ? (
                        <span>Delta-V: <span style={{ color: "var(--brand)", fontWeight: 600 }}>{deltaV.min} – {deltaV.max} {deltaV.unit}</span></span>
                      ) : null}
                      {result?.confidence ? (
                        <span>Confidence: <span style={{ fontWeight: 600 }}>{result.confidence}</span></span>
                      ) : null}
                      {result?.impact?.collisionType ? (
                        <span>Type: <span style={{ fontWeight: 600 }}>{result.impact.collisionType}</span></span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ color: "var(--brand)", fontSize: 13, whiteSpace: "nowrap" }}>
                    View report →
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
