import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuthedUser } from "@/lib/auth/requireAuthedUser";
import { requireTenantAccessOrThrow } from "@/lib/auth/permissions";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ tenantId: string; reportId: string }> }
) {
  try {
    const user = await requireAuthedUser();
    const { tenantId, reportId } = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId });

    const existing = await prisma.analysisReport.findFirst({
      where: { id: reportId, tenantId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    await prisma.analysisReport.delete({ where: { id: reportId } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const code = e?.code;
    const status = code === "FORBIDDEN" ? 403 : e?.status ?? 500;
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status });
  }
}
