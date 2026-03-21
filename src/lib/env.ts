import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default(""),

  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),

  JWT_SECRET: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default("sw_session"),

  ENCRYPTION_KEY_BASE64: z.string().min(1),

  SILENT_WITNESS_PUBLIC_BASE_URL: z.string().min(1),
  SILENT_WITNESS_STAGING_BASE_URL: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),

  GMAIL_USER: z.string().min(1),
  GMAIL_APP_PASSWORD: z.string().min(1),
  GMAIL_IMAP_HOST: z.string().default("imap.gmail.com"),
  GMAIL_IMAP_PORT: z.string().default("993"),
  GMAIL_SMTP_HOST: z.string().default("smtp.gmail.com"),
  GMAIL_SMTP_PORT: z.string().default("465"),

  GMAIL_POLL_INTERVAL_MS: z.string().default("15000"),

  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),

  APP_BASE_URL: z.string().default("http://localhost:3000"),

  ELEVENLABS_API_KEY: z.string().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

let cachedEnv: Env | null = null;

export function clearEnvCache() {
  cachedEnv = null;
}

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  // Trim whitespace/newlines from all env values (Vercel CLI pipes can add trailing newlines)
  const cleanedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) cleanedEnv[key] = value.trim();
  }

  const parsed = EnvSchema.safeParse(cleanedEnv);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => i.path.join("."))
      .filter(Boolean);
    throw new Error(`Missing/invalid environment variables: ${Array.from(new Set(missing)).join(", ")}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

