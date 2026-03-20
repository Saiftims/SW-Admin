import { App, LogLevel } from "@slack/bolt";
import { prisma } from "@/lib/db";
import { handleSlackMessage } from "@/lib/services/anthropic-bot";

let apps: Map<string, App> = new Map();

export async function startSlackBotForTenant(tenantId: string) {
  const config = await prisma.slackConfig.findFirst({
    where: { tenantId },
  });

  if (!config) {
    console.error(`[Slack] No config found for tenant ${tenantId}`);
    return null;
  }

  // Decrypt tokens (stored as plaintext for scaffold; encrypt in production)
  const botToken = config.botTokenEncrypted;
  const signingSecret = config.signingSecretEncrypted;
  const appToken = config.appTokenEncrypted;

  if (!botToken || !signingSecret) {
    console.error(`[Slack] Missing bot token or signing secret for tenant ${tenantId}`);
    return null;
  }

  // If already running, stop it first
  if (apps.has(tenantId)) {
    try {
      await apps.get(tenantId)!.stop();
    } catch {}
    apps.delete(tenantId);
  }

  const app = new App({
    token: botToken,
    signingSecret,
    appToken: appToken ?? undefined,
    socketMode: !!appToken,
    logLevel: LogLevel.DEBUG,
  });

  // Log all incoming events for debugging
  app.use(async (args) => {
    const event = (args as any).event;
    console.log(`[Slack] Event received:`, event?.type ?? "unknown");
    await args.next();
  });

  // Handle all messages mentioning the bot or in DMs
  app.event("message", async ({ event, client }) => {
    console.log(`[Slack] Message event:`, JSON.stringify(event).slice(0, 300));
    if ((event as any).bot_id || (event as any).subtype === "bot_message") return;

    const messageEvent = event as any;
    const channel = messageEvent.channel;
    const userMessage = messageEvent.text ?? "";
    const files = messageEvent.files ?? [];

    const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];
    for (const file of files) {
      if (!file.mimetype?.startsWith("image/")) continue;
      if (!file.url_private_download && !file.url_private) continue;
      try {
        const downloadUrl = file.url_private_download ?? file.url_private;
        const res = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${botToken}` },
        });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          imageBuffers.push({ buffer, mimeType: file.mimetype, filename: file.name ?? "image.jpg" });
        }
      } catch (err) {
        console.error(`[Slack] Failed to download file: ${file.name}`, err);
      }
    }

    try {
      const response = await handleSlackMessage({
        tenantId,
        userMessage,
        imageBuffers: imageBuffers.length > 0 ? imageBuffers : undefined,
      });

      // Post directly to the channel (not the assistant thread) so it shows in the main conversation
      if (response.slackBlocks && response.slackBlocks.length > 0) {
        await client.chat.postMessage({
          channel,
          text: response.text,
          blocks: [
            ...response.slackBlocks,
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: response.text } },
          ],
        });
      } else {
        await client.chat.postMessage({
          channel,
          text: response.text,
          mrkdwn: true,
        });
      }
    } catch (err: any) {
      const errMsg = err?.message ?? String(err);
      console.error(`[Slack] Error handling message for tenant ${tenantId}: ${errMsg}`);
      console.error(err?.stack);
      await client.chat.postMessage({
        channel,
        text: `Sorry, I encountered an error processing your request. Please try again.\n\n_Debug: ${errMsg}_`,
      });
    }
  });

  // Handle app_mention events
  app.event("app_mention", async ({ event, client }) => {
    const channel = (event as any).channel;
    const userMessage = (event as any).text ?? "";
    const files = (event as any).files ?? [];

    const imageBuffers: { buffer: Buffer; mimeType: string; filename: string }[] = [];
    for (const file of files) {
      if (!file.mimetype?.startsWith("image/")) continue;
      try {
        const downloadUrl = file.url_private_download ?? file.url_private;
        const res = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${botToken}` },
        });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          imageBuffers.push({ buffer, mimeType: file.mimetype, filename: file.name ?? "image.jpg" });
        }
      } catch (err) {
        console.error(`[Slack] Failed to download file: ${file.name}`, err);
      }
    }

    try {
      const response = await handleSlackMessage({
        tenantId,
        userMessage,
        imageBuffers: imageBuffers.length > 0 ? imageBuffers : undefined,
      });

      if (response.slackBlocks && response.slackBlocks.length > 0) {
        await client.chat.postMessage({
          channel,
          text: response.text,
          blocks: [
            ...response.slackBlocks,
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: response.text } },
          ],
        });
      } else {
        await client.chat.postMessage({ channel, text: response.text, mrkdwn: true });
      }
    } catch (err) {
      console.error(`[Slack] Error handling mention for tenant ${tenantId}:`, err);
      await client.chat.postMessage({ channel, text: "Sorry, I encountered an error. Please try again." });
    }
  });

  try {
    if (appToken) {
      await app.start();
      console.log(`[Slack] ✅ Bot started (Socket Mode) for tenant ${tenantId}`);
    } else {
      console.log(`[Slack] ⚠️ No app-level token — bot will only work via Events API webhook`);
    }
    apps.set(tenantId, app);

    // Update config status
    await prisma.slackConfig.update({
      where: { id: config.id },
      data: {
        verificationStatus: "HEALTHY",
        lastVerifiedAt: new Date(),
      },
    });

    return app;
  } catch (err) {
    console.error(`[Slack] Failed to start bot for tenant ${tenantId}:`, err);
    await prisma.slackConfig.update({
      where: { id: config.id },
      data: {
        verificationStatus: "ERROR",
        errorMessage: (err as Error)?.message ?? "Failed to start",
      },
    });
    return null;
  }
}

export async function stopSlackBotForTenant(tenantId: string) {
  const app = apps.get(tenantId);
  if (app) {
    await app.stop();
    apps.delete(tenantId);
    console.log(`[Slack] Stopped bot for tenant ${tenantId}`);
  }
}

export async function startAllSlackBots() {
  const configs = await prisma.slackConfig.findMany({
    select: { tenantId: true },
  });

  for (const config of configs) {
    await startSlackBotForTenant(config.tenantId);
  }

  console.log(`[Slack] Started bots for ${configs.length} tenants`);
}
