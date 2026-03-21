import { getEnv } from "@/lib/env";

// ─── Normalized types ───────────────────────────────────────────────

export type AisLevel = {
  level: number;
  label: string;
  description: string;
  probability: number;
  probabilityMin?: number;
  probabilityMax?: number;
};

export type NormalizedAnalysisResult = {
  deltaV: { min: number; max: number; unit: string } | null;
  impact: {
    pdofDegrees: number | null;
    pdofDirection: string | null;
    peakAccelerationGs: number | null;
    crashPulseMs: { min: number; max: number } | null;
    impactType: string | null;
    collisionType: string | null;
  } | null;
  confidence: string | null;
  aisDistribution: AisLevel[];
  disclaimer: string | null;
  raw: unknown;
};

export type AnalysisError = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
};

export type AnalysisOutcome =
  | { ok: true; result: NormalizedAnalysisResult }
  | { ok: false; error: AnalysisError };

// ─── Normalizer (handles both API response variants) ────────────────

function normalize(raw: any): NormalizedAnalysisResult {
  const deltaV = raw.delta_v
    ? { min: raw.delta_v.min, max: raw.delta_v.max, unit: raw.delta_v.unit ?? "mph" }
    : null;

  const impact = raw.impact
    ? {
        pdofDegrees: raw.impact.pdof_degrees ?? null,
        pdofDirection: raw.impact.pdof_direction ?? null,
        peakAccelerationGs: raw.impact.peak_acceleration_gs ?? null,
        crashPulseMs: raw.impact.crash_pulse_ms
          ? { min: raw.impact.crash_pulse_ms.min, max: raw.impact.crash_pulse_ms.max }
          : null,
        impactType: raw.impact.impact_type ?? null,
        collisionType: raw.impact.collision_type ?? null,
      }
    : null;

  const aisSource =
    raw.injury_probability?.ais_distribution ?? raw.ais_distribution ?? [];

  const aisDistribution: AisLevel[] = Array.isArray(aisSource)
    ? aisSource.map((a: any) => {
        // Handle both formats: single "probability" or "probability_min"/"probability_max" range
        const probMin = a.probability_min ?? a.probability ?? 0;
        const probMax = a.probability_max ?? a.probability ?? 0;
        // Normalize: API returns percentages (0-100), we store as fraction (0-1) if > 1
        const normalize = (v: number) => v > 1 ? v / 100 : v;
        return {
          level: a.level,
          label: a.label,
          description: a.description,
          probability: normalize((probMin + probMax) / 2),
          probabilityMin: normalize(probMin),
          probabilityMax: normalize(probMax),
        };
      })
    : [];

  const disclaimer = raw.injury_probability?.disclaimer ?? raw.disclaimer ?? null;

  return { deltaV, impact, confidence: raw.confidence ?? null, aisDistribution, disclaimer, raw };
}

// ─── Error classification ───────────────────────────────────────────

function classifyError(status: number, body: string): AnalysisError {
  const msg = (() => {
    try { return JSON.parse(body)?.error ?? body; } catch { return body; }
  })();

  if (status === 429)
    return { status, code: "RATE_LIMITED", message: msg, retryable: true };
  if (status >= 500)
    return { status, code: "SERVER_ERROR", message: msg, retryable: true };
  return { status, code: "CLIENT_ERROR", message: msg, retryable: false };
}

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 5;

type ImageInput = { buffer: Buffer; mimeType: string; filename: string };

// ─── Single or multi-image analysis ─────────────────────────────────

export async function analyzeImages(
  images: ImageInput[],
  options?: { useStaging?: boolean }
): Promise<AnalysisOutcome> {
  if (images.length === 0) {
    return { ok: false, error: { status: 400, code: "NO_IMAGES", message: "No images provided.", retryable: false } };
  }
  if (images.length > MAX_IMAGES) {
    return { ok: false, error: { status: 400, code: "TOO_MANY_IMAGES", message: `Max ${MAX_IMAGES} images per request.`, retryable: false } };
  }

  for (const img of images) {
    if (!ACCEPTED_TYPES.has(img.mimeType)) {
      return { ok: false, error: { status: 400, code: "INVALID_FORMAT", message: `Unsupported type: ${img.mimeType}. Accepted: JPEG, PNG, WebP.`, retryable: false } };
    }
    if (img.buffer.length > MAX_SIZE) {
      return { ok: false, error: { status: 400, code: "FILE_TOO_LARGE", message: `${img.filename} is ${(img.buffer.length / 1024 / 1024).toFixed(1)}MB (max 10MB).`, retryable: false } };
    }
  }

  const env = getEnv();
  const baseUrl = options?.useStaging
    ? env.SILENT_WITNESS_STAGING_BASE_URL
    : env.SILENT_WITNESS_PUBLIC_BASE_URL;

  const formData = new FormData();
  for (const img of images) {
    // Use File (subclass of Blob) which works reliably with Node.js native fetch
    const file = new File([new Uint8Array(img.buffer)], img.filename, { type: img.mimeType });
    formData.append("images", file);
  }

  const url = `${baseUrl}/public/v1/analyze`;
  console.log(`[SW API] POST ${url} — ${images.length} image(s): ${images.map(i => `${i.filename} (${i.mimeType}, ${(i.buffer.length/1024).toFixed(0)}KB)`).join(", ")}`);

  try {
    const res = await fetch(url, { method: "POST", body: formData });

    const bodyText = await res.text();
    console.log(`[SW API] Response ${res.status}: ${bodyText.slice(0, 500)}`);

    if (!res.ok) {
      return { ok: false, error: classifyError(res.status, bodyText) };
    }

    const json = JSON.parse(bodyText);
    return { ok: true, result: normalize(json) };
  } catch (err: any) {
    console.error(`[SW API] Network error: ${err?.message}`);
    console.error(err?.stack);
    return { ok: false, error: { status: 0, code: "NETWORK_ERROR", message: err?.message ?? "Network error.", retryable: true } };
  }
}

// Convenience wrapper for single image
export async function analyzeImage(
  imageBuffer: Buffer,
  mimeType: string,
  filename: string,
  options?: { useStaging?: boolean }
): Promise<AnalysisOutcome> {
  return analyzeImages([{ buffer: imageBuffer, mimeType, filename }], options);
}

// ─── Formatting helpers ─────────────────────────────────────────────

export function formatAnalysisForSlack(r: NormalizedAnalysisResult): string {
  const lines: string[] = [];
  lines.push("*Silent Witness — Crash Analysis*\n");

  if (r.deltaV) {
    lines.push(`*Delta-V:* ${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}`);
  }

  if (r.impact) {
    if (r.impact.pdofDirection)
      lines.push(`*Impact Direction:* ${r.impact.pdofDirection}${r.impact.pdofDegrees != null ? ` (${r.impact.pdofDegrees}°)` : ""}`);
    if (r.impact.collisionType)
      lines.push(`*Collision Type:* ${r.impact.collisionType}`);
    if (r.impact.impactType)
      lines.push(`*Impact Type:* ${r.impact.impactType}`);
    if (r.impact.peakAccelerationGs != null)
      lines.push(`*Peak Acceleration:* ${r.impact.peakAccelerationGs} g`);
    if (r.impact.crashPulseMs)
      lines.push(`*Crash Pulse:* ${r.impact.crashPulseMs.min} – ${r.impact.crashPulseMs.max} ms`);
  }

  if (r.confidence) lines.push(`*Confidence:* ${r.confidence}`);

  if (r.aisDistribution.length > 0) {
    lines.push("\n*Injury Probability (AIS Scale):*");
    lines.push("```");
    lines.push("AIS  Level         Probability       Description");
    lines.push("───  ──────────    ───────────────    ─────────────────────────────");
    for (const a of r.aisDistribution) {
      const level = `${a.level}`.padEnd(4);
      const label = a.label.padEnd(12);
      const pctMin = (a.probabilityMin ?? a.probability) * 100;
      const pctMax = (a.probabilityMax ?? a.probability) * 100;
      const pctStr = pctMin === pctMax
        ? `${pctMin.toFixed(1)}%`.padStart(7)
        : `${pctMin.toFixed(1)}-${pctMax.toFixed(1)}%`.padStart(13);
      const barLen = Math.round(a.probability * 20);
      const bar = "▓".repeat(barLen) + "░".repeat(20 - barLen);
      lines.push(`${level} ${label}  ${pctStr}  ${bar}  ${a.description}`);
    }
    lines.push("```");
  }

  if (r.disclaimer) lines.push(`\n_${r.disclaimer}_`);

  return lines.join("\n");
}

export function buildSlackBlocks(r: NormalizedAnalysisResult): any[] {
  const blocks: any[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "Silent Witness — Crash Analysis", emoji: false },
  });

  // Impact metrics section
  const fields: any[] = [];
  if (r.deltaV) fields.push({ type: "mrkdwn", text: `*Delta-V*\n${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}` });
  if (r.confidence) fields.push({ type: "mrkdwn", text: `*Confidence*\n${r.confidence}` });
  if (r.impact?.pdofDirection) fields.push({ type: "mrkdwn", text: `*Impact Direction*\n${r.impact.pdofDirection}${r.impact.pdofDegrees != null ? ` (${r.impact.pdofDegrees}°)` : ""}` });
  if (r.impact?.collisionType) fields.push({ type: "mrkdwn", text: `*Collision Type*\n${r.impact.collisionType}` });
  if (r.impact?.peakAccelerationGs != null) fields.push({ type: "mrkdwn", text: `*Peak Acceleration*\n${r.impact.peakAccelerationGs} g` });
  if (r.impact?.impactType) fields.push({ type: "mrkdwn", text: `*Impact Type*\n${r.impact.impactType}` });
  if (r.impact?.crashPulseMs) fields.push({ type: "mrkdwn", text: `*Crash Pulse*\n${r.impact.crashPulseMs.min} – ${r.impact.crashPulseMs.max} ms` });

  if (fields.length > 0) {
    // Slack limits fields to 10, and pairs them in 2 columns
    blocks.push({ type: "section", fields: fields.slice(0, 10) });
  }

  blocks.push({ type: "divider" });

  // AIS table
  if (r.aisDistribution.length > 0) {
    const tableRows = r.aisDistribution.map((a) => {
      const pctMin = (a.probabilityMin ?? a.probability) * 100;
      const pctMax = (a.probabilityMax ?? a.probability) * 100;
      const pctStr = pctMin === pctMax
        ? `${pctMin.toFixed(1)}%`.padStart(7)
        : `${pctMin.toFixed(1)}-${pctMax.toFixed(1)}%`.padStart(14);
      const barLen = Math.round(a.probability * 15);
      const bar = "▓".repeat(barLen) + "░".repeat(15 - barLen);
      return `AIS ${a.level}  │ ${a.label.padEnd(10)} │ ${pctStr} ${bar} │ ${a.description}`;
    });

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Injury Probability (AIS Scale)*\n\`\`\`\n${"─".repeat(85)}\nAIS   │ Level      │  Probability          │ Description\n${"─".repeat(85)}\n${tableRows.join("\n")}\n${"─".repeat(85)}\`\`\``,
      },
    });
  }

  // Disclaimer
  if (r.disclaimer) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${r.disclaimer}_` }],
    });
  }

  return blocks;
}

export function buildTemplatePlaceholders(
  r: NormalizedAnalysisResult,
  extra?: { customerName?: string; lawFirmName?: string; caseReference?: string }
): Record<string, string> {
  // Build AIS bar chart HTML
  const barColors: Record<number, string> = {
    0: "#10b981", 1: "#3b82f6", 2: "#6366f1", 3: "#f59e0b", 4: "#ef4444", 5: "#dc2626", 6: "#991b1b",
  };

  const aisBarsHtml = r.aisDistribution.map((a) => {
    const pctMin = (a.probabilityMin ?? a.probability) * 100;
    const pctMax = (a.probabilityMax ?? a.probability) * 100;
    const pctDisplay = pctMin === pctMax ? `${pctMin.toFixed(1)}%` : `${pctMin.toFixed(1)}%`;
    const barWidth = Math.max(2, Math.round(a.probability * 100));
    const color = barColors[a.level] ?? "#6366f1";

    return `<div class="ais-row">
  <div class="ais-row-header">
    <div class="ais-level">AIS ${a.level} <span>${a.label}</span></div>
    <div class="ais-pct">${pctDisplay}</div>
  </div>
  <div class="ais-bar-track"><div class="ais-bar-fill" style="width:${barWidth}%;background:${color}"></div></div>
  <div class="ais-desc">${a.description}</div>
</div>`;
  }).join("\n");


  // Format display values
  const impactTypeDisplay = (r.impact?.impactType ?? "N/A")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const gForceDisplay = r.impact?.peakAccelerationGs != null && r.impact.peakAccelerationGs > 0
    ? `${r.impact.peakAccelerationGs} g`
    : "—";

  const pulseDisplay = r.impact?.crashPulseMs && (r.impact.crashPulseMs.min > 0 || r.impact.crashPulseMs.max > 0)
    ? `${r.impact.crashPulseMs.min}–${r.impact.crashPulseMs.max} ms`
    : "—";

  const confidenceClass = r.confidence === "high" ? "" : "low";

  return {
    customer_name: extra?.customerName ?? "",
    law_firm_name: extra?.lawFirmName ?? "",
    case_reference: extra?.caseReference ?? "",
    delta_v_min: r.deltaV?.min?.toString() ?? "N/A",
    delta_v_max: r.deltaV?.max?.toString() ?? "N/A",
    delta_v_unit: r.deltaV?.unit ?? "mph",
    impact_direction: r.impact?.pdofDirection ?? "N/A",
    impact_type: r.impact?.impactType ?? "N/A",
    impact_type_display: impactTypeDisplay,
    collision_type: r.impact?.collisionType ?? "N/A",
    pdof_degrees: r.impact?.pdofDegrees?.toString() ?? "N/A",
    peak_acceleration_gs: r.impact?.peakAccelerationGs?.toString() ?? "N/A",
    peak_acceleration_gs_display: gForceDisplay,
    crash_pulse_min_ms: r.impact?.crashPulseMs?.min?.toString() ?? "N/A",
    crash_pulse_max_ms: r.impact?.crashPulseMs?.max?.toString() ?? "N/A",
    crash_pulse_display: pulseDisplay,
    confidence: r.confidence ?? "N/A",
    confidence_class: confidenceClass,
    ais_bars: aisBarsHtml || "<div>No injury probability data available.</div>",
    ais_summary: aisBarsHtml || "No injury probability data available.",
    severity_summary: "",
    disclaimer: r.disclaimer ?? "",
  };
}
