import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleSlackMessage } from "@/lib/services/anthropic-bot";
import { processVoiceMessage } from "@/lib/services/voice-handler";

export const maxDuration = 60;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody);

  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = body.event;
  if (!event || event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  // Ignore ALL non-user messages
  if (event.bot_id) return NextResponse.json({ ok: true });
  // Only process: no subtype (plain message) or file_share
  if (event.subtype && event.subtype !== "file_share") {
    return NextResponse.json({ ok: true });
  }

  const teamId = body.team_id;
  const channel = event.channel;
  const messageTs = event.ts ?? event.event_ts;

  // DB-based deduplication using message timestamp (works across serverless instances)
  const dedupeKey = `slack:${channel}:${messageTs}`;
  try {
    const existing = await prisma.jobEventHistory.findFirst({
      where: { correlationId: dedupeKey },
    });
    if (existing) {
      console.log(`[Slack] Duplicate ${dedupeKey}, skipping`);
      return NextResponse.json({ ok: true });
    }
    await prisma.jobEventHistory.create({
      data: {
        correlationId: dedupeKey,
        entityType: "slack_message",
        eventType: "WEBHOOK_RECEIVED",
        detailsJson: { user: event.user, files: (event.files ?? []).length },
      },
    });
  } catch {
    // If insert fails due to race condition, skip
    console.log(`[Slack] Dedupe race on ${dedupeKey}, skipping`);
    return NextResponse.json({ ok: true });
  }

  const config = await prisma.slackConfig.findFirst({
    where: { workspaceId: teamId },
  }) ?? await prisma.slackConfig.findFirst();

  if (!config) {
    console.error(`[Slack] No config for team ${teamId}`);
    return NextResponse.json({ ok: true });
  }

  const tenantId = config.tenantId;
  const botToken = config.botTokenEncrypted;
  const userMessage = event.text ?? "";
  const files = event.files ?? [];

  console.log(`[Slack] Processing: "${userMessage.slice(0, 50)}" (${files.length} files) [${dedupeKey}]`);

  // ─── Check for audio files (voice clips) ─────────────────────────

  const audioFile = files.find((f: any) =>
    f.mimetype?.startsWith("audio/") || f.mimetype === "video/webm" || f.mimetype === "video/mp4"
  );

  if (audioFile) {
    const url = audioFile.url_private_download ?? audioFile.url_private;
    if (url) {
      let thinkingTs: string | null = null;
      try {
        // Post "listening" indicator
        const thinkingRes = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: "_Listening to your voice message..._" }),
        });
        const thinkingData = await thinkingRes.json();
        if (thinkingData.ok) thinkingTs = thinkingData.ts;

        const audioRes = await fetch(url, {
          headers: { Authorization: `Bearer ${botToken}` },
        });
        if (!audioRes.ok) throw new Error(`Audio download failed: ${audioRes.status}`);
        const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

        const result = await processVoiceMessage({
          tenantId,
          channel: `slack:${channel}`,
          audioBuffer,
          audioMimeType: audioFile.mimetype,
          audioFilename: audioFile.name ?? "voice.webm",
        });

        // Delete thinking message
        if (thinkingTs) {
          fetch("https://slack.com/api/chat.delete", {
            method: "POST",
            headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel, ts: thinkingTs }),
          }).catch(() => {});
        }

        // Upload audio response to Slack
        const formData = new FormData();
        formData.append("channels", channel);
        formData.append("initial_comment", `_Voice reply (transcript: "${result.transcript.slice(0, 100)}${result.transcript.length > 100 ? "..." : ""}")_`);
        formData.append("filename", "response.mp3");
        formData.append("file", new File([await fetch(result.audioUrl).then(r => r.arrayBuffer())], "response.mp3", { type: "audio/mpeg" }));

        await fetch("https://slack.com/api/files.upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${botToken}` },
          body: formData,
        });

        // Also send text version as a fallback
        const slackText = result.responseText
          .replace(/\*\*(.+?)\*\*/g, "*$1*")
          .replace(/^#{1,3}\s+(.+)$/gm, "*$1*")
          .replace(/^- /gm, "• ");

        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: slackText }),
        });
      } catch (err: any) {
        console.error(`[Slack] Voice error: ${err?.message}`);
        if (thinkingTs) {
          fetch("https://slack.com/api/chat.delete", {
            method: "POST",
            headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ channel, ts: thinkingTs }),
          }).catch(() => {});
        }
        await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, text: "Sorry, I couldn't process that voice message. Please try again or send a text." }),
        });
      }
      return NextResponse.json({ ok: true });
    }
  }

  // ─── Download images ────────────────────────────────────────────────

  const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];
  for (const file of files) {
    if (!file.mimetype?.startsWith("image/")) continue;
    const url = file.url_private_download ?? file.url_private;
    if (!url) continue;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        imageBuffers.push({ buffer, mimeType: file.mimetype, filename: file.name ?? "image.jpg" });
      }
    } catch (err: any) {
      console.error(`[Slack] Download failed: ${err?.message}`);
    }
  }

  // Send a temporary "analyzing" message, then replace it with the real response
  let analyzingTs: string | null = null;
  try {
    const typingRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: "_Analyzing crash photos..._" }),
    });
    const typingData = await typingRes.json();
    if (typingData.ok) analyzingTs = typingData.ts;
  } catch {}

  try {
    const response = await handleSlackMessage({
      tenantId,
      userMessage,
      channel: `slack:${channel}`,
      imageBuffers: imageBuffers.length > 0 ? imageBuffers : undefined,
    });

    // Store analysis report if images were analyzed
    if (response.analysisResults && response.analysisResults.length > 0) {
      const { buildTemplatePlaceholders } = await import("@/lib/services/silent-witness-client");
      const { renderTemplate, getDefaultTemplate } = await import("@/lib/services/email-template");
      const r = response.analysisResults[0];
      const placeholders = buildTemplatePlaceholders(r, { customerName: event.user });
      const html = renderTemplate(getDefaultTemplate(), placeholders);
      const imageData = imageBuffers.map((img) => ({
        base64: img.buffer.toString("base64"),
        mimeType: img.mimeType,
        filename: img.filename,
      }));
      await prisma.analysisReport.create({
        data: {
          tenantId,
          sourceType: "SLACK",
          sourceRef: `${event.user}@${channel}`,
          subject: userMessage || null,
          imageCount: imageBuffers.length,
          imageData: imageData as any,
          resultJson: r as any,
          placeholders: placeholders as any,
          renderedHtml: html,
        },
      }).catch(() => {});
    }

    // Delete the "analyzing" message
    if (analyzingTs) {
      fetch("https://slack.com/api/chat.delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ts: analyzingTs }),
      }).catch(() => {});
    }

    const slackText = response.text
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      .replace(/^#{1,3}\s+(.+)$/gm, "*$1*")
      .replace(/^- /gm, "• ");

    const postBody: any = { channel, text: slackText };
    if (response.slackBlocks && response.slackBlocks.length > 0) {
      postBody.blocks = response.slackBlocks;
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(postBody),
    });
  } catch (err: any) {
    console.error(`[Slack] Error: ${err?.message}`);
    if (analyzingTs) {
      fetch("https://slack.com/api/chat.delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ts: analyzingTs }),
      }).catch(() => {});
    }
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: "Sorry, I encountered an error. Please try again." }),
    });
  }

  return NextResponse.json({ ok: true });
}
