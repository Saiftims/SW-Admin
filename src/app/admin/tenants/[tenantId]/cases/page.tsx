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
  hasImages: boolean;
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

function CaseCard({ r }: { r: Report }) {
  const [expanded, setExpanded] = useState(false);
  const result = r.resultJson as any;
  const deltaV = result?.deltaV;
  const sender = r.senderPhone || r.senderEmail || r.sourceRef || "Unknown";

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{ display: "flex", gap: 16, padding: 16, cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Thumbnail */}
        {r.hasImages ? (
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            overflow: "hidden",
            flexShrink: 0,
            background: "#1a1a2e",
          }}>
            <img
              src={`/api/reports/${r.id}/images/0`}
              alt="Crash photo"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
            />
          </div>
        ) : (
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 8,
            flexShrink: 0,
            background: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: 11,
          }}>
            No photo
          </div>
        )}

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
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

          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.subject || `Analysis from ${sender}`}
          </div>

          <div style={{ display: "flex", gap: 20, color: "var(--muted)", fontSize: 13, flexWrap: "wrap" }}>
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

        {/* Arrow */}
        <div style={{ color: "var(--muted)", fontSize: 18, flexShrink: 0, alignSelf: "center", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>
          &#9656;
        </div>
      </div>

      {/* Expanded: all images + report link */}
      {expanded ? (
        <div style={{ borderTop: "1px solid var(--border)", padding: 16 }}>
          {r.hasImages && r.imageCount > 0 ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              {Array.from({ length: r.imageCount }).map((_, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div
                    style={{
                      width: 180,
                      height: 135,
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#1a1a2e",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/api/reports/${r.id}/images/${i}`, "_blank");
                    }}
                  >
                    <img
                      src={`/api/reports/${r.id}/images/${i}`}
                      alt={`Crash photo ${i + 1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                    />
                  </div>
                  <a
                    href={`/api/reports/${r.id}/images/${i}?download=1`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--brand)",
                      background: "rgba(99,102,241,0.08)",
                      border: "1px solid rgba(99,102,241,0.2)",
                      textDecoration: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>&#8681;</span> Download original
                  </a>
                </div>
              ))}
            </div>
          ) : null}

          <Link
            href={`/report/${r.id}`}
            target="_blank"
            className="btn"
            style={{ fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          >
            View Full Report
          </Link>
        </div>
      ) : null}
    </div>
  );
}

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
          {reports.map((r) => <CaseCard key={r.id} r={r} />)}
        </div>
      ) : null}
    </div>
  );
}
