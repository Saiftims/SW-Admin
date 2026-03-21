import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders, type NormalizedAnalysisResult } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";

export const maxDuration = 60;

export async function POST(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);

  const from = params.get("From") ?? "";
  const to = params.get("To") ?? "";
  const body = params.get("Body") ?? "";
  const numMedia = parseInt(params.get("NumMedia") ?? "0", 10);

  console.log(`[WhatsApp] Message from ${from}: "${body}" (${numMedia} media)`);

  if (numMedia === 0) {
    return twimlResponse("👋 Welcome to Silent Witness!\n\nSend crash photos and I'll analyze them with Delta-V, impact direction, and injury probability data.\n\nJust send one or more photos of vehicle damage.");
  }

  const env = getEnv();

  // Download media
  const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];
  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params.get(`MediaUrl${i}`);
    const mediaType = params.get(`MediaContentType${i}`) ?? "image/jpeg";
    if (!mediaUrl || !mediaType.startsWith("image/")) continue;

    try {
      const res = await fetch(mediaUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        },
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = mediaType.split("/")[1] ?? "jpg";
        imageBuffers.push({ buffer, mimeType: mediaType, filename: `wa-photo-${i + 1}.${ext}` });
        console.log(`[WhatsApp]   Downloaded media ${i + 1}: ${mediaType} (${(buffer.length / 1024).toFixed(0)}KB)`);
      }
    } catch (err: any) {
      console.error(`[WhatsApp]   Failed to download media ${i}: ${err?.message}`);
    }
  }

  if (imageBuffers.length === 0) {
    return twimlResponse("I couldn't read those attachments. Please send JPEG, PNG, or WebP crash photos.");
  }

  console.log(`[WhatsApp] Analyzing ${imageBuffers.length} image(s)...`);
  const outcome = await analyzeImages(imageBuffers);

  if (!outcome.ok) {
    console.error(`[WhatsApp] ❌ Analysis failed: ${outcome.error.message}`);
    return twimlResponse(`Analysis failed: ${outcome.error.message}\n\nPlease try again with a clear crash photo.`);
  }

  console.log(`[WhatsApp] ✅ Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

  // Build placeholders and store report
  const placeholders = buildTemplatePlaceholders(outcome.result, {
    customerName: from,
    caseReference: body ? ` — ${body}` : "",
  });

  const html = renderTemplate(getDefaultTemplate(), placeholders);

  const report = await prisma.analysisReport.create({
    data: {
      sourceType: "WHATSAPP",
      sourceRef: from,
      senderPhone: from,
      resultJson: outcome.result as any,
      placeholders: placeholders as any,
      renderedHtml: html,
    },
  });

  const reportUrl = `${env.APP_BASE_URL}/report/${report.id}`;
  console.log(`[WhatsApp] Report: ${reportUrl}`);

  const summary = buildWhatsAppSummary(outcome.result, reportUrl);
  return twimlResponse(summary);
}

function buildWhatsAppSummary(r: NormalizedAnalysisResult, url: string): string {
  const lines: string[] = [];
  lines.push("🔍 *Silent Witness Analysis Complete*\n");

  if (r.deltaV) {
    lines.push(`*Delta-V:* ${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}`);
  }
  if (r.impact?.pdofDirection) {
    lines.push(`*Impact:* ${r.impact.pdofDirection}`);
  }
  if (r.impact?.collisionType) {
    lines.push(`*Type:* ${r.impact.collisionType}`);
  }
  if (r.confidence) {
    lines.push(`*Confidence:* ${r.confidence}`);
  }

  if (r.aisDistribution.length > 0) {
    lines.push("\n*AIS Injury Probability:*");
    for (const a of r.aisDistribution) {
      const pct = (a.probability * 100).toFixed(1);
      lines.push(`  AIS ${a.level} ${a.label}: ${pct}%`);
    }
  }

  lines.push(`\n📊 *Full report:*\n${url}`);

  return lines.join("\n");
}

function twimlResponse(message: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;

  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
