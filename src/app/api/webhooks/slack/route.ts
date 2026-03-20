import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleSlackMessage } from "@/lib/services/anthropic-bot";

export const maxDuration = 60;

// In-memory dedupe cache (cleared on cold start, which is fine for serverless)
const processedEvents = new Set<string>();

export async function POST(req: Request) {
  const rawBody = await req.text();
  const body = JSON.parse(rawBody);

  // Handle Slack URL verification challenge
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  // Deduplicate: Slack retries events if we don't respond within 3s
  const eventId = body.event_id;
  if (eventId && processedEvents.has(eventId)) {
    console.log(`[Slack] Duplicate event ${eventId}, skipping`);
    return NextResponse.json({ ok: true });
  }
  if (eventId) {
    processedEvents.add(eventId);
    // Keep cache bounded
    if (processedEvents.size > 500) {
      const first = processedEvents.values().next().value;
      if (first) processedEvents.delete(first);
    }
  }

  const event = body.event;
  if (!event || event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  // Ignore bot messages and message_changed/deleted events
  if (event.bot_id || event.subtype) {
    return NextResponse.json({ ok: true });
  }

  const teamId = body.team_id;
  const channel = event.channel;

  // Find tenant config
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

  console.log(`[Slack] Message from ${event.user}: "${userMessage.slice(0, 50)}" (${files.length} files)`);

  // Download image attachments
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

  // Process and respond
  try {
    const response = await handleSlackMessage({
      tenantId,
      userMessage,
      imageBuffers: imageBuffers.length > 0 ? imageBuffers : undefined,
    });

    const postBody: any = { channel, text: response.text };

    if (response.slackBlocks && response.slackBlocks.length > 0) {
      postBody.blocks = [
        ...response.slackBlocks,
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: response.text } },
      ];
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(postBody),
    });
  } catch (err: any) {
    console.error(`[Slack] Error: ${err?.message}`);
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text: "Sorry, I encountered an error. Please try again." }),
    });
  }

  return NextResponse.json({ ok: true });
}
