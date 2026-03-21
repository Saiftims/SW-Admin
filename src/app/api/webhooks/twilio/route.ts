import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders, type NormalizedAnalysisResult } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";
import twilio from "twilio";

export async function POST(req: Request) {
  const env = getEnv();

  // Parse the form-encoded body Twilio sends
  const text = await req.text();
  const params = new URLSearchParams(text);

  const from = params.get("From") ?? "";
  const to = params.get("To") ?? "";
  const body = params.get("Body") ?? "";
  const numMedia = parseInt(params.get("NumMedia") ?? "0", 10);

  console.log(`[Twilio] Inbound SMS from ${from} to ${to}: "${body}" (${numMedia} media)`);

  // Look up tenant by the Twilio phone number that received the message
  const twilioConfig = await prisma.twilioConfig.findFirst({
    where: { phoneNumber: to },
    include: { tenant: { include: { firm: true } } },
  });

  if (twilioConfig) {
    console.log(`[Twilio] Matched tenant: ${twilioConfig.tenant.name} (${twilioConfig.tenant.id})`);
  }

  if (numMedia === 0) {
    return twimlResponse("Welcome to Silent Witness. Send crash photos and I'll analyze them with Delta-V, impact direction, and injury probability data.\n\nJust text one or more photos of vehicle damage.");
  }

  // Download media attachments from Twilio
  const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = params.get(`MediaUrl${i}`);
    const mediaType = params.get(`MediaContentType${i}`) ?? "image/jpeg";

    if (!mediaUrl || !mediaType.startsWith("image/")) continue;

    try {
      // Twilio media URLs require basic auth with account SID + auth token
      const res = await fetch(mediaUrl, {
        headers: {
          Authorization: "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"),
        },
      });

      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const ext = mediaType.split("/")[1] ?? "jpg";
        imageBuffers.push({
          buffer,
          mimeType: mediaType,
          filename: `sms-photo-${i + 1}.${ext}`,
        });
        console.log(`[Twilio]   Downloaded media ${i + 1}: ${mediaType} (${(buffer.length / 1024).toFixed(0)}KB)`);
      }
    } catch (err: any) {
      console.error(`[Twilio]   Failed to download media ${i}: ${err?.message}`);
    }
  }

  if (imageBuffers.length === 0) {
    return twimlResponse("I couldn't read those attachments. Please send JPEG, PNG, or WebP crash photos.");
  }

  // Run Silent Witness analysis
  console.log(`[Twilio] Analyzing ${imageBuffers.length} image(s)...`);
  const outcome = await analyzeImages(imageBuffers);

  if (!outcome.ok) {
    console.error(`[Twilio] ❌ Analysis failed: ${outcome.error.message}`);
    return twimlResponse(`Analysis failed: ${outcome.error.message}\n\nPlease try again with a clear crash photo.`);
  }

  console.log(`[Twilio] ✅ Analysis succeeded — Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

  // Build placeholders and render HTML
  const placeholders = buildTemplatePlaceholders(outcome.result, {
    customerName: from,
    lawFirmName: "",
    caseReference: body ? ` — ${body}` : "",
  });

  const html = renderTemplate(getDefaultTemplate(), placeholders);

  // Store the report in DB
  const report = await prisma.analysisReport.create({
    data: {
      sourceType: "SMS",
      sourceRef: from,
      senderPhone: from,
      resultJson: outcome.result as any,
      placeholders: placeholders as any,
      renderedHtml: html,
    },
  });

  const reportUrl = `${env.APP_BASE_URL}/report/${report.id}`;
  console.log(`[Twilio] Report created: ${reportUrl}`);

  // Build a compact SMS summary
  const summary = buildSmsSummary(outcome.result, reportUrl);

  return twimlResponse(summary);
}

function buildSmsSummary(r: NormalizedAnalysisResult, url: string): string {
  const lines: string[] = [];
  lines.push("Silent Witness Analysis Complete\n");

  if (r.deltaV) {
    lines.push(`Delta-V: ${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}`);
  }
  if (r.impact?.pdofDirection) {
    lines.push(`Impact: ${r.impact.pdofDirection}`);
  }
  if (r.impact?.collisionType) {
    lines.push(`Type: ${r.impact.collisionType}`);
  }
  if (r.confidence) {
    lines.push(`Confidence: ${r.confidence}`);
  }

  if (r.aisDistribution.length > 0) {
    lines.push(`AIS distribution: ${r.aisDistribution.map(a => `${a.label} ${(a.probability * 100).toFixed(0)}%`).join(" · ")}`);
  }

  lines.push(`\nFull report:\n${url}`);

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
