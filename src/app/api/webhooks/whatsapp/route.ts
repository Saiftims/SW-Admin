import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { analyzeImages, buildTemplatePlaceholders, type NormalizedAnalysisResult } from "@/lib/services/silent-witness-client";
import { renderTemplate, getDefaultTemplate } from "@/lib/services/email-template";
import { handleSlackMessage } from "@/lib/services/anthropic-bot";
import { processVoiceMessage } from "@/lib/services/voice-handler";

export const maxDuration = 60;

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

  // Find tenant (use first available for now)
  const tenant = await prisma.tenant.findFirst({
    include: { firm: true },
  });
  const tenantId = tenant?.id ?? "";

  const env = getEnv();

  // ─── Text-only message: conversational AI ─────────────────────────
  if (numMedia === 0) {
    if (!body.trim()) {
      return twimlResponse("Welcome to Silent Witness.\n\nSend crash photos for Delta-V analysis, or ask questions about your case.");
    }

    try {
      const response = await handleSlackMessage({
        tenantId,
        userMessage: body,
        channel: `whatsapp:${from}`,
      });

      // Convert markdown bold to WhatsApp bold
      const waText = response.text
        .replace(/\*\*(.+?)\*\*/g, "*$1*")
        .replace(/^#{1,3}\s+(.+)$/gm, "*$1*")
        .replace(/^- /gm, "• ");

      return twimlResponse(waText);
    } catch (err: any) {
      console.error(`[WhatsApp] AI error: ${err?.message}`);
      return twimlResponse("Sorry, I encountered an error. Please try again.");
    }
  }

  // ─── Voice message: STT → AI → TTS ──────────────────────────────

  if (numMedia > 0) {
    const mediaType0 = params.get("MediaContentType0") ?? "";
    console.log(`[WhatsApp] Media type: "${mediaType0}" numMedia=${numMedia}`);

    const isAudio = mediaType0.startsWith("audio/") || mediaType0.startsWith("video/ogg") || mediaType0 === "video/3gpp";
    if (isAudio) {
      const mediaUrl = params.get("MediaUrl0") ?? "";
      console.log(`[WhatsApp] Voice message from ${from}, type=${mediaType0}, url=${mediaUrl ? "yes" : "no"}`);

      if (mediaUrl) {
        try {
          const audioRes = await fetch(mediaUrl, {
            headers: {
              Authorization: "Basic " + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64"),
            },
          });
          if (!audioRes.ok) throw new Error(`Download failed: ${audioRes.status}`);
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          console.log(`[WhatsApp] Downloaded audio: ${(audioBuffer.length / 1024).toFixed(0)}KB`);

          const result = await processVoiceMessage({
            tenantId,
            channel: `whatsapp:${from}`,
            audioBuffer,
            audioMimeType: mediaType0,
            audioFilename: `voice-${messageSid}.ogg`,
          });

          console.log(`[WhatsApp] Voice pipeline complete, audioUrl=${result.audioUrl}`);

          // Reply with TwiML containing both text and audio media
          return twimlMediaResponse(result.responseText.slice(0, 1500), result.audioUrl);
        } catch (err: any) {
          console.error(`[WhatsApp] Voice error: ${err?.message}`);
          if (err?.stack) console.error(err.stack);
          return twimlResponse("Sorry, I couldn't process that voice message. Please try again or send a text.");
        }
      }
    }
  }

  // ─── Photo message: batch + analyze ───────────────────────────────

  // Download images
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

  // Store images in batch
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

  console.log(`[WhatsApp] Stored ${imageBuffers.length} image(s). Waiting ${BATCH_WINDOW_MS}ms for more...`);
  await new Promise((r) => setTimeout(r, BATCH_WINDOW_MS));

  // Check if we're the last in the batch
  const allBatchEntries = await prisma.jobEventHistory.findMany({
    where: { correlationId: batchKey, entityType: "whatsapp_batch_image" },
    orderBy: { createdAt: "asc" },
  });

  if (allBatchEntries.length === 0) return emptyResponse();

  const newestTimestamp = (allBatchEntries[allBatchEntries.length - 1].detailsJson as any)?.timestamp ?? 0;
  if (Date.now() - newestTimestamp < BATCH_WINDOW_MS - 1000) {
    console.log(`[WhatsApp] Newer photos in batch, deferring`);
    return emptyResponse();
  }

  // Collect all batch images
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

  // Clean up
  await prisma.jobEventHistory.deleteMany({
    where: { correlationId: batchKey, entityType: "whatsapp_batch_image" },
  });

  if (batchImages.length === 0) return emptyResponse();

  // Analyze
  console.log(`[WhatsApp] Analyzing ${batchImages.length} combined image(s)...`);
  const outcome = await analyzeImages(batchImages.slice(0, 5));

  if (!outcome.ok) {
    return twimlResponse(`Analysis failed: ${outcome.error.message}\n\nPlease try again.`);
  }

  console.log(`[WhatsApp] Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);

  // Store in conversation memory so follow-up questions work
  if (tenantId) {
    const analysisText = `Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}, Impact: ${outcome.result.impact?.pdofDirection}, Type: ${outcome.result.impact?.collisionType}, Confidence: ${outcome.result.confidence}, AIS: ${outcome.result.aisDistribution.map(a => `${a.label} ${(a.probability*100).toFixed(1)}%`).join(", ")}`;

    await prisma.conversationMessage.createMany({
      data: [
        { tenantId, channel: `whatsapp:${from}`, role: "user", content: `(sent ${batchImages.length} crash photo(s))`, hasImages: true },
        { tenantId, channel: `whatsapp:${from}`, role: "assistant", content: `[ANALYSIS RESULTS]\n${analysisText}` },
      ],
    }).catch(() => {});
  }

  // Build report
  const placeholders = buildTemplatePlaceholders(outcome.result, {
    customerName: from,
    caseReference: body ? ` — ${body}` : "",
  });

  const html = renderTemplate(getDefaultTemplate(), placeholders);
  const imageData = batchImages.map((img) => ({
    base64: img.buffer.toString("base64"),
    mimeType: img.mimeType,
    filename: img.filename,
  }));
  const report = await prisma.analysisReport.create({
    data: {
      tenantId: tenantId || null,
      sourceType: "WHATSAPP",
      sourceRef: from,
      senderPhone: from,
      subject: body || null,
      imageCount: batchImages.length,
      imageData: imageData as any,
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

function twimlMediaResponse(message: string, mediaUrl: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${esc(message)}</Body>
    <Media>${esc(mediaUrl)}</Media>
  </Message>
</Response>`;
  return new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function emptyResponse() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    status: 200, headers: { "Content-Type": "text/xml" },
  });
}
