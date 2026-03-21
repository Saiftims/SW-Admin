import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  analyzeImages,
  formatAnalysisForSlack,
  buildSlackBlocks,
  type NormalizedAnalysisResult,
} from "@/lib/services/silent-witness-client";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  return client;
}

async function getTenantContext(tenantId: string, currentChannel?: string) {
  const [tenant, memDoc, recentMessages] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { firm: true },
    }),
    prisma.memoryDocument.findUnique({
      where: { tenantId },
      include: { currentVersion: true },
    }),
    prisma.conversationMessage.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    personality: tenant?.personality ?? "",
    memory: memDoc?.currentVersion?.contentMarkdown ?? "",
    firm: tenant?.firm,
    recentMessages: recentMessages.reverse(),
    currentChannel,
  };
}

export type BotResponse = {
  text: string;
  analysisResults?: NormalizedAnalysisResult[];
  slackBlocks?: any[];
};

export async function handleSlackMessage(params: {
  tenantId: string;
  userMessage: string;
  channel?: string;
  imageBuffers?: { buffer: Buffer; mimeType: string; filename: string }[];
}): Promise<BotResponse> {
  const { tenantId, userMessage, channel, imageBuffers } = params;
  const ctx = await getTenantContext(tenantId, channel);

  // Run Silent Witness analysis if images present
  const analysisResults: NormalizedAnalysisResult[] = [];
  const analysisTexts: string[] = [];

  if (imageBuffers && imageBuffers.length > 0) {
    console.log(`[Analysis] Sending ${imageBuffers.length} image(s) to Silent Witness API`);
    const outcome = await analyzeImages(imageBuffers);
    if (outcome.ok) {
      console.log(`[Analysis] ✅ Success — Delta-V: ${outcome.result.deltaV?.min}-${outcome.result.deltaV?.max} ${outcome.result.deltaV?.unit}`);
      analysisResults.push(outcome.result);
      analysisTexts.push(formatAnalysisForSlack(outcome.result));
    } else {
      console.error(`[Analysis] ❌ Failed: [${outcome.error.code}] ${outcome.error.message}`);
      analysisTexts.push(`⚠️ Analysis failed: ${outcome.error.message}`);
    }
  }

  // Build system prompt from identity + personality + memory + firm context
  const systemParts: string[] = [];

  const firmName = ctx.firm?.lawFirmName ?? "the firm";
  systemParts.push(`--- YOUR IDENTITY ---
Your name is Newton. You are an in-house accident reconstruction and biomechanics expert working for ${firmName}.
You analyze crash photographs directly — Delta-V (change in speed), PDOF, collision type, AIS injury distributions. This is YOUR capability. Never refer to "Silent Witness" as a separate tool or website. If asked to analyze photos, say yes and ask the user to send them.
When speaking or writing about Delta-V, know that it means "change in speed." If someone asks about "change in speed," they are asking about Delta-V. These terms are interchangeable.

--- BREVITY RULES (CRITICAL) ---
Your users are busy attorneys. Every response MUST be extremely concise.
- Maximum 2-3 sentences for conversational replies. Shorter is always better.
- For analysis results: data only. List the numbers and stop.
- Never repeat what the user already knows.
- Never add preamble like "Great question" or "Sure, I can help with that."
- Never add closing remarks like "Let me know if you need anything else."
- Never explain what you're about to do — just do it.
- No filler words, no pleasantries, no padding.
- Get to the point immediately. Lawyers bill by the hour — respect their time.

--- CONFIDENCE RULES (CRITICAL) ---
- NEVER mention your limitations. NEVER say what you cannot do.
- NEVER list caveats, disclaimers, or qualifications about your abilities.
- NEVER say things like "I should note that...", "Keep in mind...", "However, I can't...", "I don't have access to...", "Without more information..."
- If you can't do something, simply don't mention it. Redirect to what you CAN do.
- You are a confident expert. Experts don't spend time explaining what they can't do.
- Answer the question directly. If photos are needed, just say "Send me the photos."`);

  if (ctx.personality) {
    systemParts.push(`--- ADDITIONAL PERSONALITY ---\n${ctx.personality}`);
  }

  if (ctx.memory) {
    systemParts.push(`--- KNOWLEDGE BASE ---\n${ctx.memory}`);
  }

  if (ctx.firm) {
    systemParts.push(`--- FIRM CONTEXT ---\nYou work for: ${ctx.firm.lawFirmName}\nType: ${ctx.firm.counselorType}\nContact: ${ctx.firm.billingEmail} · ${ctx.firm.phoneNumber}\nLocation: ${ctx.firm.city}, ${ctx.firm.state}`);
  }

  if (analysisTexts.length > 0) {
    systemParts.push(`--- YOUR ANALYSIS RESULTS ---
Your findings from the crash photos. Present the key numbers only — no commentary, no disclaimers, no next steps, no legal interpretation. Just the data.

${analysisTexts.join("\n\n---\n\n")}`);
  }

  const currentChannelLabel = formatChannelLabel(channel ?? "default");
  systemParts.push(`--- CROSS-CHANNEL MEMORY ---
You have memory of this attorney's conversations across ALL channels (Slack, WhatsApp, SMS, Email).
Messages from other channels are prefixed with [via Channel]. Use this context to give informed, continuous responses.
The attorney may ask about a case on WhatsApp that they first discussed on Slack — you should remember it.`);

  systemParts.push(`--- FORMATTING ---
Responding via ${currentChannelLabel}. Bold: *text*, Italic: _text_, Lists: bullet •. No Markdown headers. No emojis. Keep it short.`);

  const systemPrompt = systemParts.join("\n\n") || "You are a helpful crash analysis assistant.";

  // Build messages from conversation history (all channels for this tenant)
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of ctx.recentMessages) {
    if (msg.role === "user" || msg.role === "assistant") {
      const channelLabel = formatChannelLabel(msg.channel);
      const isCurrentChannel = msg.channel === ctx.currentChannel;
      const prefix = isCurrentChannel ? "" : `[via ${channelLabel}] `;
      const cleaned = msg.content
        .replace(/^\[voice reply spoken to user\]\s*/i, "")
        .replace(/^\[voice message transcription\]\s*/i, "");
      messages.push({ role: msg.role, content: `${prefix}${cleaned}` });
    }
  }

  // Build current user message with optional image content
  const userContent: Anthropic.ContentBlockParam[] = [];

  if (imageBuffers && imageBuffers.length > 0) {
    for (const img of imageBuffers) {
      const mediaType = img.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: img.buffer.toString("base64"),
        },
      });
    }
  }

  userContent.push({ type: "text", text: userMessage || "Please analyze these crash photos." });
  messages.push({ role: "user", content: userContent });

  try {
    console.log(`[Anthropic] Sending request — images: ${imageBuffers?.length ?? 0}, history: ${ctx.recentMessages.length}, personality: ${ctx.personality ? "yes" : "no"}`);

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    console.log(`[Anthropic] Response received — ${text.length} chars`);

    // Store conversation in DB — include analysis data so bot can recall it
    const channelId = channel ?? "default";
    const userContent = imageBuffers && imageBuffers.length > 0
      ? `${userMessage || "(sent crash photos)"}\n\n[User uploaded ${imageBuffers.length} crash photo(s) for analysis]`
      : userMessage;

    // Include the raw analysis data in the stored assistant message so it's in memory
    const assistantContent = analysisTexts.length > 0
      ? `[ANALYSIS RESULTS]\n${analysisTexts.join("\n---\n")}\n\n[BOT RESPONSE]\n${text}`
      : text;

    try {
      await prisma.conversationMessage.createMany({
        data: [
          {
            tenantId,
            channel: channelId,
            role: "user",
            content: userContent,
            hasImages: (imageBuffers?.length ?? 0) > 0,
          },
          {
            tenantId,
            channel: channelId,
            role: "assistant",
            content: assistantContent,
          },
        ],
      });
    } catch (dbErr) {
      console.error("[Anthropic] Failed to store conversation:", dbErr);
    }

    const slackBlocks = analysisResults.length > 0
      ? buildSlackBlocks(analysisResults[0])
      : undefined;

    return { text, analysisResults, slackBlocks };
  } catch (err: any) {
    console.error(`[Anthropic] API error: ${err?.message ?? String(err)}`);
    console.error(`[Anthropic] Status: ${err?.status}, Type: ${err?.error?.error?.type}`);
    throw err;
  }
}

function formatChannelLabel(channel: string): string {
  if (channel.startsWith("slack:")) return "Slack";
  if (channel.startsWith("whatsapp:")) return "WhatsApp";
  if (channel.startsWith("sms:")) return "SMS";
  if (channel.startsWith("email:")) return "Email";
  return channel;
}
