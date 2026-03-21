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
    const params = await context.params;
    await requireTenantAccessOrThrow({ user, tenantId: params.tenantId });

    const raw = await prisma.analysisReport.findMany({
      where: { tenantId: params.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        sourceType: true,
        sourceRef: true,
        senderPhone: true,
        senderEmail: true,
        subject: true,
        imageCount: true,
        imageData: true,
        resultJson: true,
        createdAt: true,
      },
    });

    const reports = raw.map((r) => ({
      ...r,
      hasImages: Array.isArray(r.imageData) && r.imageData.length > 0,
      imageData: undefined,
    }));

    return NextResponse.json({ reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: e?.status ?? 500 });
  }
}
