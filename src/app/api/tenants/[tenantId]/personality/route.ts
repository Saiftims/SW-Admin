import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

const UpdateSchema = z.object({
  personality: z.string(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  const user = await requireAuthedUser();
  const params = await context.params;
  await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { personality: true },
  });

  return NextResponse.json({ personality: tenant?.personality ?? "" });
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const params = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

    const body = await req.json().catch(() => null);
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    await prisma.tenant.update({
      where: { id: params.tenantId },
      data: { personality: parsed.data.personality },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
