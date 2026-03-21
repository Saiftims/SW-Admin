import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const { tenantId } = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { voiceId: true },
    });

    return NextResponse.json({ voiceId: tenant?.voiceId ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: e?.status ?? 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const { tenantId } = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId });

    const body = await req.json();
    const voiceId = body.voiceId ?? null;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { voiceId },
    });

    return NextResponse.json({ ok: true, voiceId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: e?.status ?? 500 });
  }
}
