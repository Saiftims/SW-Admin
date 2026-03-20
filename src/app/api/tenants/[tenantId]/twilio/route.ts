import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

const TwilioConfigSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  phoneNumber: z.string().min(1),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const config = await prisma.twilioConfig.findUnique({
    where: { tenantId: params.tenantId },
  });

  const masked = config
    ? {
        ...config,
        authToken: "••••" + config.authToken.slice(-4),
      }
    : null;

  return NextResponse.json({ config: masked });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const params = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

    const body = await req.json().catch(() => null);
    const parsed = TwilioConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const { accountSid, authToken, phoneNumber } = parsed.data;

    const config = await prisma.twilioConfig.upsert({
      where: { tenantId: params.tenantId },
      create: {
        tenantId: params.tenantId,
        accountSid,
        authToken,
        phoneNumber,
        verificationStatus: "UNKNOWN",
      },
      update: {
        accountSid,
        authToken,
        phoneNumber,
        verificationStatus: "UNKNOWN",
        errorMessage: null,
      },
    });

    return NextResponse.json({ ok: true, configId: config.id });
  } catch (e: any) {
    console.error("[API /tenants/[id]/twilio POST]", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: e?.status ?? 500 });
  }
}
