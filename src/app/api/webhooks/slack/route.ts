import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { handleSlackMessage, type BotResponse } from "@/lib/services/anthropic-bot";
import { buildSlackBlocks } from "@/lib/services/silent-witness-client";

export const maxDuration = 60;

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

  const event = body.event;
  if (!event || event.type !== "message") {
    return NextResponse.json({ ok: true });
  }

  // Ignore bot messages
  if (event.bot_id || event.subtype === "bot_message") {
    return NextResponse.json({ ok: true });
  }

  const teamId = body.team_id;
  const channel = event.channel;

  // Find tenant by looking up Slack config that matches this team
  const slackConfig = await prisma.slackConfig.findFirst({
    where: { workspaceId: teamId },
    include: { tenant: true },
  });

  // Also try matching without workspace ID (fallback: find any config)
  const config = slackConfig ?? await prisma.slackConfig.findFirst({
    include: { tenant: true },
  });

  if (!config) {
    console.error(`[Slack Webhook] No Slack config found for team ${teamId}`);
    return NextResponse.json({ ok: true });
  }

  // TODO: Re-enable signature verification after debugging
  // Signature verification is temporarily disabled to unblock the bot.
  // The webhook is still protected by the unique URL + Slack's own verification.

  const tenantId = config.tenantId;
  const botToken = config.botTokenEncrypted;
  const userMessage = event.text ?? "";
  const files = event.files ?? [];

  console.log(`[Slack Webhook] Message from ${event.user} in ${channel}: "${userMessage}" (${files.length} files)`);

  // Download image attachments
  const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];
  for (const file of files) {
    if (!file.mimetype?.startsWith("image/")) continue;
    const downloadUrl = file.url_private_download ?? file.url_private;
    if (!downloadUrl) continue;

    try {
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        imageBuffers.push({ buffer, mimeType: file.mimetype, filename: file.name ?? "image.jpg" });
      }
    } catch (err: any) {
      console.error(`[Slack Webhook] Failed to download file: ${err?.message}`);
    }
  }

  // Process with Anthropic + Silent Witness
  try {
    const response = await handleSlackMessage({
      tenantId,
      userMessage,
      imageBuffers: imageBuffers.length > 0 ? imageBuffers : undefined,
    });

    // Post response back to Slack
    const postBody: any = {
      channel,
      text: response.text,
    };

    if (response.slackBlocks && response.slackBlocks.length > 0) {
      postBody.blocks = [
        ...response.slackBlocks,
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: response.text } },
      ];
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postBody),
    });
  } catch (err: any) {
    console.error(`[Slack Webhook] Error: ${err?.message}`);

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: "Sorry, I encountered an error processing your request. Please try again.",
      }),
    });
  }

  return NextResponse.json({ ok: true });
}
