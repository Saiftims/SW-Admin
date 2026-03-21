import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { transcribeAudio, textToSpeech, DEFAULT_VOICE_ID } from "./elevenlabs";
import { handleSlackMessage } from "./anthropic-bot";
import { randomUUID } from "crypto";

type VoiceResult = {
  transcript: string;
  responseText: string;
  audioUrl: string;
  audioId: string;
};

/**
 * Full voice pipeline: STT → Claude AI → TTS → store audio.
 * Returns the transcript, response text, and a public URL to the generated audio.
 */
export async function processVoiceMessage(opts: {
  tenantId: string;
  channel: string;
  audioBuffer: Buffer;
  audioMimeType: string;
  audioFilename: string;
}): Promise<VoiceResult> {
  const env = getEnv();

  // 1. Speech-to-Text
  console.log(`[Voice] Transcribing audio (${(opts.audioBuffer.length / 1024).toFixed(0)}KB)...`);
  const stt = await transcribeAudio(opts.audioBuffer, opts.audioMimeType, opts.audioFilename);
  console.log(`[Voice] Transcript: "${stt.text.slice(0, 100)}"`);

  if (!stt.text.trim()) {
    throw new Error("Could not transcribe the voice message. Please try again with clearer audio.");
  }

  // 2. Claude AI response (same bot as text messages)
  // Tag the message as a voice transcription so memory has full context
  const response = await handleSlackMessage({
    tenantId: opts.tenantId,
    userMessage: `[voice message transcription] ${stt.text}`,
    channel: opts.channel,
  });

  const cleanText = normalizeTtsText(
    response.text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#{1,3}\s+(.+)$/gm, "$1")
      .replace(/^[•\-] /gm, "")
      .replace(/\n{3,}/g, "\n\n")
  );

  // 3. Get tenant's selected voice
  const tenant = await prisma.tenant.findUnique({
    where: { id: opts.tenantId },
    select: { voiceId: true },
  });
  const voiceId = tenant?.voiceId || DEFAULT_VOICE_ID;

  // 4. Text-to-Speech
  console.log(`[Voice] Generating TTS with voice ${voiceId}...`);
  const tts = await textToSpeech(cleanText, voiceId);
  console.log(`[Voice] Audio generated (${(tts.buffer.length / 1024).toFixed(0)}KB)`);

  // 5. Store the spoken reply in conversation memory so future interactions have context
  await prisma.conversationMessage.create({
    data: {
      tenantId: opts.tenantId,
      channel: opts.channel,
      role: "assistant",
      content: `[voice reply spoken to user] ${cleanText}`,
    },
  }).catch(() => {});

  // 6. Store audio for public serving
  const audioId = randomUUID();
  await prisma.jobEventHistory.create({
    data: {
      correlationId: `audio:${audioId}`,
      entityType: "voice_response",
      eventType: "AUDIO_GENERATED",
      detailsJson: {
        base64: tts.buffer.toString("base64"),
        mimeType: tts.mimeType,
        filename: tts.filename,
      },
    },
  });

  const audioUrl = `${env.APP_BASE_URL}/api/audio/${audioId}`;

  return {
    transcript: stt.text,
    responseText: response.text,
    audioUrl,
    audioId,
  };
}

/**
 * Replace technical abbreviations and symbols with speech-friendly text
 * so the TTS engine pronounces them correctly.
 */
function normalizeTtsText(text: string): string {
  let out = text
    // Delta-V → "delta vee" (standard verbal pronunciation in accident reconstruction)
    .replace(/Delta[\s-]?V/gi, "delta vee")
    .replace(/ΔV/g, "delta vee")
    // Units — spell out fully so TTS reads them naturally
    .replace(/(\d+)\s*mph/gi, "$1 miles per hour")
    .replace(/(\d+)\s*km\/h/gi, "$1 kilometers per hour")
    .replace(/(\d+)\s*kph/gi, "$1 kilometers per hour")
    .replace(/(\d+)\s*m\/s/gi, "$1 meters per second")
    .replace(/(\d+)\s*ft\/s/gi, "$1 feet per second")
    .replace(/(\d+)\s*lbs?\.?(?=\s|$)/gi, "$1 pounds")
    .replace(/(\d+)\s*kg(?=\s|$)/gi, "$1 kilograms")
    .replace(/(\d+)\s*kN/g, "$1 kilonewtons")
    .replace(/(\d+)\s*ms(?=\s|$)/gi, "$1 milliseconds")
    // Acronyms — spell out letter-by-letter
    .replace(/\bAIS\b/g, "A I S")
    .replace(/\bPDOF\b/g, "P D O F")
    .replace(/\bCDR\b/g, "C D R")
    .replace(/\bEDR\b/g, "E D R")
    // Ranges — spoken form
    .replace(/(\d+)\s*[–—-]\s*(\d+)/g, "$1 to $2")
    // Percentage
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent")
    // Strip markdown artifacts that survived earlier cleaning
    .replace(/[*_#`]/g, "")
    // Collapse bullet/list line breaks into flowing sentences
    .replace(/\n+/g, ". ")
    // Remove stray colons at end of phrases (they cause pauses)
    .replace(/:\s*\./g, ".")
    .replace(/:\s*$/gm, ".")
    // Collapse repeated punctuation and whitespace
    .replace(/\.{2,}/g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Ensure the text ends with a period for natural sentence-final intonation
  if (out && !/[.!?]$/.test(out)) out += ".";

  return out;
}
