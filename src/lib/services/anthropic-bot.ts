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

async function getMemoryContent(tenantId: string): Promise<string> {
  const doc = await prisma.memoryDocument.findUnique({
    where: { tenantId },
    include: {
      currentVersion: true,
    },
  });

  return doc?.currentVersion?.contentMarkdown ?? DEFAULT_MEMORY;
}

const DEFAULT_MEMORY = `# Silent Witness Bot

You are the Silent Witness assistant. Silent Witness helps personal injury lawyers analyze car crash photographs and accident evidence.

When a user sends crash photos, you analyze them using the Silent Witness Delta-V analysis API. You explain results in a professional, legally-friendly way that PI attorneys can use.

Key concepts:
- **Delta-V (mph)**: Change in vehicle velocity during collision. Higher = more severe.
- **PDOF**: Principal Direction of Force — where the impact came from.
- **G-force**: Peak acceleration in multiples of gravity.
- **AIS (Abbreviated Injury Scale)**: Population-based injury severity probabilities (0=none to 6=fatal).

Always be professional, clear, and helpful. Never make definitive medical diagnoses. Present data as evidence-based analysis.`;

export type BotResponse = {
  text: string;
  analysisResults?: NormalizedAnalysisResult[];
  slackBlocks?: any[];
};

export async function handleSlackMessage(params: {
  tenantId: string;
  userMessage: string;
  imageBuffers?: { buffer: Buffer; mimeType: string; filename: string }[];
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
}): Promise<BotResponse> {
  const { tenantId, userMessage, imageBuffers, conversationHistory } = params;
  const memory = await getMemoryContent(tenantId);

  // If there are images, run Silent Witness analysis first
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

  // Build messages for Claude
  const systemPrompt = [
    memory,
    analysisTexts.length > 0
      ? `\n\n--- ANALYSIS RESULTS FROM SILENT WITNESS API ---\nThe following crash photo analysis results were just produced. Present them clearly to the user.

STRICT RULES FOR YOUR RESPONSE:
- Present ONLY the data and numbers from the analysis. Be concise.
- Do NOT add legal disclaimers or warnings — the data already includes its own disclaimer.
- Do NOT add "Key Observations", "Legal Considerations", or "Recommended Next Steps" sections.
- Do NOT suggest medical evaluation, expert review, or EDR data.
- Do NOT add any interpretive commentary about what the numbers "mean" legally.
- Keep it short: summarize the data, explain the physics briefly, and stop.

${analysisTexts.join("\n\n---\n\n")}`
      : "",
  ].join("");

  const messages: Anthropic.MessageParam[] = [];

  // Add conversation history (last 10 turns max)
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
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
    console.log(`[Anthropic] Sending request — images: ${imageBuffers?.length ?? 0}, text length: ${userMessage.length}, system length: ${systemPrompt.length}`);

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

    // Build Block Kit blocks if we have analysis results
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
