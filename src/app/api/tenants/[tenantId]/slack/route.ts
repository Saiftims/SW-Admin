import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

const SlackConfigSchema = z.object({
  botToken: z.string().min(1),
  signingSecret: z.string().min(1),
  appToken: z.string().optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const config = await prisma.slackConfig.findUnique({
    where: { tenantId: params.tenantId },
    select: {
      id: true,
      tenantId: true,
      verificationStatus: true,
      errorMessage: true,
      lastVerifiedAt: true,
      botTokenEncrypted: true,
      signingSecretEncrypted: true,
      appTokenEncrypted: true,
      createdAt: true,
    },
  });

  const masked = config
    ? {
        ...config,
        botTokenEncrypted: config.botTokenEncrypted ? "••••" + config.botTokenEncrypted.slice(-6) : null,
        signingSecretEncrypted: config.signingSecretEncrypted ? "••••" + config.signingSecretEncrypted.slice(-6) : null,
        appTokenEncrypted: config.appTokenEncrypted ? "••••" + config.appTokenEncrypted.slice(-6) : null,
      }
    : null;

  return NextResponse.json({ config: masked });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const body = await req.json().catch(() => null);
  const parsed = SlackConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { botToken, signingSecret, appToken } = parsed.data;

  // Verify token and get workspace ID
  let workspaceId: string | null = null;
  let botUserId: string | null = null;
  try {
    const authRes = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    });
    const authData = await authRes.json();
    if (authData.ok) {
      workspaceId = authData.team_id ?? null;
      botUserId = authData.user_id ?? null;
    } else {
      return NextResponse.json({ error: `Invalid bot token: ${authData.error}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to verify bot token with Slack." }, { status: 400 });
  }

  const config = await prisma.slackConfig.upsert({
    where: { tenantId: params.tenantId },
    create: {
      tenantId: params.tenantId,
      botTokenEncrypted: botToken,
      signingSecretEncrypted: signingSecret,
      appTokenEncrypted: appToken ?? null,
      workspaceId,
      botUserId,
      verificationStatus: "HEALTHY",
      lastVerifiedAt: new Date(),
    },
    update: {
      botTokenEncrypted: botToken,
      signingSecretEncrypted: signingSecret,
      appTokenEncrypted: appToken ?? null,
      workspaceId,
      botUserId,
      verificationStatus: "HEALTHY",
      errorMessage: null,
      lastVerifiedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, configId: config.id, workspaceId });
}
