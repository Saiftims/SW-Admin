import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

const UpdateFirmSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  counselorType: z.string().min(1).optional(),
  lawFirmName: z.string().min(1).optional(),
  billingEmail: z.string().email().optional(),
  phoneNumber: z.string().min(1).optional(),
  streetAddress: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  zipCode: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const params = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

    const body = await req.json().catch(() => null);
    const parsed = UpdateFirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
    }

    const firm = await prisma.firm.findUnique({ where: { tenantId: params.tenantId } });
    if (!firm) {
      return NextResponse.json({ error: "Firm not found." }, { status: 404 });
    }

    const updated = await prisma.firm.update({
      where: { tenantId: params.tenantId },
      data: parsed.data,
    });

    // If law firm name changed, update tenant name too
    if (parsed.data.lawFirmName) {
      await prisma.tenant.update({
        where: { id: params.tenantId },
        data: { name: parsed.data.lawFirmName },
      });
    }

    return NextResponse.json({ firm: updated });
  } catch (e: any) {
    console.error("[API /tenants/[id]/firm PUT]", e);
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: e?.status ?? 500 });
  }
}
