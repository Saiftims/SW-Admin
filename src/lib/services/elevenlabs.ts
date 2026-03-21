import { getEnv } from "@/lib/env";

const API_BASE = "https://api.elevenlabs.io/v1";

function headers() {
  return { "xi-api-key": getEnv().ELEVENLABS_API_KEY };
}

// ─── Speech-to-Text (Scribe v2) ─────────────────────────────────────

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ text: string; language: string }> {
  const form = new FormData();
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  form.append("file", new File([blob], filename, { type: mimeType }));

  const res = await fetch(`${API_BASE}/speech-to-text`, {
    method: "POST",
    headers: headers(),
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs STT failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return {
    text: data.text ?? "",
    language: data.language_code ?? "en",
  };
}

// ─── Text-to-Speech ─────────────────────────────────────────────────

export async function textToSpeech(
  text: string,
  voiceId: string,
  outputFormat = "mp3_44100_128"
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const res = await fetch(
    `${API_BASE}/text-to-speech/${voiceId}?output_format=${outputFormat}&optimize_streaming_latency=2`,
    {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          speed: 1.0,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const ext = outputFormat.startsWith("mp3") ? "mp3" : outputFormat.split("_")[0];
  const mime = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: mime,
    filename: `response.${ext}`,
  };
}

// ─── List Voices ────────────────────────────────────────────────────

export type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category: string;
  description: string | null;
  preview_url: string | null;
  labels: Record<string, string>;
};

export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${API_BASE}/voices`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs list voices failed (${res.status})`);
  }

  const data = await res.json();
  return (data.voices ?? []).map((v: any) => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category ?? "premade",
    description: v.description ?? v.labels?.description ?? null,
    preview_url: v.preview_url ?? null,
    labels: v.labels ?? {},
  }));
}

// ─── Default voice (fallback) ───────────────────────────────────────

export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // "George" — professional male
