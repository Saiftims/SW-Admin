import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders, type NormalizedAnalysisResult } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";
import { handleSlackMessage } from "@/lib/services/anthropic-bot";

export const maxDuration = 60;

export async function POST(req: Request) {
  const env = getEnv();
  const text = await req.text();
  const params = new URLSearchParams(text);

  const from = params.get("From") ?? "";
  const to = params.get("To") ?? "";
  const messageSid = params.get("MessageSid") ?? "";
  const body = params.get("Body") ?? "";
  const numMedia = parseInt(params.get("NumMedia") ?? "0", 10);

  console.log(`[SMS] Message from ${from}: "${body}" (${numMedia} media) SID: ${messageSid}`);

  // Dedupe by MessageSid
  if (messageSid) {
    const existing = await prisma.jobEventHistory.findFirst({
      where: { correlationId: `sms:${messageSid}` },
    });
    if (existing) {
      return emptyResponse();
    }
    await prisma.jobEventHistory.create({
      data: {
        correlationId: `sms:${messageSid}`,
        entityType: "sms_message",
        eventType: "WEBHOOK_RECEIVED",
        detailsJson: { from, numMedia },
      },
    }).catch(() => {});
  }

  // Find tenant by Twilio number
  const twilioConfig = await prisma.twilioConfig.findFirst({
    where: { phoneNumber: to },
    include: { tenant: { include: { firm: true } } },
  });
  const tenant = twilioConfig?.tenant ?? await prisma.tenant.findFirst({ include: { firm: true } });
  const tenantId = tenant?.id ?? "";

  // ─── Text-only: conversational AI ─────────────────────────────────
  if (numMedia === 0) {
    if (!body.trim()) {
      return twimlResponse("Welcome to Silent Witness.\n\nSend crash photos for Delta-V analysis, or ask questions about your case.");
    }

    try {
      const response = await handleSlackMessage({
        tenantId,
        userMessage: body,
        channel: `sms:${from}`,
      });

      return twimlResponse(response.text.replace(/\*\*(.+?)\*\*/g, "$1"));
    } catch (err: any) {
      console.error(`[SMS] AI error: ${err?.message}`);
      return twimlResponse("Sorry, I encountered an error. Please try again.");
    }
  }

  // ─── Photos: analyze ──────────────────────────────────────────────

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
        imageBuffers.push({ buffer, mimeType: mediaType, filename: `sms-${i + 1}.${mediaType.split("/")[1]}` });
      }
    } catch (err: any) {
      console.error(`[SMS] Download failed: ${err?.message}`);
    }
  }

  if (imageBuffers.length === 0) {
    return twimlResponse("I couldn't read those attachments. Please send JPEG, PNG, or WebP crash photos.");
  }

  console.log(`[SMS] Analyzing ${imageBuffers.length} image(s)...`);
  const outcome = await analyzeImages(imageBuffers);

  if (!outcome.ok) {
    return twimlResponse(`Analysis failed: ${outcome.error.message}\n\nPlease try again.`);
  }

  console.log(`[SMS] Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

  // Store in conversation memory
  if (tenantId) {
    const analysisText = `Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}, Impact: ${outcome.result.impact?.pdofDirection}, Type: ${outcome.result.impact?.collisionType}, Confidence: ${outcome.result.confidence}, AIS: ${outcome.result.aisDistribution.map(a => `${a.label} ${(a.probability*100).toFixed(1)}%`).join(", ")}`;

    await prisma.conversationMessage.createMany({
      data: [
        { tenantId, channel: `sms:${from}`, role: "user", content: `(sent ${imageBuffers.length} crash photo(s))`, hasImages: true },
        { tenantId, channel: `sms:${from}`, role: "assistant", content: `[ANALYSIS RESULTS]\n${analysisText}` },
      ],
    }).catch(() => {});
  }

  // Build report
  const placeholders = buildTemplatePlaceholders(outcome.result, {
    customerName: tenant?.firm?.lawFirmName ?? from,
    lawFirmName: tenant?.firm?.lawFirmName ?? "",
    caseReference: body ? ` — ${body}` : "",
  });

  const html = renderTemplate(getDefaultTemplate(), placeholders);
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
  const summary = buildSummary(outcome.result, reportUrl);
  return twimlResponse(summary);
}

function buildSummary(r: NormalizedAnalysisResult, url: string): string {
  const lines: string[] = [];
  lines.push("Silent Witness Analysis Complete\n");
  if (r.deltaV) lines.push(`Delta-V: ${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}`);
  if (r.impact?.pdofDirection) lines.push(`Impact: ${r.impact.pdofDirection}`);
  if (r.impact?.collisionType) lines.push(`Type: ${r.impact.collisionType}`);
  if (r.confidence) lines.push(`Confidence: ${r.confidence}`);

  if (r.aisDistribution.length > 0) {
    lines.push(`\nAIS Injury Probability:`);
    for (const a of r.aisDistribution) {
      lines.push(`  AIS ${a.level} ${a.label}: ${(a.probability * 100).toFixed(1)}%`);
    }
  }

  lines.push(`\nFull report:\n${url}`);
  return lines.join("\n");
}

function twimlResponse(message: string) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message>
</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function emptyResponse() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });
}
