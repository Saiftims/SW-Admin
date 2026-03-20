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

async function getTenantContext(tenantId: string) {
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
      take: 20,
    }),
  ]);

  return {
    personality: tenant?.personality ?? "",
    memory: memDoc?.currentVersion?.contentMarkdown ?? "",
    firm: tenant?.firm,
    recentMessages: recentMessages.reverse(),
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
  const ctx = await getTenantContext(tenantId);

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

  // Build system prompt from personality + memory + firm context
  const systemParts: string[] = [];

  if (ctx.personality) {
    systemParts.push(`--- BOT PERSONALITY ---\n${ctx.personality}`);
  }

  if (ctx.memory) {
    systemParts.push(`--- KNOWLEDGE BASE ---\n${ctx.memory}`);
  }

  if (ctx.firm) {
    systemParts.push(`--- FIRM CONTEXT ---\nYou represent: ${ctx.firm.lawFirmName}\nType: ${ctx.firm.counselorType}\nContact: ${ctx.firm.billingEmail} · ${ctx.firm.phoneNumber}\nLocation: ${ctx.firm.city}, ${ctx.firm.state}`);
  }

  if (analysisTexts.length > 0) {
    systemParts.push(`--- ANALYSIS RESULTS FROM SILENT WITNESS API ---
The following crash photo analysis results were just produced. Present them clearly to the user.

STRICT RULES FOR YOUR RESPONSE:
- Present ONLY the data and numbers from the analysis. Be concise.
- Do NOT add legal disclaimers or warnings — the data already includes its own disclaimer.
- Do NOT add "Key Observations", "Legal Considerations", or "Recommended Next Steps" sections.
- Do NOT suggest medical evaluation, expert review, or EDR data.
- Do NOT add any interpretive commentary about what the numbers "mean" legally.
- Keep it short: summarize the data, explain the physics briefly, and stop.

${analysisTexts.join("\n\n---\n\n")}`);
  }

  const systemPrompt = systemParts.join("\n\n") || "You are a helpful crash analysis assistant.";

  // Build messages from conversation history
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of ctx.recentMessages) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
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
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    console.log(`[Anthropic] Response received — ${text.length} chars`);

    // Store conversation in DB
    const channelId = channel ?? "default";
    try {
      await prisma.conversationMessage.createMany({
        data: [
          {
            tenantId,
            channel: channelId,
            role: "user",
            content: userMessage || "(sent images)",
            hasImages: (imageBuffers?.length ?? 0) > 0,
          },
          {
            tenantId,
            channel: channelId,
            role: "assistant",
            content: text,
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
