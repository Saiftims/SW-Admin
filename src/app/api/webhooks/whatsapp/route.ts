import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders, type NormalizedAnalysisResult } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";

export const maxDuration = 60;

// WhatsApp sends each photo as a separate message. We batch them by waiting
// for a quiet period before processing. Strategy:
// 1. When a photo arrives, store it in DB as a pending asset
// 2. Wait 8 seconds for more photos from the same sender
// 3. After the wait, collect all pending photos and analyze together

const BATCH_WINDOW_MS = 8000;

export async function POST(req: Request) {
  const text = await req.text();
  const params = new URLSearchParams(text);

  const from = params.get("From") ?? "";
  const messageSid = params.get("MessageSid") ?? "";
  const body = params.get("Body") ?? "";
  const numMedia = parseInt(params.get("NumMedia") ?? "0", 10);

  console.log(`[WhatsApp] Message from ${from}: "${body}" (${numMedia} media) SID: ${messageSid}`);

  // Dedupe by MessageSid
  if (messageSid) {
    const existing = await prisma.jobEventHistory.findFirst({
      where: { correlationId: `wa:${messageSid}` },
    });
    if (existing) {
      console.log(`[WhatsApp] Duplicate SID ${messageSid}, skipping`);
      return emptyResponse();
    }
    await prisma.jobEventHistory.create({
      data: {
        correlationId: `wa:${messageSid}`,
        entityType: "whatsapp_message",
        eventType: "WEBHOOK_RECEIVED",
        detailsJson: { from, numMedia },
      },
    }).catch(() => {});
  }

  if (numMedia === 0) {
    return twimlResponse("Welcome to Silent Witness.\n\nSend crash photos and I'll analyze them with Delta-V, impact direction, and injury probability data.\n\nJust send one or more photos of vehicle damage.");
  }

  const env = getEnv();

  // Download images from this message
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
        imageBuffers.push({ buffer, mimeType: mediaType, filename: `wa-${messageSid}-${i}.${mediaType.split("/")[1]}` });
      }
    } catch (err: any) {
      console.error(`[WhatsApp] Download failed: ${err?.message}`);
    }
  }

  if (imageBuffers.length === 0) {
    return twimlResponse("I couldn't read those attachments. Please send JPEG, PNG, or WebP crash photos.");
  }

  // Store images as pending batch entries
  const batchKey = `wa-batch:${from}`;
  for (const img of imageBuffers) {
    await prisma.jobEventHistory.create({
      data: {
        correlationId: batchKey,
        entityType: "whatsapp_batch_image",
        eventType: "ATTACHMENT_STORED",
        detailsJson: {
          buffer: img.buffer.toString("base64"),
          mimeType: img.mimeType,
          filename: img.filename,
          timestamp: Date.now(),
        },
      },
    });
  }

  console.log(`[WhatsApp] Stored ${imageBuffers.length} image(s) in batch. Waiting ${BATCH_WINDOW_MS}ms for more...`);

  // Wait for more photos to arrive
  await new Promise((r) => setTimeout(r, BATCH_WINDOW_MS));

  // Check if we're the last message in the batch (only the last one processes)
  // We do this by checking if any newer images were added after our wait started
  const allBatchEntries = await prisma.jobEventHistory.findMany({
    where: {
      correlationId: batchKey,
      entityType: "whatsapp_batch_image",
    },
    orderBy: { createdAt: "asc" },
  });

  if (allBatchEntries.length === 0) {
    return emptyResponse();
  }

  // Check if the most recent entry is older than BATCH_WINDOW_MS ago
  const newestEntry = allBatchEntries[allBatchEntries.length - 1];
  const newestTimestamp = (newestEntry.detailsJson as any)?.timestamp ?? 0;
  const now = Date.now();

  if (now - newestTimestamp < BATCH_WINDOW_MS - 1000) {
    // A newer photo arrived after us — let that request handle the batch
    console.log(`[WhatsApp] Newer photos in batch, deferring to later request`);
    return emptyResponse();
  }

  // We're the last one — collect all images and process
  console.log(`[WhatsApp] Processing batch of ${allBatchEntries.length} image(s) for ${from}`);

  const batchImages: { buffer: Buffer; mimeType: string; filename: string }[] = [];
  for (const entry of allBatchEntries) {
    const d = entry.detailsJson as any;
    if (d?.buffer) {
      batchImages.push({
        buffer: Buffer.from(d.buffer, "base64"),
        mimeType: d.mimeType,
        filename: d.filename,
      });
    }
  }

  // Clean up batch entries
  await prisma.jobEventHistory.deleteMany({
    where: {
      correlationId: batchKey,
      entityType: "whatsapp_batch_image",
    },
  });

  if (batchImages.length === 0) {
    return emptyResponse();
  }

  // Analyze all images together in one API call
  console.log(`[WhatsApp] Analyzing ${batchImages.length} combined image(s)...`);
  const outcome = await analyzeImages(batchImages.slice(0, 5)); // API max 5

  if (!outcome.ok) {
    console.error(`[WhatsApp] Analysis failed: ${outcome.error.message}`);
    return twimlResponse(`Analysis failed: ${outcome.error.message}\n\nPlease try again.`);
  }

  console.log(`[WhatsApp] Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

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
  const summary = buildSummary(outcome.result, reportUrl, batchImages.length);
  return twimlResponse(summary);
}

function buildSummary(r: NormalizedAnalysisResult, url: string, photoCount: number): string {
  const lines: string[] = [];
  lines.push(`*Silent Witness Analysis Complete*`);
  lines.push(`_${photoCount} photo(s) analyzed_\n`);

  if (r.deltaV) lines.push(`*Delta-V:* ${r.deltaV.min} – ${r.deltaV.max} ${r.deltaV.unit}`);
  if (r.impact?.pdofDirection) lines.push(`*Impact:* ${r.impact.pdofDirection}`);
  if (r.impact?.collisionType) lines.push(`*Type:* ${r.impact.collisionType}`);
  if (r.confidence) lines.push(`*Confidence:* ${r.confidence}`);

  if (r.aisDistribution.length > 0) {
    lines.push("\n*AIS Injury Probability:*");
    for (const a of r.aisDistribution) {
      lines.push(`  AIS ${a.level} ${a.label}: ${(a.probability * 100).toFixed(1)}%`);
    }
  }

  lines.push(`\n*Full report:*\n${url}`);
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
